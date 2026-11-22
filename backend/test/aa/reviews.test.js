// Sprint 5 Step 3 — 외부 AI 수동 리뷰 API (S5-5·S5-6·S5-7)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { dbSkipReason, getTokens, deleteProjects, api, aaDb, USER_A, TEST_PREFIX } = require('../helpers/aa-api');

const SECRET = `sk-${'a'.repeat(24)}`;

describe('AA manual reviews', { skip: dbSkipReason }, () => {
  const created = [];
  let A, B, p, q;
  const base = (id) => `/api/aa/projects/${id}/reviews`;
  const countReviews = async (projectId) => (await aaDb().from('aa_reviews').select('id', { count: 'exact', head: true }).eq('project_id', projectId)).count;
  const countAnswers = async (projectId) => (await aaDb().from('aa_review_answers').select('id', { count: 'exact', head: true }).eq('project_id', projectId)).count;

  async function bundleFor(projectId, extra = {}) {
    const res = await api(A).post(`/api/aa/projects/${projectId}/export`, { format: 'ai-md', template: 'failure-scenarios', question: 'DB 장애?', ...extra });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    return { bundleId: d.bundleId, format: 'ai-md', basis: { revision: d.basis.revision }, scopeLabel: d.scopeLabel, scope: extra.scope ?? { type: 'project' }, template: 'failure-scenarios', question: 'DB 장애?', bundleMd: d.content };
  }

  before(async () => {
    ({ A, B } = await getTokens());
    for (const suffix of ['main', 'other']) {
      const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} reviews ${suffix} ${Date.now()}`, template: 'sample-reports' });
      created.push(res.body.data.id);
      if (suffix === 'main') p = res.body.data; else q = res.body.data;
    }
  });
  after(async () => { await deleteProjects(created); });

  it('saves a review linked to a bundle and lists it with source and basis', async () => {
    const bundle = await bundleFor(p.id);
    const res = await api(A).post(`${base(p.id)}/manual`, { bundle, answer: { tool: 'Claude', answerMd: '## 검토\n1. DB 단일 장애점' }, clientRequestId: randomUUID() });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.existing, false);
    const list = await api(A).get(base(p.id));
    const item = list.body.data.find((r) => r.id === res.body.data.id);
    assert.equal(item.source, 'external_ai:Claude');
    assert.deepEqual(item.target, { type: 'draft', revision: 1 });
    assert.equal(item.bundleLinked, true);
    assert.equal(item.scopeLabel, '프로젝트 전체 (Logical)');
    assert.equal(item.answerCount, 1);
    const detail = await api(A).get(`${base(p.id)}/${res.body.data.id}`);
    assert.equal(detail.body.data.bundleMd, bundle.bundleMd);
    assert.equal(detail.body.data.format, 'ai-md');
    assert.deepEqual(detail.body.data.answers.map((a) => a.tool), ['Claude']);
  });

  it('saves without a bundle against the current Draft revision', async () => {
    const d = await api(A).get(`/api/aa/projects/${p.id}/architecture`);
    await api(A).put(`/api/aa/projects/${p.id}/architecture/draft`, { baseRevision: d.body.data.revision, model: d.body.data.model });
    const res = await api(A).post(`${base(p.id)}/manual`, { bundle: null, answer: { tool: 'ChatGPT', answerMd: '답변' } });
    assert.equal(res.status, 201);
    const item = (await api(A).get(base(p.id))).body.data.find((r) => r.id === res.body.data.id);
    assert.equal(item.bundleLinked, false);
    assert.equal(item.target.revision, d.body.data.revision + 1);
  });

  it('is idempotent per clientRequestId (retry after a lost response)', async () => {
    const before = await countReviews(p.id);
    const body = { bundle: null, answer: { tool: 'Claude', answerMd: '같은 요청' }, clientRequestId: randomUUID() };
    const first = await api(A).post(`${base(p.id)}/manual`, body);
    const second = await api(A).post(`${base(p.id)}/manual`, body);
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.data.existing, true);
    assert.equal(second.body.data.id, first.body.data.id);
    assert.equal(second.body.data.answerId, first.body.data.answerId);
    assert.equal(await countReviews(p.id), before + 1);
  });

  it('adds answers and follow-ups to the same review, with idempotency and guards', async () => {
    const r = (await api(A).post(`${base(p.id)}/manual`, { bundle: await bundleFor(p.id), answer: { tool: 'Claude', answerMd: '첫 답' } })).body.data;
    const add = await api(A).post(`${base(p.id)}/${r.id}/answers`, { tool: 'ChatGPT', answerMd: '두 번째 답', clientRequestId: randomUUID() });
    assert.equal(add.status, 201);
    const follow = await api(A).post(`${base(p.id)}/${r.id}/answers`, { tool: 'Claude', answerMd: '추가 답', followUpOf: r.answerId, followUpQuestion: '복구 시간은?' });
    assert.equal(follow.status, 201);
    const cid = randomUUID();
    const once = await api(A).post(`${base(p.id)}/${r.id}/answers`, { tool: 'Gemini', answerMd: 'x', clientRequestId: cid });
    const twice = await api(A).post(`${base(p.id)}/${r.id}/answers`, { tool: 'Gemini', answerMd: 'x', clientRequestId: cid });
    assert.equal(once.status, 201);
    assert.equal(twice.status, 200);
    assert.equal(twice.body.data.id, once.body.data.id);
    const detail = (await api(A).get(`${base(p.id)}/${r.id}`)).body.data;
    assert.deepEqual(detail.answers.map((a) => a.tool), ['Claude', 'ChatGPT', 'Claude', 'Gemini']);
    assert.equal(detail.answers[2].followUpOf, r.answerId);
    assert.equal(detail.answers[2].followUpQuestion, '복구 시간은?');
    assert.deepEqual(detail.tools, ['Claude', 'ChatGPT', 'Gemini']);

    // 다른 리뷰의 답변을 followUpOf로 주면 400
    const other = (await api(A).post(`${base(p.id)}/manual`, { bundle: null, answer: { tool: 'Claude', answerMd: '다른 리뷰' } })).body.data;
    const cross = await api(A).post(`${base(p.id)}/${r.id}/answers`, { tool: 'Claude', answerMd: 'x', followUpOf: other.answerId });
    assert.equal(cross.status, 400);
  });

  it('rejects answers on API-mode reviews with 409', async () => {
    const { data, error } = await aaDb().from('aa_reviews').insert({
      project_id: p.id, user_id: USER_A, draft_revision: 1, mode: 'api', model_snapshot: {}, model_hash: 'h', status: 'done',
    }).select('id').single();
    assert.ifError(error);
    const res = await api(A).post(`${base(p.id)}/${data.id}/answers`, { tool: 'Claude', answerMd: 'x' });
    assert.equal(res.status, 409);
  });

  it('blocks keys and tokens anywhere and saves nothing', async () => {
    const reviews = await countReviews(p.id), answers = await countAnswers(p.id);
    const bundle = await bundleFor(p.id);
    const cases = [
      { bundle: null, answer: { tool: 'Claude', answerMd: `키 ${SECRET}` } },
      { bundle: null, answer: { tool: SECRET.slice(0, 30), answerMd: 'x' } },
      { bundle: { ...bundle, question: `질문 안에 ${SECRET}` }, answer: { tool: 'Claude', answerMd: 'x' } },
      { bundle: { ...bundle, scopeLabel: `범위 ${SECRET}` }, answer: { tool: 'Claude', answerMd: 'x' } },
      { bundle: { ...bundle, bundleMd: `${bundle.bundleMd}\n${SECRET}` }, answer: { tool: 'Claude', answerMd: 'x' } },
    ];
    for (const body of cases) {
      const res = await api(A).post(`${base(p.id)}/manual`, body);
      assert.equal(res.status, 400, JSON.stringify(res.body).slice(0, 200));
      assert.equal(res.body.code, 'SENSITIVE_DATA_DETECTED');
      assert.ok(!JSON.stringify(res.body).includes(SECRET), 'masked');
    }
    assert.equal(await countReviews(p.id), reviews);
    assert.equal(await countAnswers(p.id), answers);
  });

  it('enforces byte limits, body limit and basis revision', async () => {
    const big = (n) => 'a'.repeat(n);
    assert.equal((await api(A).post(`${base(p.id)}/manual`, { bundle: null, answer: { tool: 'C', answerMd: big(256 * 1024) } })).status, 201);
    assert.equal((await api(A).post(`${base(p.id)}/manual`, { bundle: null, answer: { tool: 'C', answerMd: big(256 * 1024 + 1) } })).status, 400);
    assert.equal((await api(A).post(`${base(p.id)}/manual`, { bundle: null, answer: { tool: 'C', answerMd: '가'.repeat(90000) } })).status, 400, '270KB in UTF-8');
    const bundle = await bundleFor(p.id);
    assert.equal((await api(A).post(`${base(p.id)}/manual`, { bundle: { ...bundle, bundleMd: big(512 * 1024 + 1) }, answer: { tool: 'C', answerMd: 'x' } })).status, 400);
    const huge = await api(A).post(`${base(p.id)}/manual`, { bundle: null, answer: { tool: 'C', answerMd: big(1100 * 1024) } });
    assert.equal(huge.status, 413);
    assert.equal(huge.body.code, 'PAYLOAD_TOO_LARGE');
    assert.equal((await api(A).post(`${base(p.id)}/manual`, { bundle: { ...bundle, basis: { revision: 999 } }, answer: { tool: 'C', answerMd: 'x' } })).status, 400);
    assert.equal((await api(A).post(`${base(p.id)}/manual`, { bundle: { ...bundle, bundleId: 'nope' }, answer: { tool: 'C', answerMd: 'x' } })).status, 400);
    assert.equal((await api(A).post(`${base(p.id)}/manual`, { bundle: null, answer: { tool: '', answerMd: 'x' } })).status, 400);
  });

  it('rolls back the review when the first answer insert fails (RPC atomicity)', async () => {
    const reviews = await countReviews(p.id);
    const { error } = await aaDb().rpc('aa_create_manual_review', {
      p_project: p.id, p_user: USER_A, p_draft_revision: 1, p_bundle_id: null, p_bundle_scope: null, p_bundle_md: null,
      p_tool: 'Claude', p_answer_md: 'a'.repeat(262145), p_client_request_id: null,   // answer_md check 위반
    });
    assert.ok(error, 'the RPC must fail');
    assert.equal(await countReviews(p.id), reviews, 'no review row left behind');
  });

  it('keeps reviews inside their owner and project', async () => {
    const r = (await api(A).post(`${base(p.id)}/manual`, { bundle: null, answer: { tool: 'Claude', answerMd: 'x' } })).body.data;
    assert.equal((await api(B).get(base(p.id))).status, 404);
    assert.equal((await api(B).get(`${base(p.id)}/${r.id}`)).status, 404);
    assert.equal((await api(A).get(`${base(q.id)}/${r.id}`)).status, 404, 'review id from another project');
    assert.equal((await api(A).post(`${base(q.id)}/${r.id}/answers`, { tool: 'C', answerMd: 'x' })).status, 404);
    assert.equal((await api(A).get(`${base(p.id)}/not-a-uuid`)).status, 404);
  });
});
