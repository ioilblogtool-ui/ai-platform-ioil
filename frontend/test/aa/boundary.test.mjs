// Sprint 8 Step 1 — 경계·데이터 표시 계산(REL-07, S8-2)과 관계 속성 연산(REL-05·06, S8-1)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { edgeMarks, logicalTrustSets, nodeTrust, resolveBaseView } from '../../lib/aa/boundary.ts';
import { relationSummary, updateRelationAttr } from '../../lib/aa/model-ops.ts';

const require = createRequire(import.meta.url);
const sample = require('../../../backend/lib/aa/templates/sample-reports.js');
const model = () => sample.model();

describe('boundary: 배치안 (확정)', () => {
  it('finds the nearest zone trust through containers', () => {
    const m = model();
    const paas = m.views.find((v) => v.id === 'view_dep_paas');
    assert.equal(nodeTrust(m, paas, 'nd_paas_web_client'), 'external');
    assert.equal(nodeTrust(m, paas, 'nd_paas_backend'), 'internal');
    assert.equal(nodeTrust(m, paas, 'nd_paas_db'), 'data');
  });

  it('marks direct calls across trust levels as confirmed, same level not', () => {
    const marks = edgeMarks(model(), 'view_dep_paas');
    assert.deepEqual(marks.get('rel_paas_web_be'), { boundary: 'confirmed', reason: 'external → internal', dataClass: 'personal' });
    assert.equal(marks.get('rel_paas_be_db').boundary, 'confirmed');
    assert.equal(marks.get('rel_paas_fe_be'), undefined, 'internal → internal (different platforms, same trust)');
  });

  it('does not judge when one end has no zone', () => {
    const m = model();
    const paas = m.views.find((v) => v.id === 'view_dep_paas');
    const be = paas.nodes.find((n) => n.id === 'nd_paas_backend');
    // backend를 구역 밖 최상위로
    delete be.parentId;
    paas.nodes.find((n) => n.id === 'nd_paas_railway').parentId = undefined;
    assert.equal(edgeMarks(m, 'view_dep_paas').get('rel_paas_web_be').boundary, undefined);
  });

  it('two zones of the same trust are not a boundary', () => {
    const m = model();
    m.components.cmp_paas_int2 = { id: 'cmp_paas_int2', type: 'dep.zone', layer: 'deployment', name: 'internal-2', properties: { trust: 'internal' }, requirementIds: [], decisionIds: [] };
    const paas = m.views.find((v) => v.id === 'view_dep_paas');
    paas.nodes.push({ id: 'nd_paas_int2', kind: 'component', componentId: 'cmp_paas_int2', position: { x: 0, y: 400 }, width: 400, height: 200 });
    paas.nodes.find((n) => n.id === 'nd_paas_railway').parentId = 'nd_paas_int2';
    assert.equal(edgeMarks(m, 'view_dep_paas').get('rel_paas_fe_be'), undefined);
  });
});

describe('boundary: Logical (추론·가능)', () => {
  it('derives trust sets from realizes in the base plan', () => {
    const sets = logicalTrustSets(model(), 'view_dep_paas');
    assert.deepEqual([...sets.get('cmp_web_app')].sort(), ['external', 'internal']);
    assert.deepEqual([...sets.get('cmp_reports_api')], ['internal']);
    assert.deepEqual([...sets.get('cmp_reports_db')], ['data']);
  });

  it('disjoint = inferred, overlapping = possible, with reasons and data class together', () => {
    const marks = edgeMarks(model(), 'view_logical', 'view_dep_paas');
    assert.equal(marks.get('rel_api_db').boundary, 'inferred');
    assert.equal(marks.get('rel_api_db').dataClass, 'personal');
    assert.equal(marks.get('rel_api_auth').boundary, 'inferred');
    assert.equal(marks.get('rel_web_api').boundary, 'possible');
    assert.equal(marks.get('rel_web_api').reason, '현재 · PaaS 기준: external·internal → internal');
    assert.equal(marks.get('rel_web_auth').dataClass, 'sensitive');
  });

  it('VM plan: web app has no implementer → no boundary, only data class', () => {
    const marks = edgeMarks(model(), 'view_logical', 'view_dep_vm');
    assert.equal(marks.get('rel_web_api').boundary, undefined);
    assert.equal(marks.get('rel_web_api').dataClass, 'personal');
    assert.equal(marks.get('rel_api_db').boundary, 'inferred');
  });

  it('base plan falls back to the first plan and to none', () => {
    const m = model();
    assert.equal(resolveBaseView(m, 'view_dep_vm'), 'view_dep_vm');
    assert.equal(resolveBaseView(m, 'view_dep_gone'), 'view_dep_paas');
    m.views = m.views.filter((v) => v.kind !== 'deployment');
    assert.equal(resolveBaseView(m, null), null);
    const marks = edgeMarks(m, 'view_logical', null);
    assert.ok([...marks.values()].every((x) => !x.boundary), 'no plans → data class only');
    assert.equal(marks.get('rel_web_api').dataClass, 'personal');
  });
});

describe('관계 속성 연산', () => {
  it('sets, keeps retry 0 and clears each attribute', () => {
    let m = model();
    m = updateRelationAttr(m, 'rel_web_api', 'retryMax', '0');
    assert.deepEqual(m.relations.rel_web_api.retry, { max: 0, backoff: 'fixed' });
    m = updateRelationAttr(m, 'rel_web_api', 'retryBackoff', 'exponential');
    assert.deepEqual(m.relations.rel_web_api.retry, { max: 0, backoff: 'exponential' });
    m = updateRelationAttr(m, 'rel_web_api', 'retryMax', '');
    assert.equal(m.relations.rel_web_api.retry, undefined);
    for (const attr of ['timeoutMs', 'onFailure', 'credential', 'dataClass']) {
      m = updateRelationAttr(m, 'rel_web_api', attr, '');
      assert.equal(attr in m.relations.rel_web_api, false, attr);
    }
  });

  it('rejects invalid values and non-calls relations without changing the model', () => {
    const m = model();
    assert.equal(updateRelationAttr(m, 'rel_web_api', 'timeoutMs', '0'), m);
    assert.equal(updateRelationAttr(m, 'rel_web_api', 'retryMax', '11'), m);
    assert.equal(updateRelationAttr(m, 'rel_web_api', 'credential', 'password'), m);
    assert.equal(updateRelationAttr(m, 'rel_rz_paas_be', 'dataClass', 'personal'), m);
    assert.equal(updateRelationAttr(m, 'rel_web_api', 'timeoutMs', '3000'), m, 'same value → same model');
  });

  it('summarizes attributes for the tooltip', () => {
    assert.equal(relationSummary(model().relations.rel_api_db), 'JDBC · sync · 2s · retry 1 fixed · 실패 시 propagate · service-role · personal');
  });
});
