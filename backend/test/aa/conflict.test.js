// A4: 두 탭 저장 — 오래된 revision은 409, 사용자가 확인한 revision으로만 덮어쓰기, 조용한 유실 없음
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, getTokens, deleteProjects, api, createProject, emptyModel, sampleModel, canonical } = require('../helpers/aa-api');

describe('AA draft revision conflict', { skip: dbSkipReason }, () => {
  const created = [];
  let A, project, url;
  before(async () => {
    A = (await getTokens()).A;
    project = await createProject(A, created, 'conflict');
    url = `/api/aa/projects/${project.id}/architecture/draft`;
  });
  after(async () => { await deleteProjects(created); });

  it('탭1·탭2가 모두 rev 1에서 시작 → 탭1 저장 성공, 탭2 저장은 409', async () => {
    const tab1 = sampleModel();
    const tab2 = emptyModel();
    const s1 = await api(A).put(url, { baseRevision: 1, model: tab1 });
    assert.equal(s1.status, 200);
    assert.equal(s1.body.data.revision, 2);

    const s2 = await api(A).put(url, { baseRevision: 1, model: tab2 });
    assert.equal(s2.status, 409);
    assert.equal(s2.body.code, 'REVISION_CONFLICT');
    assert.equal(s2.body.details.currentRevision, 2);

    const g = await api(A).get(`/api/aa/projects/${project.id}/architecture`);
    assert.deepEqual(canonical(g.body.data.model), canonical(tab1));   // 탭1 변경이 남아 있음
  });

  it('탭2가 확인한 revision(2)으로 다시 보내면 덮어쓰기 성공', async () => {
    const s = await api(A).put(url, { baseRevision: 2, model: emptyModel() });
    assert.equal(s.status, 200);
    assert.equal(s.body.data.revision, 3);
  });

  it('확인 모달이 열린 사이 다른 탭이 또 저장하면 다시 409', async () => {
    // 탭2가 409로 currentRevision 3을 받음 → 그 사이 탭1이 rev 3에서 저장(→4)
    const t1 = await api(A).put(url, { baseRevision: 3, model: sampleModel() });
    assert.equal(t1.status, 200);
    const t2 = await api(A).put(url, { baseRevision: 3, model: emptyModel() });
    assert.equal(t2.status, 409);
    assert.equal(t2.body.details.currentRevision, 4);
  });

  it('force 같은 옵션으로 revision 검사를 건너뛸 수 없다', async () => {
    const s = await api(A).put(url, { baseRevision: 1, model: emptyModel(), force: true });
    assert.equal(s.status, 409);
  });

  it('잘못된 baseRevision은 400', async () => {
    for (const baseRevision of [0, -1, '4', 1.5, undefined]) {
      const s = await api(A).put(url, { baseRevision, model: emptyModel() });
      assert.equal(s.status, 400, `baseRevision=${baseRevision}`);
    }
  });
});
