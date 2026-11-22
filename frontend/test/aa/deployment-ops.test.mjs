// Sprint 7 Step 1 — 배치안·컨테이너·realizes 순수 연산 (03 V2·V5·V13, 04 §6.10)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  absolutePosition, addComponent, addDeploymentView, canSetParent, deploymentViewSummary, duplicateDeploymentView,
  findDropGroup, MAX_DEPLOYMENT_VIEWS, removeDeploymentView, removeNodes, renameDeploymentView, runLocations,
  setParent, setRealizes, setStrategy, STRATEGY_TEMPLATE, realizesTargets,
} from '../../lib/aa/model-ops.ts';

const require = createRequire(import.meta.url);
const REGISTRY = require('../../../backend/lib/aa/type-registry.json');

function idGen() {
  let n = 0;
  return (prefix) => `${prefix}_${String(++n).padStart(10, '0')}`;
}
function baseModel() {
  return {
    schemaVersion: 1,
    components: {
      cmp_api: { id: 'cmp_api', type: 'service', layer: 'logical', name: 'Reports API', properties: {}, requirementIds: [], decisionIds: [] },
      cmp_web: { id: 'cmp_web', type: 'client', layer: 'logical', name: 'Web App', properties: {}, requirementIds: [], decisionIds: [] },
    },
    relations: {},
    views: [{ id: 'view_logical', kind: 'logical', name: 'Logical', nodes: [
      { id: 'nd_api', kind: 'component', componentId: 'cmp_api', position: { x: 0, y: 0 } },
      { id: 'nd_web', kind: 'component', componentId: 'cmp_web', position: { x: 200, y: 0 } },
    ], edges: [] }],
  };
}
/** 배치안 하나: Railway(platform) 안 backend(process) → Reports API */
function withPaas() {
  const newId = idGen();
  let { model, viewId } = addDeploymentView(baseModel(), '현재 · PaaS', newId);
  const plat = addComponent(model, viewId, 'dep.platform', REGISTRY, { x: 100, y: 100 }, newId);
  model = plat.model;
  const proc = addComponent(model, viewId, 'dep.process', REGISTRY, { x: 150, y: 160 }, newId);
  model = setParent(proc.model, viewId, proc.nodeId, plat.nodeId, REGISTRY);
  model = setRealizes(model, REGISTRY, proc.componentId, 'cmp_api', true, newId);
  return { model, viewId, newId, plat, proc };
}
const view = (m, id) => m.views.find((v) => v.id === id);

describe('배치안 추가·이름·전략', () => {
  it('adds a deployment view with the strategy template and enforces name rules and the limit', () => {
    const newId = idGen();
    const r = addDeploymentView(baseModel(), '  현재 · PaaS  ', newId);
    const v = view(r.model, r.viewId);
    assert.match(r.viewId, /^view_dep_/);
    assert.deepEqual([v.kind, v.name, v.variant, v.strategyMd], ['deployment', 'Deployment', '현재 · PaaS', STRATEGY_TEMPLATE]);
    assert.equal(addDeploymentView(r.model, '현재 · PaaS', newId).error, '같은 이름의 배치안이 있습니다.');
    assert.ok(addDeploymentView(r.model, '', newId).error);
    assert.ok(addDeploymentView(r.model, 'x'.repeat(61), newId).error);
    let m = r.model;
    for (let i = 2; i <= MAX_DEPLOYMENT_VIEWS; i++) m = addDeploymentView(m, `안 ${i}`, newId).model;
    assert.match(addDeploymentView(m, '6번째', newId).error, /최대 5개/);
  });

  it('renames with the same rules and only variant changes', () => {
    const { model, viewId, newId } = withPaas();
    const r = renameDeploymentView(model, viewId, '운영 · PaaS');
    assert.equal(view(r.model, viewId).variant, '운영 · PaaS');
    assert.equal(view(r.model, viewId).name, 'Deployment');
    const two = addDeploymentView(r.model, '대안', newId).model;
    assert.ok(renameDeploymentView(two, viewId, '대안').error);
    assert.equal(renameDeploymentView(r.model, viewId, '운영 · PaaS').model, r.model, 'no change → same model');
  });

  it('sets and clears the strategy (empty = absent)', () => {
    const { model, viewId } = withPaas();
    const a = setStrategy(model, viewId, '## 승인\n- 운영: 팀장');
    assert.equal(view(a, viewId).strategyMd, '## 승인\n- 운영: 팀장');
    const b = setStrategy(a, viewId, '');
    assert.equal('strategyMd' in view(b, viewId), false);
    assert.equal(setStrategy(model, 'view_logical', 'x'), model, 'only deployment views');
  });
});

describe('컨테이너 컴포넌트 (V5)', () => {
  it('lets platform/VM components contain nodes in deployment views only', () => {
    const { model, viewId, plat, proc } = withPaas();
    const v = view(model, viewId);
    assert.equal(v.nodes.find((n) => n.id === proc.nodeId).parentId, plat.nodeId);
    assert.deepEqual(v.nodes.find((n) => n.id === plat.nodeId).position, { x: 100, y: 100 });
    assert.ok(v.nodes.find((n) => n.id === plat.nodeId).width >= 80, 'containers get a size');
    assert.deepEqual(absolutePosition(v, proc.nodeId), { x: 150, y: 160 }, 'absolute position kept');
    assert.equal(findDropGroup(model, viewId, { x: 120, y: 120 }, undefined, REGISTRY), plat.nodeId);
    assert.equal(findDropGroup(model, viewId, { x: 120, y: 120 }), null, 'without registry only groups (Sprint 6 behavior)');
    // 일반 컴포넌트(process)는 부모가 될 수 없다, 자기 자신·순환도 안 된다
    assert.equal(canSetParent(model, viewId, plat.nodeId, proc.nodeId, REGISTRY), false);
    assert.equal(canSetParent(model, viewId, plat.nodeId, plat.nodeId, REGISTRY), false);
    // Logical View에서는 컴포넌트가 부모가 될 수 없다
    assert.equal(canSetParent(model, 'view_logical', 'nd_api', 'nd_web', REGISTRY), false);
  });

  it('deleting a container lifts children with their absolute position', () => {
    const { model, viewId, plat, proc } = withPaas();
    const after = removeNodes(model, viewId, [plat.nodeId], { deleteComponents: true });
    const v = view(after, viewId);
    const p = v.nodes.find((n) => n.id === proc.nodeId);
    assert.equal(p.parentId, undefined, 'no dangling parentId');
    assert.deepEqual(p.position, { x: 150, y: 160 });
    assert.equal(after.components[plat.componentId], undefined);
  });
});

describe('realizes (V2)', () => {
  it('links implementers to Logical components only, without duplicates or edges', () => {
    const { model, viewId, proc, plat, newId } = withPaas();
    assert.deepEqual(realizesTargets(model, proc.componentId), ['cmp_api']);
    const rel = Object.values(model.relations).find((r) => r.type === 'realizes');
    assert.deepEqual([rel.from, rel.to, rel.protocol, rel.mode], [proc.componentId, 'cmp_api', undefined, undefined]);
    assert.equal(view(model, viewId).edges.length, 0, 'no canvas edge');
    assert.equal(setRealizes(model, REGISTRY, proc.componentId, 'cmp_api', true, newId), model, 'duplicate');
    assert.equal(setRealizes(model, REGISTRY, plat.componentId, 'cmp_api', true, newId), model, 'platform cannot implement');
    assert.equal(setRealizes(model, REGISTRY, 'cmp_api', proc.componentId, true, newId), model, 'reverse direction');
    const off = setRealizes(model, REGISTRY, proc.componentId, 'cmp_api', false, newId);
    assert.deepEqual(realizesTargets(off, proc.componentId), []);
  });

  it('reports run locations per deployment view', () => {
    const { model, viewId, proc } = withPaas();
    const named = structuredClone(model);
    named.components[proc.componentId].name = 'backend (node)';
    named.components[proc.componentId].properties.instances = 1;
    const locs = runLocations(named, 'cmp_api');
    assert.equal(locs.length, 1);
    assert.deepEqual({ ...locs[0], nodeId: undefined }, { viewId, variant: '현재 · PaaS', nodeId: undefined, implementer: 'backend (node)', container: 'Platform (PaaS) 1', instances: 1 });
    assert.deepEqual(runLocations(named, 'cmp_web'), []);
  });
});

describe('배치안 복제·삭제', () => {
  it('duplicates with independent deployment ids, shared Logical ids and remapped parents/relations', () => {
    const { model, viewId, plat, proc, newId } = withPaas();
    const r = duplicateDeploymentView(model, viewId, '대안', newId);
    assert.ok(r.viewId);
    const src = view(r.model, viewId), dup = view(r.model, r.viewId);
    assert.equal(dup.nodes.length, src.nodes.length);
    const ids = new Set(src.nodes.map((n) => n.id));
    assert.ok(dup.nodes.every((n) => !ids.has(n.id)), 'node ids independent');
    const dupProc = dup.nodes.find((n) => n.parentId);
    const dupPlat = dup.nodes.find((n) => !n.parentId);
    assert.equal(dupProc.parentId, dupPlat.id, 'parent remapped');
    assert.notEqual(dupProc.componentId, proc.componentId, 'deployment component copied');
    assert.notEqual(dupPlat.componentId, plat.componentId);
    assert.deepEqual(realizesTargets(r.model, dupProc.componentId), ['cmp_api'], 'Logical target shared');
    assert.equal(runLocations(r.model, 'cmp_api').length, 2);
    // 복제본 수정이 원본을 바꾸지 않는다
    const edited = structuredClone(r.model);
    edited.components[dupProc.componentId].name = 'api (vm)';
    assert.notEqual(edited.components[proc.componentId].name, 'api (vm)');
    assert.equal(r.model.components.cmp_api.name, 'Reports API');
  });

  it('deletes only what the removed deployment view owns', () => {
    const { model, viewId, proc, plat, newId } = withPaas();
    const dup = duplicateDeploymentView(model, viewId, '대안', newId);
    const summary = deploymentViewSummary(dup.model, viewId);
    assert.equal(summary.ownComponents, 2);
    assert.equal(summary.realizedLogical, 1);
    assert.deepEqual(summary.unrealizedLogical, ['Web App']);
    const after = removeDeploymentView(dup.model, viewId);
    assert.equal(view(after, viewId), undefined);
    assert.equal(after.components[proc.componentId], undefined);
    assert.equal(after.components[plat.componentId], undefined);
    assert.ok(after.components.cmp_api, 'Logical kept');
    assert.equal(Object.values(after.relations).filter((r) => r.type === 'realizes').length, 1, 'only the copy realizes remains');
    assert.equal(view(after, dup.viewId).nodes.length, 2, 'other deployment view untouched');
    assert.equal(removeDeploymentView(dup.model, 'view_logical'), dup.model, 'Logical cannot be removed');
  });
});
