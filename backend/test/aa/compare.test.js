// Sprint 7 Step 4 — Version Compare (S7-6): 상세 변경 목록 + GET /architecture/compare
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const sample = require('../../lib/aa/templates/sample-reports');
const { diffModels } = require('../../lib/aa/graph-diff');
const { buildSnapshot } = require('../../lib/aa/requirements-snapshot');
const { dbSkipReason, getTokens, deleteProjects, api, TEST_PREFIX } = require('../helpers/aa-api');

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const R3 = '33333333-3333-4333-8333-333333333333';
const links = { nfr_latency: R1, nfr_db_availability: R2, fr_monthly_report: R3 };
const reqs = () => [
  { id: R1, code: 'NFR-001', kind: 'nfr', category: 'performance', title: '응답 시간', target: 'p95 < 300ms', metric: 'p95', priority: 'must' },
  { id: R2, code: 'NFR-002', kind: 'nfr', category: 'availability', title: 'DB 가용성', target: '99.9%', metric: '월간', priority: 'should' },
  { id: R3, code: 'FR-001', kind: 'fr', category: null, title: '월별 리포트', target: null, metric: null, priority: 'must' },
];
const base = () => sample.model(links);
const diff = (a, b, opts, ra = reqs(), rb = reqs()) =>
  diffModels({ model: a, snapshot: buildSnapshot(a, ra) }, { model: b, snapshot: buildSnapshot(b, rb) }, opts).changes;
const kinds = (changes) => changes.map((c) => c.kind).sort();

describe('graph-diff: diffModels', () => {
  it('returns nothing for identical models and hides layout unless asked', () => {
    const a = base();
    const b = structuredClone(a);
    assert.deepEqual(diff(a, b), []);
    b.views[0].nodes[0].position = { x: 999, y: 1 };
    b.views.find((v) => v.id === 'view_dep_paas').nodes.find((n) => n.width).width += 40;
    assert.deepEqual(diff(a, b), [], 'layout hidden by default');
    assert.deepEqual(kinds(diff(a, b, { includeLayout: true })), ['layout.moved', 'layout.resized']);
  });

  it('lists component add/remove/modify with field paths', () => {
    const a = base();
    const b = structuredClone(a);
    b.components.cmp_reports_api.technology = 'Go';
    b.components.cmp_reports_api.properties.replicas = 3;
    b.components.cmp_cache = { id: 'cmp_cache', type: 'cache', layer: 'logical', name: 'Redis', properties: {}, requirementIds: [], decisionIds: [] };
    b.views[0].nodes.push({ id: 'nd_cache', kind: 'component', componentId: 'cmp_cache', position: { x: 0, y: 0 } });
    const changes = diff(a, b);
    const mod = changes.find((c) => c.kind === 'component.modified');
    assert.deepEqual(mod.fields.map((f) => f.path), ['technology', 'properties.replicas']);
    assert.equal(mod.fields[0].after, 'Go');
    const added = changes.find((c) => c.kind === 'component.added');
    assert.deepEqual([added.name, added.viewIds], ['Redis', ['view_logical']]);
    assert.ok(changes.some((c) => c.kind === 'view.node.added' && c.nodeId === 'nd_cache'));
  });

  it('reports requirement links added/removed as codes, for components and relations', () => {
    const a = base();
    const b = structuredClone(a);
    b.components.cmp_reports_db.requirementIds = [];
    const rel = Object.values(b.relations).find((r) => r.type === 'calls' && r.requirementIds.length === 0);
    rel.requirementIds = [R3];
    const changes = diff(a, b);
    const c = changes.find((x) => x.kind === 'component.requirements');
    assert.deepEqual([c.name, c.added, c.removed], ['Reports DB', [], ['NFR-002']]);
    const r = changes.find((x) => x.kind === 'relation.requirements');
    assert.deepEqual([r.relationId, r.added, r.removed], [rel.id, ['FR-001'], []]);
    assert.ok(!changes.some((x) => x.kind === 'component.modified'), 'link change is not a field change');
  });

  it('shows a variant-only change as view.renamed (U-approval)', () => {
    const a = base();
    const b = structuredClone(a);
    b.views.find((v) => v.id === 'view_dep_vm').variant = '대안 · VM×3 + LB';
    assert.deepEqual(diff(a, b), [{ kind: 'view.renamed', viewId: 'view_dep_vm', viewKind: 'deployment', before: '대안 · VM×2 + LB', after: '대안 · VM×3 + LB' }]);
  });

  it('distinguishes strategy modified / removed / added', () => {
    const a = base();
    const b = structuredClone(a);
    b.views.find((v) => v.id === 'view_dep_paas').strategyMd += '\n- 추가';
    b.views.find((v) => v.id === 'view_dep_vm').strategyMd = '';
    const changes = diff(a, b);
    assert.deepEqual(changes.map((c) => [c.kind, c.viewId, c.change]), [['view.strategy', 'view_dep_paas', 'modified'], ['view.strategy', 'view_dep_vm', 'removed']]);
    assert.deepEqual(diff(b, a).find((c) => c.viewId === 'view_dep_vm').change, 'added');
  });

  it('lists deployment view add/remove with its implementers and realizes relations', () => {
    const full = base();
    const less = structuredClone(full);
    less.views = less.views.filter((v) => v.id !== 'view_dep_vm');
    const vmOnly = new Set(full.views.find((v) => v.id === 'view_dep_vm').nodes.map((n) => n.componentId).filter(Boolean));
    for (const id of vmOnly) delete less.components[id];
    for (const [id, r] of Object.entries(less.relations)) if (!less.components[r.from] || !less.components[r.to]) delete less.relations[id];
    const removed = diff(full, less);
    assert.ok(removed.some((c) => c.kind === 'view.removed' && c.viewId === 'view_dep_vm' && c.variant === '대안 · VM×2 + LB'));
    assert.ok(removed.some((c) => c.kind === 'relation.removed' && c.relationType === 'realizes' && c.to === 'Reports API'));
    assert.equal(removed.filter((c) => c.kind === 'component.removed').length, vmOnly.size);
    assert.ok(!removed.some((c) => c.kind === 'view.node.removed'), 'nodes of a removed view are not listed separately');
    assert.ok(diff(less, full).some((c) => c.kind === 'view.added' && c.viewKind === 'deployment'));
  });

  it('lists reparenting with parent names and requirement snapshot changes', () => {
    const a = base();
    const b = structuredClone(a);
    const vm = b.views.find((v) => v.id === 'view_dep_vm');
    vm.nodes.find((n) => n.id === 'nd_vm_api_2').parentId = vm.nodes.find((n) => n.id === 'nd_vm_api_1').parentId;
    const changed = reqs();
    changed[0].target = 'p95 < 200ms';
    const changes = diff(a, b, {}, reqs(), changed);
    const rp = changes.find((c) => c.kind === 'view.node.reparented');
    assert.deepEqual([rp.name, rp.before, rp.after], ['api (node) · 2', 'vm-api-2', 'vm-api-1']);
    const snap = changes.find((c) => c.kind === 'requirement.snapshot_changed');
    assert.deepEqual([snap.code, snap.change, snap.fields], ['NFR-001', 'modified', [{ path: 'target', before: 'p95 < 300ms', after: 'p95 < 200ms' }]]);
  });

  it('carries the summary from summarize', () => {
    const a = base();
    const b = structuredClone(a);
    b.views.find((v) => v.id === 'view_dep_paas').strategyMd = '';
    const { summary } = diffModels({ model: a, snapshot: {} }, { model: b, snapshot: {} });
    assert.equal(summary.strategiesChanged, 1);
  });
});

describe('GET /architecture/compare (DB)', { skip: dbSkipReason }, () => {
  const created = [];
  let A, B;
  const P = (id) => `/api/aa/projects/${id}`;
  before(async () => { ({ A, B } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  async function sampleProject(suffix) {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} compare ${suffix} ${Date.now()}`, template: 'sample-reports' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(res.body.data.id);
    return res.body.data.id;
  }
  async function publish(id, label) {
    const p = (await api(A).get(`${P(id)}/architecture/versions/preview`)).body.data;
    const r = await api(A).post(`${P(id)}/architecture/versions`, { label, baseRevision: p.revision, expectedLatestVersionId: p.latestVersion?.id ?? null, snapshotHash: p.snapshotHash });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.data;
  }
  async function edit(id, fn) {
    const d = (await api(A).get(`${P(id)}/architecture`)).body.data;
    fn(d.model);
    const r = await api(A).put(`${P(id)}/architecture/draft`, { baseRevision: d.revision, model: d.model });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.data;
  }
  const compare = (id, q, token = A) => api(token).get(`${P(id)}/architecture/compare?${new URLSearchParams(q).toString()}`);

  it('compares version→version and version→draft, without models in the response', async () => {
    const id = await sampleProject('basic');
    const v1 = await publish(id, 'v1.0');
    await edit(id, (m) => { m.views.find((v) => v.id === 'view_dep_vm').variant = '대안 · VM×3'; });
    const v2 = await publish(id, 'v1.1');
    await edit(id, (m) => {
      m.components.cmp_reports_api.technology = 'Go';
      m.views[0].nodes[0].position = { x: m.views[0].nodes[0].position.x + 50, y: 0 };
    });

    const vv = await compare(id, { from: v1.id, to: v2.id });
    assert.equal(vv.status, 200, JSON.stringify(vv.body));
    assert.deepEqual(vv.body.data.changes.map((c) => c.kind), ['view.renamed']);
    assert.deepEqual([vv.body.data.from.label, vv.body.data.to.label], ['v1.0', 'v1.1']);
    assert.ok(!('model' in vv.body.data) && !JSON.stringify(vv.body.data).includes('"components":{'), 'no models');
    assert.ok(vv.body.data.views.to.some((v) => v.variant === '대안 · VM×3'));

    const vd = await compare(id, { from: v2.id, to: 'draft' });
    assert.equal(vd.status, 200);
    assert.equal(vd.body.data.to.type, 'draft');
    assert.deepEqual(vd.body.data.changes.map((c) => c.kind), ['component.modified']);
    const withLayout = await compare(id, { from: v2.id, to: 'draft', includeLayout: 'true' });
    assert.deepEqual(withLayout.body.data.changes.map((c) => c.kind).sort(), ['component.modified', 'layout.moved']);
    assert.equal(withLayout.body.data.includeLayout, true);
  });

  it('restoring a two-deployment-view version over a Logical-only draft shows the views coming back', async () => {
    const id = await sampleProject('restore');
    const full = await publish(id, 'v1.0');
    await edit(id, (m) => {
      m.views = m.views.filter((v) => v.kind !== 'deployment');
      for (const [cid, c] of Object.entries(m.components)) if (c.layer === 'deployment') delete m.components[cid];
      for (const [rid, r] of Object.entries(m.relations)) if (!m.components[r.from] || !m.components[r.to]) delete m.relations[rid];
    });
    const logical = await publish(id, 'v1.1');
    const gone = (await compare(id, { from: full.id, to: logical.id })).body.data.changes;
    assert.equal(gone.filter((c) => c.kind === 'view.removed').length, 2);
    assert.ok(gone.some((c) => c.kind === 'relation.removed' && c.relationType === 'realizes'));

    const d = (await api(A).get(`${P(id)}/architecture`)).body.data;
    assert.equal((await api(A).post(`${P(id)}/architecture/versions/${full.id}/restore`, { baseRevision: d.revision })).status, 200);
    const back = (await compare(id, { from: logical.id, to: 'draft' })).body.data;
    assert.deepEqual(back.changes.filter((c) => c.kind === 'view.added').map((c) => c.variant).sort(), ['대안 · VM×2 + LB', '현재 · PaaS'].sort());
    assert.deepEqual((await compare(id, { from: full.id, to: 'draft' })).body.data.changes, [], 'restored draft equals v1.0');
  });

  it('validates parameters and hides other users’ versions', async () => {
    const id = await sampleProject('params');
    const v1 = await publish(id, 'v1.0');
    assert.equal((await compare(id, { from: v1.id, to: v1.id })).status, 400, 'same target');
    assert.equal((await compare(id, { from: 'draft', to: v1.id })).status, 400, 'from must be a version');
    assert.equal((await compare(id, { from: v1.id })).status, 400, 'to required');
    assert.equal((await compare(id, { from: v1.id, to: 'latest' })).status, 400);
    assert.equal((await compare(id, { from: '99999999-9999-4999-8999-999999999999', to: 'draft' })).status, 404);
    assert.equal((await compare(id, { from: v1.id, to: 'draft' }, B)).status, 404, 'other user → project 404');
  });
});
