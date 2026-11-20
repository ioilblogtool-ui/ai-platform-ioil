// A1·A6: 저장 → 다시 조회 시 노드·관계·속성·좌표 100% 복원 (빈 / 샘플 / 100노드)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, getTokens, deleteProjects, api, createProject, emptyModel, sampleModel, largeModel, canonical } = require('../helpers/aa-api');

describe('AA draft round-trip', { skip: dbSkipReason }, () => {
  const created = [];
  let A;
  before(async () => { A = (await getTokens()).A; });
  after(async () => { await deleteProjects(created); });

  it('새 프로젝트는 README 템플릿과 빈 Draft(rev 1)로 시작한다', async () => {
    const p = await createProject(A, created, 'roundtrip-new');
    assert.match(p.readmeMd, /^## 목적/);
    const d = await api(A).get(`/api/aa/projects/${p.id}/architecture`);
    assert.equal(d.status, 200);
    assert.equal(d.body.data.revision, 1);
    assert.deepEqual(canonical(d.body.data.model), canonical(emptyModel()));
  });

  for (const [label, build] of [['빈 모델', emptyModel], ['샘플 3노드', sampleModel], ['100노드', () => largeModel(100)]]) {
    it(`${label}: 저장 후 다시 열면 deep-equal`, async () => {
      const p = await createProject(A, created, `roundtrip-${label}`);
      const model = build();
      const s = await api(A).put(`/api/aa/projects/${p.id}/architecture/draft`, { baseRevision: 1, model });
      assert.equal(s.status, 200, JSON.stringify(s.body));
      assert.equal(s.body.data.revision, 2);
      const g = await api(A).get(`/api/aa/projects/${p.id}/architecture`);
      assert.equal(g.body.data.revision, 2);
      assert.deepEqual(canonical(g.body.data.model), canonical(model));
    });
  }

  it('목록에 Draft revision이 보인다', async () => {
    const p = await createProject(A, created, 'roundtrip-list');
    const l = await api(A).get('/api/aa/projects?q=roundtrip-list');
    assert.equal(l.status, 200);
    const row = l.body.data.find((x) => x.id === p.id);
    assert.equal(row.draftRevision, 1);
  });
});
