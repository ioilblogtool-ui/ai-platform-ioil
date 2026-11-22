// Sprint 6 Step 4 — 버전 기준 README·Ask AI·Mermaid (S6-7, Q12·Q15)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, getTokens, deleteProjects, api, TEST_PREFIX } = require('../helpers/aa-api');

const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('AA version-based export', { skip: dbSkipReason }, () => {
  const created = [];
  let A;
  const P = (id) => `/api/aa/projects/${id}`;
  const exp = (id, body) => api(A).post(`${P(id)}/export`, body);

  async function project(suffix, readmeMd) {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} vexport ${suffix} ${Date.now()}`, template: 'sample-reports', ...(readmeMd ? { readmeMd } : {}) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(res.body.data.id);
    return res.body.data.id;
  }
  async function publish(id, label) {
    const p = (await api(A).get(`${P(id)}/architecture/versions/preview`)).body.data;
    const res = await api(A).post(`${P(id)}/architecture/versions`, { label, baseRevision: p.revision, expectedLatestVersionId: p.latestVersion?.id ?? null, snapshotHash: p.snapshotHash });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data;
  }
  async function save(id, mutate) {
    const d = (await api(A).get(`${P(id)}/architecture`)).body.data;
    mutate(d.model);
    assert.equal((await api(A).put(`${P(id)}/architecture/draft`, { baseRevision: d.revision, model: d.model })).status, 200);
  }
  const nfr1 = async (id) => (await api(A).get(`${P(id)}/requirements`)).body.data.find((r) => r.code === 'NFR-001');

  before(async () => { ({ A } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  it('README defaults to the latest version and keeps publish-time model, NFR and overview', async () => {
    const id = await project('readme');
    const none = (await exp(id, { format: 'readme-md' })).body.data;
    assert.equal(none.basis.source, 'draft', 'no version yet → Draft');
    assert.match(none.content, /기준: Draft rev 1 \(발행 버전 없음\)/);

    const v1 = await publish(id, 'v1.0');
    await save(id, (m) => { m.components.cmp_reports_api.name = 'Reports API v2'; });
    await api(A).patch(`${P(id)}/requirements/${(await nfr1(id)).id}`, { target: 'p95 < 100ms' });
    await api(A).patch(P(id), { readmeMd: '## 목적\n바뀐 개요' });

    const latest = await exp(id, { format: 'readme-md' });
    assert.equal(latest.status, 200, JSON.stringify(latest.body));
    const d = latest.body.data;
    assert.deepEqual([d.basis.source, d.basis.label, d.basis.versionId], ['version', 'v1.0', v1.id]);
    assert.match(d.filename, /^README_.+_v1\.0\.md$/);
    assert.match(d.content, /> 기준: v1\.0 \(발행 \d{4}-\d{2}-\d{2}, 요구사항·개요는 발행 당시 값\)/);
    assert.ok(d.content.includes('Reports API') && !d.content.includes('Reports API v2'), 'publish-time model');
    assert.ok(d.content.includes('p95 < 300ms') && !d.content.includes('p95 < 100ms'), 'publish-time NFR');
    assert.ok(d.content.includes('리포트 조회 기능') && !d.content.includes('바뀐 개요'), 'publish-time overview');
    assert.ok(!d.content.includes(v1.id), 'no version UUID in output');

    const draft = (await exp(id, { format: 'readme-md', source: { type: 'draft' } })).body.data;
    assert.equal(draft.basis.source, 'draft');
    assert.match(draft.content, /Draft rev \d+ \(발행 전 작업본 · 최신 발행본 v1\.0\)/);
    assert.ok(draft.content.includes('Reports API v2') && draft.content.includes('p95 < 100ms') && draft.content.includes('바뀐 개요'));

    const noNfr = (await exp(id, { format: 'readme-md', source: { type: 'version', versionId: v1.id }, sections: { nfr: false } })).body.data;
    assert.ok(!noNfr.content.includes('p95 <'), 'section choice applies to version output');
    assert.equal(noNfr.sections.nfr, false);
  });

  it('exports a chosen version for Ask AI and Mermaid, rejects latest outside README', async () => {
    const id = await project('askai');
    const v1 = await publish(id, 'v1.0');
    await save(id, (m) => { m.components.cmp_reports_db.name = 'Reports DB (replica)'; });
    const v2 = await publish(id, 'v1.1');
    const src = (v) => ({ type: 'version', versionId: v.id });

    for (const format of ['ai-md', 'ai-json', 'mermaid']) {
      const r = await exp(id, { format, source: { type: 'latest' } });
      assert.equal(r.status, 400, format);
    }
    const a1 = (await exp(id, { format: 'ai-md', source: src(v1) })).body.data;
    const a1again = (await exp(id, { format: 'ai-md', source: src(v1) })).body.data;
    const a2 = (await exp(id, { format: 'ai-md', source: src(v2) })).body.data;
    assert.equal(a1.contentHash, a1again.contentHash, 'same version → same hash');
    assert.notEqual(a1.contentHash, a2.contentHash);
    assert.ok(a1.content.includes('Reports DB') && !a1.content.includes('replica'));
    assert.ok(a2.content.includes('Reports DB (replica)'));
    assert.match(a1.content, /^<!-- AA Workbench export · bundle bx_\w+ · .+ · v1\.0 \(발행 \d{4}-\d{2}-\d{2}\) · 읽은 시각 /);
    assert.match(a1.filename, /_project_v1\.0_\d{4}-\d{2}-\d{2}\.md$/);
    assert.ok(!UUID_ANY.test(a1.content), 'no UUIDs in the bundle');

    const j = JSON.parse((await exp(id, { format: 'ai-json', source: src(v1) })).body.data.content);
    assert.deepEqual(j.basis, { source: 'version', label: 'v1.0', publishedAt: j.basis.publishedAt });
    assert.ok(!UUID_ANY.test(JSON.stringify(j)));

    const nfr = await nfr1(id);
    const byReq = await exp(id, { format: 'ai-md', source: src(v1), scope: { type: 'requirement', requirementId: nfr.id } });
    assert.equal(byReq.status, 200, JSON.stringify(byReq.body));
    assert.equal(byReq.body.data.scopeLabel, '요구사항 NFR-001');

    const m = (await exp(id, { format: 'mermaid', source: src(v1) })).body.data;
    assert.match(m.filename, /_logical_v1\.0\.mmd$/);
    assert.ok(!m.content.includes('replica'));

    const other = await project('other');
    const ov = await publish(other, 'v1.0');
    assert.equal((await exp(id, { format: 'ai-md', source: src(ov) })).status, 404, 'version from another project');
    assert.equal((await exp(id, { format: 'ai-md', source: { type: 'version', versionId: 'nope' } })).status, 400);
  });

  it('binds warning confirmations to the basis', async () => {
    const id = await project('scan', '## 목적\n내부 서버 10.20.30.40 기준 문서');
    const v1 = await publish(id, 'v1.0');
    const first = await exp(id, { format: 'readme-md', source: { type: 'version', versionId: v1.id } });
    assert.equal(first.status, 422);
    const scanId = first.body.details.scanId;
    assert.ok(scanId);
    assert.equal((await exp(id, { format: 'readme-md', source: { type: 'version', versionId: v1.id }, acknowledgedScan: scanId })).status, 200);

    await save(id, (m) => { m.components.cmp_auth.name = 'Auth 2'; });
    const v2 = await publish(id, 'v1.1');
    const otherVersion = await exp(id, { format: 'readme-md', source: { type: 'version', versionId: v2.id }, acknowledgedScan: scanId });
    assert.equal(otherVersion.status, 422, 'a confirmation for v1.0 does not cover v1.1');

    // latest로 확인한 뒤 새 버전이 발행되면 그 확인은 쓸 수 없다
    const latest = await exp(id, { format: 'readme-md' });
    const latestScan = latest.body.details.scanId;
    assert.equal((await exp(id, { format: 'readme-md', acknowledgedScan: latestScan })).status, 200);
    await save(id, (m) => { m.components.cmp_auth.name = 'Auth 3'; });
    await publish(id, 'v1.2');
    assert.equal((await exp(id, { format: 'readme-md', acknowledgedScan: latestScan })).status, 422);
  });
});
