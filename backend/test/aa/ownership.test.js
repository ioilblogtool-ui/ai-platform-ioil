// A2: 다른 사용자의 프로젝트와 하위 경로 전체 → 404, 데이터 변경 없음
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, getTokens, deleteProjects, aaDb, USER_A, USER_B, api, createProject, sampleModel } = require('../helpers/aa-api');

describe('AA project ownership', { skip: dbSkipReason }, () => {
  const created = [];
  let A, B, project;
  before(async () => {
    ({ A, B } = await getTokens());
    project = await createProject(A, created, 'ownership');
  });
  after(async () => { await deleteProjects(created); });

  it('토큰이 없으면 401', async () => {
    assert.equal((await api(null).get('/api/aa/projects')).status, 401);
  });

  it('사용자 B는 A 프로젝트의 모든 경로에서 404', async () => {
    const id = project.id;
    const attempts = [
      api(B).get(`/api/aa/projects/${id}`),
      api(B).patch(`/api/aa/projects/${id}`, { name: 'hacked' }),
      api(B).del(`/api/aa/projects/${id}?confirm=${encodeURIComponent(project.name)}`),
      api(B).get(`/api/aa/projects/${id}/architecture`),
      api(B).put(`/api/aa/projects/${id}/architecture/draft`, { baseRevision: 1, model: sampleModel() }),
    ];
    for (const res of await Promise.all(attempts)) {
      assert.equal(res.status, 404);
      assert.equal(res.body.code, 'NOT_FOUND');
    }
  });

  it('B의 시도 뒤에도 A의 프로젝트와 Draft는 그대로', async () => {
    const db = aaDb();
    const { data: p } = await db.from('aa_projects').select('name, user_id').eq('id', project.id).single();
    assert.equal(p.name, project.name);
    assert.equal(p.user_id, USER_A);
    const { data: d } = await db.from('aa_architecture_drafts').select('revision').eq('project_id', project.id).single();
    assert.equal(d.revision, 1);
  });

  it('B의 목록에는 A 프로젝트가 없다', async () => {
    const l = await api(B).get('/api/aa/projects?limit=200');
    assert.equal(l.status, 200);
    assert.ok(!l.body.data.some((x) => x.id === project.id));
  });

  it('잘못된 프로젝트 id 형식도 404', async () => {
    assert.equal((await api(A).get('/api/aa/projects/not-a-uuid')).status, 404);
  });

  it('DB도 사용자 불일치 행을 거부한다 (복합 FK)', async () => {
    const { error } = await aaDb().from('aa_requirements')
      .insert({ project_id: project.id, user_id: USER_B, code: 'NFR-999', kind: 'nfr', title: 'x' });
    assert.ok(error);
    assert.equal(error.code, '23503');
  });

  it('삭제는 이름 확인이 맞아야 하고, 지운 뒤에는 404', async () => {
    const p = await createProject(A, created, 'ownership-delete');
    assert.equal((await api(A).del(`/api/aa/projects/${p.id}?confirm=wrong`)).status, 400);
    assert.equal((await api(A).del(`/api/aa/projects/${p.id}?confirm=${encodeURIComponent(p.name)}`)).status, 204);
    assert.equal((await api(A).get(`/api/aa/projects/${p.id}`)).status, 404);
    const { data } = await aaDb().from('aa_architecture_drafts').select('project_id').eq('project_id', p.id);
    assert.equal(data.length, 0);   // Draft도 cascade 삭제
  });
});
