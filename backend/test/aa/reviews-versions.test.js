// Sprint 6 Step 5 — 버전 기준 수동 리뷰와 "이전 기준" 표시 (S6-8, Q9·Q13·Q16, REV-M3·M6)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { dbSkipReason, getTokens, deleteProjects, api, aaDb, USER_A, TEST_PREFIX } = require('../helpers/aa-api');

describe('AA version-based reviews', { skip: dbSkipReason }, () => {
  const created = [];
  let A;
  const P = (id) => `/api/aa/projects/${id}`;
  const R = (id) => `${P(id)}/reviews`;

  async function project(suffix) {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} vreviews ${suffix} ${Date.now()}`, template: 'sample-reports' });
    created.push(res.body.data.id);
    return res.body.data.id;
  }
  async function publish(id, label) {
    const p = (await api(A).get(`${P(id)}/architecture/versions/preview`)).body.data;
    const res = await api(A).post(`${P(id)}/architecture/versions`, { label, baseRevision: p.revision, expectedLatestVersionId: p.latestVersion?.id ?? null, snapshotHash: p.snapshotHash });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data;
  }
  async function save(id, name) {
    const d = (await api(A).get(`${P(id)}/architecture`)).body.data;
    d.model.components.cmp_auth.name = name;
    assert.equal((await api(A).put(`${P(id)}/architecture/draft`, { baseRevision: d.revision, model: d.model })).status, 200);
  }
  async function versionBundle(id, v) {
    const d = (await api(A).post(`${P(id)}/export`, { format: 'ai-md', source: { type: 'version', versionId: v.id }, template: 'design-review' })).body.data;
    return { bundleId: d.bundleId, format: 'ai-md', basis: { source: 'version', versionId: v.id, label: v.label }, scopeLabel: d.scopeLabel, scope: { type: 'project' }, template: 'design-review', question: '', bundleMd: d.content };
  }
  const item = async (id, reviewId) => (await api(A).get(R(id))).body.data.find((r) => r.id === reviewId);

  before(async () => { ({ A } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  it('saves a review against a version bundle and marks it stale after a newer version', async () => {
    const id = await project('stale');
    const v1 = await publish(id, 'v1.0');
    const res = await api(A).post(`${R(id)}/manual`, { bundle: await versionBundle(id, v1), answer: { tool: 'Claude', answerMd: 'v1 검토' }, clientRequestId: randomUUID() });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    let it1 = await item(id, res.body.data.id);
    assert.deepEqual(it1.target, { type: 'version', versionId: v1.id, label: 'v1.0' });
    assert.equal(it1.staleBasis, false);
    assert.equal(it1.requirementsRecord, 'version');
    const row = (await aaDb().from('aa_reviews').select('version_id, draft_revision').eq('id', res.body.data.id).single()).data;
    assert.deepEqual(row, { version_id: v1.id, draft_revision: null });

    await save(id, 'Auth 2');
    const v2 = await publish(id, 'v1.1');
    it1 = await item(id, res.body.data.id);
    assert.equal(it1.staleBasis, true);
    assert.deepEqual(it1.current, { type: 'version', id: v2.id, label: 'v1.1' });
    const detail = (await api(A).get(`${R(id)}/${res.body.data.id}`)).body.data;
    assert.equal(detail.staleBasis, true);
    assert.equal(detail.target.label, 'v1.0');
  });

  it('lets an unlinked answer choose a version or default to the current Draft', async () => {
    const id = await project('unlinked');
    const v1 = await publish(id, 'v1.0');
    await save(id, 'Auth 2');
    const byVersion = await api(A).post(`${R(id)}/manual`, { bundle: null, basis: { source: 'version', versionId: v1.id }, answer: { tool: 'ChatGPT', answerMd: '버전 선택' } });
    assert.equal(byVersion.status, 201, JSON.stringify(byVersion.body));
    const a = await item(id, byVersion.body.data.id);
    assert.equal(a.bundleLinked, false);
    assert.equal(a.target.label, 'v1.0');

    const byDraft = await api(A).post(`${R(id)}/manual`, { bundle: null, answer: { tool: 'ChatGPT', answerMd: '기본 Draft' } });
    const b = await item(id, byDraft.body.data.id);
    assert.deepEqual(b.target, { type: 'draft', revision: 2 });
    assert.equal(b.staleBasis, false);
    assert.equal(b.requirementsRecord, 'none');
    await save(id, 'Auth 3');
    const b2 = await item(id, byDraft.body.data.id);
    assert.equal(b2.staleBasis, true, 'Draft review becomes stale when the Draft moves on');
    assert.deepEqual(b2.current, { type: 'draft', revision: 3 });
  });

  it('rejects versions from other projects and keeps the original basis on retry', async () => {
    const id = await project('guard');
    const other = await project('guard-other');
    const ov = await publish(other, 'v1.0');
    const v1 = await publish(id, 'v1.0');
    const cross = await api(A).post(`${R(id)}/manual`, { bundle: null, basis: { source: 'version', versionId: ov.id }, answer: { tool: 'C', answerMd: 'x' } });
    assert.equal(cross.status, 400);
    const crossBundle = { ...(await versionBundle(id, v1)), basis: { source: 'version', versionId: ov.id, label: 'v1.0' } };
    assert.equal((await api(A).post(`${R(id)}/manual`, { bundle: crossBundle, answer: { tool: 'C', answerMd: 'x' } })).status, 400);
    assert.equal((await api(A).post(`${R(id)}/manual`, { bundle: null, basis: { source: 'nope' }, answer: { tool: 'C', answerMd: 'x' } })).status, 400);

    const cid = randomUUID();
    const first = await api(A).post(`${R(id)}/manual`, { bundle: null, basis: { source: 'version', versionId: v1.id }, answer: { tool: 'C', answerMd: '첫 저장' }, clientRequestId: cid });
    const retry = await api(A).post(`${R(id)}/manual`, { bundle: null, answer: { tool: 'C', answerMd: '재시도' }, clientRequestId: cid });
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.id, first.body.data.id);
    assert.equal((await item(id, first.body.data.id)).target.label, 'v1.0', 'retry does not change the basis');
  });

  it('still accepts Sprint 5 style Draft bundles and the old RPC', async () => {
    const id = await project('compat');
    const d = (await api(A).post(`${P(id)}/export`, { format: 'ai-md' })).body.data;
    const bundle = { bundleId: d.bundleId, format: 'ai-md', basis: { revision: d.basis.revision }, scopeLabel: d.scopeLabel, scope: { type: 'project' }, template: 'design-review', question: '', bundleMd: d.content };
    const res = await api(A).post(`${R(id)}/manual`, { bundle, answer: { tool: 'Claude', answerMd: 'Sprint 5 방식' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((await item(id, res.body.data.id)).requirementsRecord, 'bundle');
    const old = await aaDb().rpc('aa_create_manual_review', {
      p_project: id, p_user: USER_A, p_draft_revision: 1, p_bundle_id: null, p_bundle_scope: null, p_bundle_md: null,
      p_tool: 'Claude', p_answer_md: '옛 RPC', p_client_request_id: null,
    });
    assert.ifError(old.error);
    assert.equal(old.data.existing, false);
  });
});
