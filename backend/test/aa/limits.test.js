// A6: 모델 한도(1MB) 413 MODEL_TOO_LARGE · 본문 한도(2MB) 413 PAYLOAD_TOO_LARGE · 잘못된 JSON 400 · 100KB 초과 모델 정상 저장
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, getTokens, deleteProjects, api, createProject, sampleModel, largeModel } = require('../helpers/aa-api');

describe('AA size limits & error format', { skip: dbSkipReason }, () => {
  const created = [];
  let A, project, url;
  before(async () => {
    A = (await getTokens()).A;
    project = await createProject(A, created, 'limits');
    url = `/api/aa/projects/${project.id}/architecture/draft`;
  });
  after(async () => { await deleteProjects(created); });

  it('100노드 모델(본문 100KB 초과)은 저장된다', async () => {
    const body = { baseRevision: 1, model: largeModel(100) };
    assert.ok(Buffer.byteLength(JSON.stringify(body)) > 100 * 1024);
    const s = await api(A).put(url, body);
    assert.equal(s.status, 200);
  });

  it('1.2MB 모델 → 413 MODEL_TOO_LARGE (JSON)', async () => {
    const m = sampleModel();
    m.components.cmp_api00001.description = 'x'.repeat(1.2 * 1024 * 1024);
    const s = await api(A).put(url, { baseRevision: 2, model: m });
    assert.equal(s.status, 413);
    assert.equal(s.body.code, 'MODEL_TOO_LARGE');
    assert.ok(s.body.details.bytes > s.body.details.limit);
  });

  it('2.5MB 본문 → 413 PAYLOAD_TOO_LARGE (JSON, 500 아님)', async () => {
    const m = sampleModel();
    m.components.cmp_api00001.description = 'x'.repeat(2.5 * 1024 * 1024);
    const s = await api(A).put(url, { baseRevision: 2, model: m });
    assert.equal(s.status, 413);
    assert.match(s.headers['content-type'], /json/);
    assert.equal(s.body.code, 'PAYLOAD_TOO_LARGE');
  });

  it('잘못된 JSON → 400 VALIDATION_FAILED', async () => {
    const s = await api(A).raw('put', url).set('Content-Type', 'application/json').send('{"baseRevision": 2, "model": ');
    assert.equal(s.status, 400);
    assert.equal(s.body.code, 'VALIDATION_FAILED');
  });

  it('기존 라우트도 100KB 초과 본문은 413 JSON (이전엔 500)', async () => {
    const s = await api(A).post('/api/chat', { message: 'x'.repeat(200 * 1024) });
    assert.equal(s.status, 413);
    assert.equal(s.body.code, 'PAYLOAD_TOO_LARGE');
  });

  it('거부된 저장들 뒤에도 Draft는 rev 2 그대로', async () => {
    const g = await api(A).get(`/api/aa/projects/${project.id}/architecture`);
    assert.equal(g.body.data.revision, 2);
  });

  it('모델 검증 실패(V2)·민감정보(V12)는 400과 규칙 목록', async () => {
    const bad = sampleModel();
    bad.relations.rel_x = { id: 'rel_x', type: 'calls', from: 'cmp_api00001', to: 'cmp_missing', requirementIds: [] };
    bad.components.cmp_api00001.properties.key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const s = await api(A).put(url, { baseRevision: 2, model: bad });
    assert.equal(s.status, 400);
    const rules = s.body.details.map((e) => e.rule);
    assert.ok(rules.includes('V2') && rules.includes('V12'));
    assert.ok(!JSON.stringify(s.body).includes('ABCDEFGHIJKLMNOP'));
  });
});
