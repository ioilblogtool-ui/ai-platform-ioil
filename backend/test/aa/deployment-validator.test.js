// Sprint 7 Step 1 — 배치안 검증(V2 realizes·V5 컨테이너·V11·V13)과 의미 해시 회귀 (오프라인)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateModel } = require('../../lib/aa/architecture-validator');
const { modelHash } = require('../../lib/aa/model-canon');
const { summarize } = require('../../lib/aa/graph-diff');
const FIXTURE = require('../fixtures/sprint6-model.json');

// Sprint 7 변경 전에 기록한 해시 (sample-reports 모델, 요구사항 링크 고정) — 바뀌면 hashVersion을 올려야 한다
const SPRINT6_HASH = 'f3f0e7a7e8ba9ae95de93a3ba80aa81e541dda0b7957a75a116fc2a7333589d5';

const comp = (id, type, layer, name, extra = {}) => ({ id, type, layer, name, properties: {}, requirementIds: [], decisionIds: [], ...extra });
/** FIXTURE + 배치안 하나: zone ⊃ platform ⊃ process(→ Reports API), managed_db(→ Reports DB) */
function deployed() {
  const m = structuredClone(FIXTURE);
  Object.assign(m.components, {
    cmp_zone: comp('cmp_zone', 'dep.zone', 'deployment', 'internal', { properties: { trust: 'internal' } }),
    cmp_rail: comp('cmp_rail', 'dep.platform', 'deployment', 'Railway'),
    cmp_proc: comp('cmp_proc', 'dep.process', 'deployment', 'backend (node)', { properties: { instances: 1 } }),
    cmp_db: comp('cmp_db', 'dep.managed_db', 'deployment', 'Supabase DB'),
  });
  Object.assign(m.relations, {
    rel_r1: { id: 'rel_r1', type: 'realizes', from: 'cmp_proc', to: 'cmp_reports_api', requirementIds: [] },
    rel_r2: { id: 'rel_r2', type: 'realizes', from: 'cmp_db', to: 'cmp_reports_db', requirementIds: [] },
  });
  m.views.push({
    id: 'view_dep_a', kind: 'deployment', name: 'Deployment', variant: '현재 · PaaS', strategyMd: '## 승인\n- 운영 배포: 팀장',
    nodes: [
      { id: 'nd_zone', kind: 'component', componentId: 'cmp_zone', position: { x: 0, y: 0 }, width: 600, height: 400 },
      { id: 'nd_rail', kind: 'component', componentId: 'cmp_rail', parentId: 'nd_zone', position: { x: 20, y: 40 }, width: 300, height: 200 },
      { id: 'nd_proc', kind: 'component', componentId: 'cmp_proc', parentId: 'nd_rail', position: { x: 20, y: 40 } },
      { id: 'nd_db', kind: 'component', componentId: 'cmp_db', parentId: 'nd_zone', position: { x: 400, y: 40 } },
    ],
    edges: [],
  });
  return m;
}
const rules = (m, rule) => validateModel(m).errors.filter((e) => e.rule === rule);
const depView = (m) => m.views.find((v) => v.kind === 'deployment');

describe('의미 해시 회귀 (Sprint 7 Q5)', () => {
  it('keeps Sprint 6 hashes byte-identical for models without strategy', () => {
    assert.equal(modelHash(FIXTURE), SPRINT6_HASH);
    const empty = structuredClone(FIXTURE);
    empty.views[0].strategyMd = '';
    assert.equal(modelHash(empty), SPRINT6_HASH, 'empty strategy = absent');
  });

  it('changes the hash for strategy edits, deletion and variant-only renames', () => {
    const a = deployed();
    const edited = structuredClone(a); depView(edited).strategyMd += '\n- 롤백: 이전 이미지';
    const removed = structuredClone(a); delete depView(removed).strategyMd;
    const renamed = structuredClone(a); depView(renamed).variant = '운영 · PaaS';
    for (const [name, b] of [['edit', edited], ['remove', removed], ['rename', renamed]]) assert.notEqual(modelHash(a), modelHash(b), name);
    const s = (b) => summarize({ model: a, snapshot: {} }, { model: b, snapshot: {} });
    assert.equal(s(edited).strategiesChanged, 1);
    assert.equal(s(removed).strategiesChanged, 1);
    assert.equal(s(renamed).viewChanges, 1, 'variant-only rename is a semantic change');
    assert.equal(s(renamed).strategiesChanged, 0);
  });
});

describe('배치안 검증', () => {
  it('accepts a valid deployment view with nested containers', () => {
    const { errors, warnings } = validateModel(deployed());
    assert.deepEqual(errors, []);
    assert.equal(warnings.filter((w) => w.rule === 'V11').length, 0);
  });

  it('V5: rejects non-container component parents, self parents, cycles and parents from other views', () => {
    const plain = deployed(); depView(plain).nodes.find((n) => n.id === 'nd_db').parentId = 'nd_proc';
    assert.equal(rules(plain, 'V5').length, 1, 'process is not a container');
    const self = deployed(); depView(self).nodes.find((n) => n.id === 'nd_zone').parentId = 'nd_zone';
    assert.ok(rules(self, 'V5').some((e) => e.path.includes('nd_zone')), 'self parent (descendants also report the cycle)');
    const cycle = deployed(); depView(cycle).nodes.find((n) => n.id === 'nd_zone').parentId = 'nd_rail';
    assert.ok(rules(cycle, 'V5').some((e) => /순환/.test(e.message)));
    const other = deployed(); depView(other).nodes.find((n) => n.id === 'nd_db').parentId = 'nd_web_app';
    assert.equal(rules(other, 'V5').length, 1, 'parent in another view');
    const inLogical = deployed();
    inLogical.views[0].nodes.push({ id: 'nd_zone2', kind: 'component', componentId: 'cmp_zone', position: { x: 0, y: 0 }, width: 200, height: 200 });
    assert.ok(rules(inLogical, 'V5').length >= 1, 'containers only in deployment views');
    const noSize = deployed(); delete depView(noSize).nodes.find((n) => n.id === 'nd_rail').width;
    assert.equal(rules(noSize, 'V3').length, 1, 'containers need a size');
  });

  it('V11: warns when a process has no VM/platform ancestor (ancestor chain, with ids)', () => {
    const m = deployed();
    depView(m).nodes.find((n) => n.id === 'nd_proc').parentId = 'nd_zone';
    const w = validateModel(m).warnings.filter((x) => x.rule === 'V11');
    assert.equal(w.length, 1);
    assert.deepEqual([w[0].code, w[0].viewId, w[0].nodeId], ['V11', 'view_dep_a', 'nd_proc']);
    assert.deepEqual(validateModel(m).errors, [], 'warning only');
  });

  it('V2: realizes direction, allowed types, duplicates, attributes and edges', () => {
    const reverse = deployed(); Object.assign(reverse.relations.rel_r1, { from: 'cmp_reports_api', to: 'cmp_proc' });
    assert.ok(rules(reverse, 'V2').length >= 1);
    const zone = deployed(); zone.relations.rel_r1.from = 'cmp_zone';
    assert.equal(rules(zone, 'V2').length, 1, 'zone cannot implement');
    const dup = deployed(); dup.relations.rel_r3 = { id: 'rel_r3', type: 'realizes', from: 'cmp_proc', to: 'cmp_reports_api', requirementIds: [] };
    assert.equal(rules(dup, 'V2').length, 1);
    const attr = deployed(); attr.relations.rel_r1.protocol = 'HTTPS';
    assert.equal(rules(attr, 'V2').length, 1);
    const edge = deployed();
    edge.views[0].nodes.push({ id: 'nd_proc_l', kind: 'component', componentId: 'cmp_proc', position: { x: 0, y: 300 } });
    edge.views[0].edges.push({ id: 'ed_r1', relationId: 'rel_r1' });
    assert.ok(rules(edge, 'V4').some((e) => /realizes/.test(e.message)));
  });

  it('V13: variant, strategy size and the deployment view limit', () => {
    const noName = deployed(); delete depView(noName).variant;
    assert.equal(rules(noName, 'V13').length, 1);
    const long = deployed(); depView(long).variant = 'x'.repeat(61);
    assert.equal(rules(long, 'V13').length, 1);
    const big = deployed(); depView(big).strategyMd = 'a'.repeat(64 * 1024 + 1);
    assert.equal(rules(big, 'V13').length, 1);
    const onLogical = deployed(); onLogical.views[0].strategyMd = 'x';
    assert.equal(rules(onLogical, 'V13').length, 1);
    const many = deployed();
    for (let i = 2; i <= 6; i++) many.views.push({ id: `view_dep_${i}`, kind: 'deployment', name: 'Deployment', variant: `안 ${i}`, nodes: [], edges: [] });
    assert.ok(rules(many, 'V13').some((e) => /최대 5개/.test(e.message)));
    const same = deployed(); same.views.push({ id: 'view_dep_b', kind: 'deployment', name: 'Deployment', variant: '현재 · PaaS', nodes: [], edges: [] });
    assert.equal(rules(same, 'V13').length, 1, 'duplicate variant');
    const secret = deployed(); depView(secret).strategyMd = `키 sk-${'c'.repeat(24)}`;
    assert.equal(rules(secret, 'V12').length, 1, 'strategy is scanned for secrets');
  });
});
