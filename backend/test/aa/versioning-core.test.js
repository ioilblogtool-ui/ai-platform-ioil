// Sprint 6 Step 1 — 의미 해시·Diff 요약·요구사항 스냅샷 (오프라인, DB 없음)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sample = require('../../lib/aa/templates/sample-reports');
const { modelHash, canonModel, layoutChanges, canonicalJson } = require('../../lib/aa/model-canon');
const { summarize, hasSemanticChanges } = require('../../lib/aa/graph-diff');
const { buildSnapshot, snapshotHash, compareSnapshots, referencedRequirementIds } = require('../../lib/aa/requirements-snapshot');

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const R3 = '33333333-3333-4333-8333-333333333333';
const links = { nfr_latency: R1, nfr_db_availability: R2, fr_monthly_report: R3 };
const clone = (o) => structuredClone(o);
const base = () => sample.model(links);
const reqs = () => [
  { id: R1, code: 'NFR-001', kind: 'nfr', category: 'performance', title: '응답 시간', target: 'p95 < 300ms', metric: 'p95', priority: 'must', status: 'active' },
  { id: R2, code: 'NFR-002', kind: 'nfr', category: 'availability', title: 'DB 가용성', target: '99.9%', metric: '월간', priority: 'should', status: 'active' },
  { id: R3, code: 'FR-001', kind: 'fr', category: null, title: '월별 리포트', target: null, metric: null, priority: 'must', status: 'active' },
  { id: '44444444-4444-4444-8444-444444444444', code: 'NFR-003', kind: 'nfr', category: 'cost', title: '연결 안 됨', target: null, metric: null, priority: 'could' },
];
const summary = (prevModel, nextModel, prevReqs = reqs(), nextReqs = reqs()) => summarize(
  { model: prevModel, snapshot: buildSnapshot(prevModel, prevReqs) },
  { model: nextModel, snapshot: buildSnapshot(nextModel, nextReqs) },
);

describe('model-canon: 의미 해시', () => {
  it('ignores coordinates, sizes, viewport and array order', () => {
    const a = base();
    const b = clone(a);
    b.views[0].nodes.reverse();
    b.views[0].edges.reverse();
    b.views[0].nodes[0].position = { x: 999, y: -5 };
    b.views[0].nodes[1].width = 400;
    b.views[0].viewport = { x: 1, y: 2, zoom: 3 };
    b.components = Object.fromEntries(Object.entries(b.components).reverse());
    b.components.cmp_reports_api.requirementIds = [...b.components.cmp_reports_api.requirementIds].reverse();
    assert.equal(modelHash(a), modelHash(b));
    assert.equal(layoutChanges(a, b), 2);
  });

  it('treats empty optional tags/custom as absent', () => {
    const a = base();
    const b = clone(a);
    b.components.cmp_auth.tags = [];
    b.components.cmp_auth.custom = {};
    assert.equal(modelHash(a), modelHash(b));
  });

  for (const [name, change] of [
    ['component name', (m) => { m.components.cmp_reports_api.name = 'Reports API v2'; }],
    ['component property', (m) => { m.components.cmp_reports_api.properties.replicas = 3; }],
    ['requirement link', (m) => { m.components.cmp_reports_db.requirementIds = []; }],
    ['relation protocol', (m) => { m.relations.rel_api_db.protocol = 'TCP'; }],
    ['node parent', (m) => { delete m.views[0].nodes.find((n) => n.id === 'nd_reports_db').parentId; }],
    ['group label', (m) => { m.views[0].nodes.find((n) => n.id === 'nd_backend').label = 'Server'; }],
    ['view name', (m) => { m.views[0].name = 'Logical 2'; }],
    ['edge handle', (m) => { m.views[0].edges[0].sourceHandle = 'right'; }],
  ]) {
    it(`changes the hash when the ${name} changes, and the summary shows it`, () => {
      const a = base();
      const b = clone(a);
      change(b);
      assert.notEqual(modelHash(a), modelHash(b));
      assert.ok(hasSemanticChanges(summary(a, b)), JSON.stringify(summary(a, b)));
    });
  }

  it('canonical JSON is key-order independent', () => {
    assert.equal(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } }), canonicalJson({ a: { c: [3, { e: 2, f: 1 }], d: 2 }, b: 1 }));
    assert.equal(canonModel(null).components.length, 0);
  });
});

describe('graph-diff: 발행 요약', () => {
  it('summarizes the first version', () => {
    const m = base();
    assert.deepEqual(summarize(null, { model: m, snapshot: {} }), { hashVersion: 1, first: true, components: Object.keys(m.components).length, relations: Object.keys(m.relations).length });
  });

  it('counts each kind of change', () => {
    const a = base();
    const b = clone(a);
    b.components.cmp_cache = { id: 'cmp_cache', type: 'cache', layer: 'logical', name: 'Redis', properties: {}, requirementIds: [], decisionIds: [] };
    b.views[0].nodes.push({ id: 'nd_cache', kind: 'component', componentId: 'cmp_cache', position: { x: 0, y: 0 } });
    delete b.components.cmp_auth;
    delete b.relations.rel_web_auth;
    delete b.relations.rel_api_auth;
    b.views[0].nodes = b.views[0].nodes.filter((n) => n.id !== 'nd_auth');
    b.views[0].edges = b.views[0].edges.filter((e) => !['rel_web_auth', 'rel_api_auth'].includes(e.relationId));
    b.components.cmp_reports_api.technology = 'Go';
    b.components.cmp_reports_db.requirementIds = [];
    b.relations.rel_api_db.label = 'read only';
    b.relations.rel_cache = { id: 'rel_cache', type: 'calls', from: 'cmp_reports_api', to: 'cmp_cache', requirementIds: [R1] };
    b.views[0].edges.push({ id: 'ed_cache', relationId: 'rel_cache' });
    b.views[0].nodes.find((n) => n.id === 'nd_web_app').position = { x: 1, y: 1 };
    const s = summary(a, b);
    assert.equal(s.componentsAdded, 1);
    assert.equal(s.componentsRemoved, 1);
    assert.equal(s.componentsModified, 1);
    assert.equal(s.requirementLinksChanged, 1, 'Reports DB lost NFR-002');
    assert.equal(s.relationsAdded, 1);
    assert.equal(s.relationsRemoved, 2);
    assert.equal(s.relationsModified, 1);
    assert.equal(s.layoutOnly, 1);
    assert.equal(s.requirementsChanged, 1, 'NFR-002 left the snapshot');
  });

  it('reports layout-only changes without semantic changes', () => {
    const a = base();
    const b = clone(a);
    for (const n of b.views[0].nodes) n.position = { x: n.position.x + 10, y: n.position.y };
    const s = summary(a, b);
    assert.equal(hasSemanticChanges(s), false);
    assert.equal(s.layoutOnly, a.views[0].nodes.length);
    assert.equal(modelHash(a), modelHash(b));
  });

  it('counts a requirement target change while the model hash stays the same', () => {
    const a = base();
    const changed = reqs();
    changed[0].target = 'p95 < 200ms';
    const s = summary(a, clone(a), reqs(), changed);
    assert.equal(s.requirementsChanged, 1);
    assert.equal(hasSemanticChanges(s), true);
  });

  it('counts reparenting separately', () => {
    const a = base();
    const b = clone(a);
    delete b.views[0].nodes.find((n) => n.id === 'nd_reports_api').parentId;
    const s = summary(a, b);
    assert.equal(s.nodesReparented, 1);
    assert.equal(s.viewChanges, 0);
  });
});

describe('requirements-snapshot', () => {
  it('keeps only referenced, existing requirements with fixed fields', () => {
    const m = base();
    m.relations.rel_api_db.requirementIds = ['99999999-9999-4999-8999-999999999999'];   // 프로젝트에 없는 id
    const snap = buildSnapshot(m, reqs());
    assert.deepEqual(Object.keys(snap).sort(), [R1, R2, R3].sort());
    assert.deepEqual(snap[R3], { code: 'FR-001', kind: 'fr', category: null, title: '월별 리포트', target: null, metric: null, priority: 'must' });
    assert.ok(!('status' in snap[R1]));
    assert.equal(referencedRequirementIds(m).size, 4);
  });

  it('hashes independent of key order and compares changes', () => {
    const snap = buildSnapshot(base(), reqs());
    const reordered = Object.fromEntries(Object.entries(snap).reverse());
    assert.equal(snapshotHash(snap), snapshotHash(reordered));
    const next = structuredClone(snap);
    next[R1].title = '응답 시간 (조회)';
    delete next[R2];
    next.newone = { code: 'NFR-009' };
    assert.deepEqual(compareSnapshots(snap, next), { changed: 1, added: 1, removed: 1, total: 3 });
    assert.notEqual(snapshotHash(snap), snapshotHash(next));
  });
});
