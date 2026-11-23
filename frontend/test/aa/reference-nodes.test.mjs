// Sprint 8 Step 2 — 참조 노드 (VIEW-05, S8-3)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  addReferenceNode, componentPlacements, deleteSummary, duplicateDeploymentView, referenceCandidates, removeDeploymentView, removeNodes,
} from '../../lib/aa/model-ops.ts';
import { toFlow } from '../../lib/aa/graph-mapper.ts';

const require = createRequire(import.meta.url);
const REGISTRY = require('../../../backend/lib/aa/type-registry.json');
const sample = require('../../../backend/lib/aa/templates/sample-reports.js');
const model = () => sample.model();
let seq = 0;
const newId = (prefix) => `${prefix}_t${String(++seq).padStart(9, '0')}`;

describe('referenceCandidates', () => {
  it('lists orphans first and only types allowed in this view', () => {
    let m = model();
    m = removeNodes(m, 'view_logical', ['nd_auth'], { deleteComponents: false });   // Auth는 고아
    const logical = referenceCandidates(m, 'view_logical', REGISTRY);
    assert.deepEqual(logical.map((c) => [c.componentId, c.orphan]), [['cmp_auth', true]], 'deployment types are not offered in Logical');
    const vm = referenceCandidates(m, 'view_dep_vm', REGISTRY);
    assert.ok(vm.some((c) => c.componentId === 'cmp_paas_db' && c.views[0].label === '현재 · PaaS'));
    assert.ok(!vm.some((c) => c.componentId === 'cmp_vm_db'), 'already in this view');
    assert.ok(!vm.some((c) => c.componentId === 'cmp_web_app'), 'Logical type not allowed in a plan');
  });
});

describe('addReferenceNode', () => {
  it('re-adds an orphan with its properties, requirements and relations intact', () => {
    let m = model();
    m.components.cmp_auth.requirementIds = ['11111111-1111-4111-8111-111111111111'];
    m = removeNodes(m, 'view_logical', ['nd_auth'], { deleteComponents: false });
    const before = structuredClone(m.components.cmp_auth);
    const r = addReferenceNode(m, 'view_logical', 'cmp_auth', REGISTRY, { x: 10, y: 20 }, newId);
    assert.ok(r.nodeId);
    assert.deepEqual(r.model.components.cmp_auth, before);
    assert.ok(r.model.relations.rel_api_auth, 'relations kept');
  });

  it('refuses a second node in the same view and disallowed types', () => {
    const m = model();
    assert.equal(addReferenceNode(m, 'view_logical', 'cmp_web_app', REGISTRY, { x: 0, y: 0 }, newId).model, m);
    assert.equal(addReferenceNode(m, 'view_dep_vm', 'cmp_web_app', REGISTRY, { x: 0, y: 0 }, newId).model, m);
  });

  it('shares a plan component across plans: ⧉ on both, placements, and plan deletion keeps it', () => {
    let m = model();
    m = addReferenceNode(m, 'view_dep_vm', 'cmp_paas_db', REGISTRY, { x: 700, y: 60 }, newId).model;
    assert.deepEqual(componentPlacements(m, 'cmp_paas_db').map((p) => p.viewId), ['view_dep_paas', 'view_dep_vm']);
    const flowVm = toFlow(m, 'view_dep_vm').nodes.find((n) => n.data.componentId === 'cmp_paas_db');
    const flowPaas = toFlow(m, 'view_dep_paas').nodes.find((n) => n.data.componentId === 'cmp_paas_db');
    assert.equal(flowVm.data.sharedViews, 2);
    assert.equal(flowPaas.data.sharedViews, 2);
    assert.equal(toFlow(m, 'view_dep_paas').nodes.find((n) => n.data.componentId === 'cmp_paas_backend').data.sharedViews, undefined);
    const afterDelete = removeDeploymentView(m, 'view_dep_vm');
    assert.ok(afterDelete.components.cmp_paas_db, 'shared component survives deleting one plan');
    assert.ok(!afterDelete.components.cmp_vm_db, 'plan-only component removed');
  });

  it('duplicating a plan makes independent copies (Sprint 7 rule)', () => {
    let m = model();
    m = addReferenceNode(m, 'view_dep_vm', 'cmp_paas_db', REGISTRY, { x: 700, y: 60 }, newId).model;
    const dup = duplicateDeploymentView(m, 'view_dep_vm', '사본', newId, REGISTRY);
    const copy = dup.model.views.find((v) => v.variant === '사본');
    assert.ok(!copy.nodes.some((n) => n.componentId === 'cmp_paas_db'), 'copy gets its own component, not the shared one');
  });
});

describe('삭제: 노드만 / 컴포넌트 전체', () => {
  it('node-only removal leaves other views alone; component delete removes it everywhere', () => {
    let m = model();
    m = addReferenceNode(m, 'view_dep_vm', 'cmp_paas_db', REGISTRY, { x: 700, y: 60 }, newId).model;
    const vmNode = m.views.find((v) => v.id === 'view_dep_vm').nodes.find((n) => n.componentId === 'cmp_paas_db').id;
    const summary = deleteSummary(m, 'view_dep_vm', [vmNode]);
    assert.equal(summary.otherViewCount, 1);
    assert.equal(summary.needsConfirm, true);
    const nodeOnly = removeNodes(m, 'view_dep_vm', [vmNode], { deleteComponents: false });
    assert.ok(nodeOnly.views.find((v) => v.id === 'view_dep_paas').nodes.some((n) => n.componentId === 'cmp_paas_db'));
    const all = removeNodes(m, 'view_dep_vm', [vmNode], { deleteComponents: true });
    assert.ok(!all.components.cmp_paas_db);
    assert.ok(!all.views.some((v) => v.nodes.some((n) => n.componentId === 'cmp_paas_db')));
    assert.ok(!all.relations.rel_paas_be_db && !all.views.some((v) => v.edges.some((e) => e.relationId === 'rel_paas_be_db')));
    assert.ok(!all.relations.rel_rz_paas_db, 'realizes removed too');
  });
});
