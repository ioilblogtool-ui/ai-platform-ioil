// Sprint 5 Step 5 — 샘플 프로젝트 요구사항 시드와 보상 (Q10)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, getTokens, deleteProjects, api, aaDb, USER_A, TEST_PREFIX } = require('../helpers/aa-api');
const sample = require('../../lib/aa/templates/sample-reports');
const { createSampleProject, SampleSeedError, FAILED_PREFIX } = require('../../lib/aa/sample-project');

const silent = { error: () => {} };

/** 실제 DB 위에 특정 호출만 실패시키는 래퍼 */
function faulty(db, { failInsert = false, failDelete = false } = {}) {
  return {
    rpc: (...args) => db.rpc(...args),
    from(table) {
      const q = db.from(table);
      if (table === 'aa_requirements' && failInsert) return { insert: async () => ({ error: { message: 'simulated insert failure' } }) };
      if (table === 'aa_projects' && failDelete) {
        const failing = { eq: () => failing, select: async () => ({ data: null, error: { message: 'simulated delete failure' } }) };
        return { delete: () => failing, update: (...args) => q.update(...args) };
      }
      return q;
    },
  };
}

describe('AA sample project requirement seed', { skip: dbSkipReason }, () => {
  const created = [];
  let A;
  before(async () => { ({ A } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  it('creates NFR-001, NFR-002, FR-001 and links them in the model', async () => {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} seed ${Date.now()}`, template: 'sample-reports' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.data.id;
    created.push(id);

    const reqs = (await api(A).get(`/api/aa/projects/${id}/requirements`)).body.data;
    assert.deepEqual(reqs.map((r) => [r.code, r.kind, r.category]), [
      ['NFR-001', 'nfr', 'performance'], ['NFR-002', 'nfr', 'availability'], ['FR-001', 'fr', null],
    ]);
    assert.equal(reqs[0].target, 'p95 < 300ms');
    const byCode = Object.fromEntries(reqs.map((r) => [r.code, r.id]));

    const { model, revision } = (await api(A).get(`/api/aa/projects/${id}/architecture`)).body.data;
    assert.equal(revision, 1);
    assert.deepEqual(model.components.cmp_reports_api.requirementIds, [byCode['NFR-001'], byCode['FR-001']]);
    assert.deepEqual(model.components.cmp_reports_db.requirementIds, [byCode['NFR-002']]);
    assert.deepEqual(model.components.cmp_web_app.requirementIds, [byCode['FR-001']]);
    assert.deepEqual(model.relations.rel_web_api.requirementIds, [byCode['FR-001']]);
    assert.equal(Object.values(model.relations).filter((r) => r.type === 'calls' && model.components[r.from].layer === 'logical').length, 4, 'Sprint 4 S4-6 Logical 관계 수 유지');

    // 다음 요구사항 코드는 시드 다음 번호
    const next = await api(A).post(`/api/aa/projects/${id}/requirements`, { kind: 'nfr', title: '추가' });
    assert.equal(next.body.data.code, 'NFR-003');

    // 저장해도 연결이 유지된다 (V9가 지우지 않음)
    const save = await api(A).put(`/api/aa/projects/${id}/architecture/draft`, { baseRevision: 1, model });
    assert.equal(save.status, 200);
    assert.deepEqual(save.body.warnings, []);

    // 요구사항 범위 Ask AI: NFR-001 → Reports API와 관계 양 끝
    const ask = await api(A).post(`/api/aa/projects/${id}/export`, { format: 'ai-md', scope: { type: 'requirement', requirementId: byCode['NFR-001'] } });
    assert.equal(ask.status, 200, JSON.stringify(ask.body));
    assert.equal(ask.body.data.scopeLabel, '요구사항 NFR-001');
    assert.match(ask.body.data.content, /NFR-001/);
    assert.ok(!ask.body.data.content.includes(byCode['NFR-001']), 'no requirement UUID in the bundle');
  });

  it('keeps the empty template without requirements', async () => {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} seed empty ${Date.now()}` });
    created.push(res.body.data.id);
    assert.equal((await api(A).get(`/api/aa/projects/${res.body.data.id}/requirements`)).body.total, 0);
  });

  it('removes the new project when the seed fails', async () => {
    const name = `${TEST_PREFIX} seed fail ${Date.now()}`;
    const err = await createSampleProject(faulty(aaDb(), { failInsert: true }), { userId: USER_A, name, description: null, readmeMd: sample.readmeMd, sample }, { log: silent })
      .then(() => null, (e) => e);
    assert.ok(err instanceof SampleSeedError);
    assert.equal(err.compensated, true);
    const left = await aaDb().from('aa_projects').select('id').eq('id', err.projectId);
    assert.equal(left.data.length, 0, 'project removed');
    const drafts = await aaDb().from('aa_architecture_drafts').select('project_id').eq('project_id', err.projectId);
    assert.equal(drafts.data.length, 0, 'draft removed with it');
  });

  it('reports failure and marks the project when cleanup fails too', async () => {
    const name = `${TEST_PREFIX} seed fail twice ${Date.now()}`;
    const logged = [];
    const err = await createSampleProject(faulty(aaDb(), { failInsert: true, failDelete: true }), { userId: USER_A, name, description: null, readmeMd: sample.readmeMd, sample },
      { log: { error: (...args) => logged.push(args) } }).then(() => null, (e) => e);
    assert.ok(err instanceof SampleSeedError);
    assert.equal(err.compensated, false);
    assert.equal(logged.length, 1);
    assert.equal(logged[0][1].projectId, err.projectId, 'projectId in the server log');
    const row = (await aaDb().from('aa_projects').select('name').eq('id', err.projectId).single()).data;
    assert.equal(row.name, FAILED_PREFIX + name);
    // 정리: 이름이 바뀌어 deleteProjects(접두사 조건)로는 지워지지 않는다
    const del = await aaDb().from('aa_projects').delete().eq('id', err.projectId).eq('user_id', USER_A).like('name', `${FAILED_PREFIX}${TEST_PREFIX}%`).select('id');
    assert.equal(del.data.length, 1);
  });
});
