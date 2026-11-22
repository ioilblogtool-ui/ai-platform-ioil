// Sprint 5 Step 1 — Ask AI 번들 (S5-1~S5-4)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { buildAskAi, ALIAS_NOTE } = require('../../lib/aa/export-builder');
const { contentHash } = require('../../lib/aa/scan-store');
const sample = require('../../lib/aa/templates/sample-reports');
const { dbSkipReason, getTokens, deleteProjects, api, TEST_PREFIX } = require('../helpers/aa-api');

const NFR1 = { id: '11111111-1111-4111-8111-111111111111', code: 'NFR-001', kind: 'nfr', title: '조회 p95 300ms', target: '300ms', metric: 'p95', status: 'active' };
const NFR2 = { id: '22222222-2222-4222-8222-222222222222', code: 'NFR-002', kind: 'nfr', title: '연결 없음', status: 'active' };
const FR1 = { id: '33333333-3333-4333-8333-333333333333', code: 'FR-001', kind: 'fr', title: '월별 조회', status: 'active' };
const REQS = [NFR1, NFR2, FR1];

function model() {
  const m = sample.model();
  // 샘플: Web App, Reports API, Reports DB, Auth. 관계: Web→API, API→DB, Web→Auth, API→Auth
  m.components.cmp_reports_api.requirementIds = [NFR1.id];
  m.relations.rel_web_auth.requirementIds = [FR1.id];
  // Logical에 그려지지 않은 컴포넌트 하나
  m.components.cmp_archive = { id: 'cmp_archive', type: 'storage', layer: 'logical', name: 'Archive', properties: {}, requirementIds: [], decisionIds: [] };
  return m;
}

const base = (extra = {}) => ({
  project: { name: 'Reports', readmeMd: '## 목적\n리포트 조회 설계.\n' }, model: model(), revision: 5, requirements: REQS,
  format: 'ai-md', scope: { type: 'project' }, template: 'failure-scenarios', question: '장애 시나리오를 봐줘',
  bundleId: 'bx_aaaaaaaaaa', readAt: '2026-11-22T00:00:00.000Z', ...extra,
});

const FORBIDDEN = [/cmp_/, /rel_/, /nd_/, /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}/i, /"position"/, /"x":/];

describe('buildAskAi (offline)', () => {
  it('ai-md: header comment, alias note, question first, no internal ids', () => {
    const out = buildAskAi(base());
    const lines = out.content.split('\n');
    assert.match(lines[0], /^<!-- AA Workbench export · bundle bx_aaaaaaaaaa · Reports · Draft rev 5 · 읽은 시각 2026-11-22T00:00:00\.000Z -->$/);
    assert.equal(lines[1], `> ${ALIAS_NOTE}`);
    assert.match(out.content, /# 질문\n\n아래 구성에서 일어날 수 있는 장애 시나리오/);
    assert.ok(out.content.indexOf('# 질문') < out.content.indexOf('# 컴포넌트'));
    assert.match(out.content, /\| C2 \| Reports API \| Service \|/);
    assert.match(out.content, /- C1 → C2 · HTTPS · 동기/);
    assert.match(out.content, /```mermaid\nflowchart LR/);
    assert.match(out.content, /c2\["C2 Reports API"\]/);
    for (const re of FORBIDDEN) assert.ok(!re.test(out.content), `leak ${re}`);
    assert.equal(out.omitted.components, 0);
    assert.equal(out.hashBody, out.content.split('\n').slice(1).join('\n'), 'hash body is everything after the header line');
  });

  it('same input → same hash even with a different bundleId and read time', () => {
    const a = buildAskAi(base());
    const b = buildAskAi(base({ bundleId: 'bx_bbbbbbbbbb', readAt: '2026-11-23T09:00:00.000Z' }));
    assert.notEqual(a.content, b.content);
    assert.equal(contentHash(a.hashBody), contentHash(b.hashBody));
    const ja = buildAskAi(base({ format: 'ai-json' }));
    const jb = buildAskAi(base({ format: 'ai-json', bundleId: 'bx_bbbbbbbbbb', readAt: 'x' }));
    assert.equal(contentHash(ja.hashBody), contentHash(jb.hashBody));
    assert.notEqual(contentHash(a.hashBody), contentHash(buildAskAi(base({ question: '다른 질문' })).hashBody));
  });

  it('scopes: view, components + neighbours, requirement (direct links + relation ends), none', () => {
    const view = buildAskAi(base({ scope: { type: 'view', viewId: 'view_logical' } }));
    assert.equal(view.counts.components, 4);
    assert.equal(view.omitted.components, 1);                       // Archive는 Logical에 없음
    const db = buildAskAi(base({ scope: { type: 'components', componentIds: ['cmp_reports_db'] } }));
    assert.deepEqual([db.counts.components, db.counts.relations], [2, 1]);   // DB + API, API→DB
    assert.equal(db.scopeLabel, 'Reports DB와 이웃');
    assert.match(db.content, /\| C1 \| Reports API \|/, 'aliases are re-numbered per bundle');
    const nfr = buildAskAi(base({ scope: { type: 'requirement', requirementId: NFR1.id } }));
    assert.deepEqual([nfr.counts.components, nfr.counts.relations], [1, 0]);  // Reports API만, 1-hop 확장 없음
    assert.match(nfr.content, /\| NFR-001 \|/);
    assert.ok(!/\| FR-001 \|/.test(nfr.content) && !nfr.content.includes('NFR-002'), 'only the chosen requirement');
    const fr = buildAskAi(base({ scope: { type: 'requirement', requirementId: FR1.id } }));
    assert.deepEqual([fr.counts.components, fr.counts.relations], [2, 1]);    // Web→Auth 관계의 양 끝
    const none = buildAskAi(base({ scope: { type: 'requirement', requirementId: NFR2.id } }));
    assert.equal(none.counts.components, 0);
    assert.match(none.content, /NFR-002에 연결된 컴포넌트가 없습니다/);
    for (const out of [view, db, nfr, fr, none]) for (const re of FORBIDDEN) assert.ok(!re.test(out.content), `leak ${re} in ${out.scopeLabel}`);
  });

  it('ai-json mirrors ai-md aliases and has no internal ids', () => {
    const md = buildAskAi(base({ scope: { type: 'components', componentIds: ['cmp_reports_api'] } }));
    const js = buildAskAi(base({ format: 'ai-json', scope: { type: 'components', componentIds: ['cmp_reports_api'] } }));
    const doc = JSON.parse(js.content);
    assert.equal(doc.schema, 'aa-ask-ai/1');
    assert.equal(doc.bundleId, 'bx_aaaaaaaaaa');
    assert.deepEqual(doc.scope, { label: 'Reports API와 이웃' });
    for (const c of doc.components) assert.match(md.content, new RegExp(`\\| ${c.alias} \\| ${c.name} \\|`));
    assert.ok(doc.relations.every((r) => /^C\d+$/.test(r.from) && /^C\d+$/.test(r.to)));
    assert.ok(doc.groups.every((g) => /^G\d+$/.test(g.alias)));
    for (const re of FORBIDDEN) assert.ok(!re.test(js.content), `leak ${re}`);
  });

  it('rejects bad scope, template and question', () => {
    assert.equal(buildAskAi(base({ scope: { type: 'flow' } })).error, 'scope_flow');
    assert.equal(buildAskAi(base({ scope: { type: 'view', viewId: 'view_k8s' } })).error, 'scope_view');
    assert.equal(buildAskAi(base({ scope: { type: 'components', componentIds: ['cmp_nope'] } })).error, 'scope_components');
    assert.equal(buildAskAi(base({ scope: { type: 'requirement', requirementId: '44444444-4444-4444-8444-444444444444' } })).error, 'scope_requirement');
    assert.equal(buildAskAi(base({ template: 'nope' })).error, 'template');
    assert.equal(buildAskAi(base({ template: 'custom', question: '' })).error, 'question');
    assert.equal(buildAskAi(base({ question: 'x'.repeat(2001) })).error, 'question');
  });
});

describe('POST /export ai-md · ai-json · mermaid', { skip: dbSkipReason }, () => {
  const created = [];
  let A;
  const url = (id) => `/api/aa/projects/${id}/export`;
  before(async () => { ({ A } = await getTokens()); });
  after(async () => { await deleteProjects(created); });
  const createSample = async (suffix, readmeMd) => {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} askai ${suffix} ${Date.now()}`, template: 'sample-reports', ...(readmeMd ? { readmeMd } : {}) });
    assert.equal(res.status, 201);
    created.push(res.body.data.id);
    return res.body.data;
  };

  it('returns a bundle with bundleId, scope label, counts and a stable hash', async () => {
    const p = await createSample('ok');
    const req = { format: 'ai-md', scope: { type: 'components', componentIds: ['cmp_reports_db'] }, template: 'failure-scenarios', question: 'DB 장애?' };
    const a = await api(A).post(url(p.id), req);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.match(a.body.data.bundleId, /^bx_[A-Za-z0-9]{10}$/);
    assert.equal(a.body.data.scopeLabel, 'Reports DB와 이웃');
    assert.deepEqual(a.body.data.counts, { components: 2, relations: 1 });
    assert.match(a.body.data.filename, /_components_rev1_\d{4}-\d{2}-\d{2}\.md$/);
    const b = await api(A).post(url(p.id), req);
    assert.notEqual(b.body.data.bundleId, a.body.data.bundleId);
    assert.equal(b.body.data.contentHash, a.body.data.contentHash);
    const js = await api(A).post(url(p.id), { ...req, format: 'ai-json' });
    assert.equal(js.status, 200);
    assert.equal(js.body.data.contentType, 'application/json');
    const mm = await api(A).post(url(p.id), { format: 'mermaid' });
    assert.equal(mm.status, 200);
    assert.match(mm.body.data.content, /^flowchart LR/);
    assert.equal(mm.body.data.bundleId, undefined, 'mermaid is not a review bundle');
  });

  it('validates scope, notes and question', async () => {
    const p = await createSample('bad');
    const cases = [
      [{ format: 'ai-md', scope: { type: 'flow', flowId: 'x' } }, 400],
      [{ format: 'ai-md', noteIds: ['n1'] }, 400],
      [{ format: 'ai-md', scope: { type: 'components', componentIds: [] } }, 400],
      [{ format: 'ai-md', scope: { type: 'components', componentIds: ['cmp_missing'] } }, 404],
      [{ format: 'ai-md', scope: { type: 'requirement', requirementId: '44444444-4444-4444-8444-444444444444' } }, 404],
      [{ format: 'ai-md', template: 'custom', question: '' }, 400],
      [{ format: 'ai-md', question: 'x'.repeat(2001) }, 400],
    ];
    for (const [body, status] of cases) {
      const res = await api(A).post(url(p.id), body);
      assert.equal(res.status, status, `${JSON.stringify(body).slice(0, 80)} → ${res.status} ${JSON.stringify(res.body)}`);
    }
    assert.equal((await api(A).post(url(p.id), { format: 'ai-md', noteIds: [] })).status, 200);
  });

  it('warning confirmation is bound to format, scope, template, question and revision', async () => {
    const p = await createSample('warn', '## 목적\n문의 ops@example.com\n');
    const req = { format: 'ai-md', template: 'design-review', question: '리뷰' };
    const first = await api(A).post(url(p.id), req);
    assert.equal(first.status, 422);
    const scanId = first.body.details.scanId;
    assert.equal((await api(A).post(url(p.id), { ...req, acknowledgedScan: scanId })).status, 200);
    for (const changed of [{ question: '다른 질문' }, { template: 'explain' }, { format: 'ai-json' }, { scope: { type: 'view', viewId: 'view_logical' } }]) {
      const res = await api(A).post(url(p.id), { ...req, ...changed, acknowledgedScan: scanId });
      assert.equal(res.status, 422, JSON.stringify(changed));
    }
    const d = await api(A).get(`/api/aa/projects/${p.id}/architecture`);
    await api(A).put(`/api/aa/projects/${p.id}/architecture/draft`, { baseRevision: d.body.data.revision, model: d.body.data.model });
    assert.equal((await api(A).post(url(p.id), { ...req, acknowledgedScan: scanId })).status, 422, 'revision changed');
  });
});
