// Sprint 6 Step 2 — 버전 발행·열람·복원 API (S6-1~S6-6)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, getTokens, deleteProjects, api, aaDb, USER_A, TEST_PREFIX } = require('../helpers/aa-api');

const SECRET = `sk-${'b'.repeat(24)}`;

describe('AA versions', { skip: dbSkipReason }, () => {
  const created = [];
  let A, B;
  const P = (id) => `/api/aa/projects/${id}`;
  const V = (id) => `${P(id)}/architecture/versions`;

  async function sampleProject(suffix) {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} versions ${suffix} ${Date.now()}`, template: 'sample-reports' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(res.body.data.id);
    return res.body.data.id;
  }
  const draft = async (id) => (await api(A).get(`${P(id)}/architecture`)).body.data;
  const preview = async (id) => (await api(A).get(`${V(id)}/preview`)).body.data;
  const reqByCode = async (id) => Object.fromEntries((await api(A).get(`${P(id)}/requirements`)).body.data.map((r) => [r.code, r]));
  const versionCount = async (id) => (await aaDb().from('aa_architecture_versions').select('id', { count: 'exact', head: true }).eq('project_id', id)).count;
  async function publish(id, body = {}) {
    const p = await preview(id);
    return api(A).post(V(id), { baseRevision: p.revision, expectedLatestVersionId: p.latestVersion?.id ?? null, snapshotHash: p.snapshotHash, ...body });
  }
  async function save(id, mutate) {
    const d = await draft(id);
    mutate(d.model);
    const res = await api(A).put(`${P(id)}/architecture/draft`, { baseRevision: d.revision, model: d.model });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.data.revision;
  }

  before(async () => { ({ A, B } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  it('S6-1 publishes the first version and the next one with a suggested label', async () => {
    const id = await sampleProject('first');
    const p = await preview(id);
    assert.equal(p.latestVersion, null);
    assert.equal(p.suggestedLabel, 'v1.0');
    assert.equal(p.noChanges, false);
    // Sprint 7: 샘플에 배치안 2개 — Logical 4 + 배치안 18 컴포넌트, calls 4 + 배치안 calls 4 + realizes 8
    // Sprint 8: PaaS에 사용자 브라우저·web client(+2), web client→backend calls·realizes(+2)
    assert.deepEqual(p.summary, { hashVersion: 1, first: true, components: 24, relations: 18 });

    const res = await publish(id, { label: 'v1.0', note: '첫 버전' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.versionNo, 1);
    const d = await draft(id);
    assert.equal(d.revision, 1, 'publishing does not bump the Draft revision');
    assert.deepEqual(d.baseVersion, { id: res.body.data.id, label: 'v1.0', versionNo: 1 });

    const list = (await api(A).get(V(id))).body;
    assert.equal(list.total, 1);
    assert.equal(list.data[0].note, '첫 버전');
    assert.equal(list.data[0].sourceRevision, 1);
    assert.equal((await api(A).get(P(id))).body.data.counts.versions, 1);
    const inList = (await api(A).get('/api/aa/projects?limit=200')).body.data.find((x) => x.id === id);
    assert.equal(inList.latestVersion.label, 'v1.0');

    await save(id, (m) => { m.components.cmp_reports_api.technology = 'Go'; });
    const p2 = await preview(id);
    assert.equal(p2.suggestedLabel, 'v1.1');
    assert.equal(p2.summary.componentsModified, 1);
    const second = await publish(id, {});   // 라벨 생략 → 제안값
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.data.label, 'v1.1');
  });

  it('S6-2 refuses no-change and layout-only publishes, allows requirement-only changes', async () => {
    const id = await sampleProject('nochange');
    assert.equal((await publish(id, { label: 'v1.0' })).status, 201);

    const same = await publish(id, {});
    assert.equal(same.status, 409);
    assert.equal(same.body.code, 'NO_CHANGES');

    await save(id, (m) => { m.views[0].nodes[1].position = { x: 5, y: 5 }; });
    const p = await preview(id);
    assert.equal(p.noChanges, true);
    assert.equal(p.layoutOnly, 1);
    const moved = await publish(id, {});
    assert.equal(moved.status, 409);
    assert.equal(moved.body.code, 'NO_CHANGES');
    assert.equal(moved.body.details.layoutOnly, 1);

    const nfr = (await reqByCode(id))['NFR-001'];
    assert.equal((await api(A).patch(`${P(id)}/requirements/${nfr.id}`, { target: 'p95 < 200ms' })).status, 200);
    const pr = await preview(id);
    assert.equal(pr.noChanges, false);
    assert.equal(pr.summary.requirementsChanged, 1);
    const reqOnly = await publish(id, { label: 'v1.1' });
    assert.equal(reqOnly.status, 201, JSON.stringify(reqOnly.body));
    const detail = (await api(A).get(`${V(id)}/${reqOnly.body.data.id}`)).body.data;
    assert.equal(detail.requirements.find((r) => r.code === 'NFR-001').target, 'p95 < 200ms');

    await save(id, (m) => { m.views[0].nodes[2].position = { x: 7, y: 7 }; });
    assert.equal((await api(A).patch(`${P(id)}/requirements/${nfr.id}`, { target: 'p95 < 150ms' })).status, 200);
    const both = await publish(id, { label: 'v1.2' });
    assert.equal(both.status, 201);
    const d2 = (await api(A).get(`${V(id)}/${both.body.data.id}`)).body.data;
    assert.equal(d2.requirements.find((r) => r.code === 'NFR-001').target, 'p95 < 150ms');
    assert.equal(d2.diffSummary.layoutOnly, 1);
  });

  it('S6-3 handles concurrent and stale publishes without partial writes', async () => {
    const id = await sampleProject('race');
    const p = await preview(id);
    const body = (label) => ({ baseRevision: p.revision, expectedLatestVersionId: null, snapshotHash: p.snapshotHash, label });
    // ① 같은 revision을 다른 라벨로 동시에
    const [r1, r2] = await Promise.all([api(A).post(V(id), body('A-1')), api(A).post(V(id), body('B-1'))]);
    assert.deepEqual([r1.status, r2.status].sort(), [201, 409], JSON.stringify([r1.body, r2.body]));
    assert.ok(['VERSION_CHANGED', 'NO_CHANGES'].includes((r1.status === 409 ? r1 : r2).body.code));
    assert.equal(await versionCount(id), 1);
    const winner = (r1.status === 201 ? r1 : r2).body.data;
    const base = async () => (await draft(id)).baseVersion?.id;
    assert.equal(await base(), winner.id);

    // ② 같은 라벨 (순서대로) → LABEL_TAKEN, ②' 같은 라벨 동시 → 1건
    await save(id, (m) => { m.components.cmp_auth.name = 'Auth 2'; });
    const taken = await publish(id, { label: winner.label });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.code, 'LABEL_TAKEN');
    const q = await preview(id);
    const sameLabel = { baseRevision: q.revision, expectedLatestVersionId: q.latestVersion.id, snapshotHash: q.snapshotHash, label: 'v2.0' };
    const both = await Promise.all([api(A).post(V(id), sameLabel), api(A).post(V(id), sameLabel)]);
    assert.deepEqual(both.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await versionCount(id), 2);

    // ③ 미리보기 뒤 Draft 저장
    const before = await versionCount(id);
    const baseBefore = await base();
    const stale = await preview(id);
    await save(id, (m) => { m.components.cmp_auth.name = 'Auth 3'; });
    const conflict = await api(A).post(V(id), { baseRevision: stale.revision, expectedLatestVersionId: stale.latestVersion.id, snapshotHash: stale.snapshotHash, label: 'v3.0' });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, 'REVISION_CONFLICT');

    // ④ 미리보기 뒤 요구사항 수정
    const s4 = await preview(id);
    const nfr = (await reqByCode(id))['NFR-002'];
    await api(A).patch(`${P(id)}/requirements/${nfr.id}`, { title: '리포트 DB 가용성 (수정)' });
    const staleReq = await api(A).post(V(id), { baseRevision: s4.revision, expectedLatestVersionId: s4.latestVersion.id, snapshotHash: s4.snapshotHash, label: 'v3.0' });
    assert.equal(staleReq.status, 409);
    assert.equal(staleReq.body.code, 'PREVIEW_STALE');

    // ⑤ 미리보기 뒤 다른 요청이 먼저 발행
    const s5 = await preview(id);
    assert.equal((await publish(id, { label: 'v3.0' })).status, 201);
    const late = await api(A).post(V(id), { baseRevision: s5.revision, expectedLatestVersionId: s5.latestVersion.id, snapshotHash: s5.snapshotHash, label: 'v3.1' });
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'VERSION_CHANGED');
    assert.equal(late.body.details.latestVersion.label, 'v3.0');
    assert.equal(await versionCount(id), before + 1, 'only the ⑤ winner was added');
    assert.notEqual(await base(), baseBefore);

    // 라벨·메모 검사
    await save(id, (m) => { m.components.cmp_auth.name = 'Auth 4'; });
    for (const bad of [{ label: `v ${SECRET}` }, { note: `메모 ${SECRET}` }]) {
      const r = await publish(id, bad);
      assert.equal(r.status, 400);
      assert.equal(r.body.code, 'SENSITIVE_DATA_DETECTED');
      assert.ok(!JSON.stringify(r.body).includes(SECRET));
    }
    assert.equal((await publish(id, { label: 'x'.repeat(41) })).status, 400);
    assert.equal((await publish(id, { note: 'x'.repeat(2001) })).status, 400);
    assert.equal((await api(A).post(V(id), { baseRevision: 1 })).status, 400, 'preview fields are required');
  });

  it('S6-4 keeps versions immutable and deletes them with the project', async () => {
    const id = await sampleProject('immutable');
    const v = (await publish(id, { label: 'v1.0' })).body.data;
    const up = await aaDb().from('aa_architecture_versions').update({ label: 'hack' }).eq('id', v.id);
    assert.ok(up.error && /immutable/.test(up.error.message), JSON.stringify(up.error));
    const del = await aaDb().from('aa_architecture_versions').delete().eq('id', v.id);
    assert.ok(del.error && /immutable/.test(del.error.message));
    const r = await aaDb().rpc('aa_create_manual_review_at', {
      p_project: id, p_user: USER_A, p_draft_revision: null, p_version: v.id, p_bundle_id: null, p_bundle_scope: null,
      p_bundle_md: null, p_tool: 'Claude', p_answer_md: '버전 기준 답', p_client_request_id: null,
    });
    assert.equal(r.data?.status, 'ok', JSON.stringify(r));

    const name = (await api(A).get(P(id))).body.data.name;
    assert.equal((await api(A).del(`${P(id)}?confirm=${encodeURIComponent(name)}`)).status, 204);
    created.splice(created.indexOf(id), 1);
    for (const table of ['aa_architecture_versions', 'aa_architecture_drafts', 'aa_reviews', 'aa_review_answers']) {
      const { count } = await aaDb().from(table).select('*', { count: 'exact', head: true }).eq('project_id', id);
      assert.equal(count, 0, table);
    }
  });

  it('S6-5·S6-6 shows publish-time requirements and restores without dangling references', async () => {
    const id = await sampleProject('restore');
    const v1 = (await publish(id, { label: 'v1.0' })).body.data;
    const codes = await reqByCode(id);
    await api(A).patch(`${P(id)}/requirements/${codes['NFR-001'].id}`, { target: 'p95 < 100ms' });
    const nfr2 = codes['NFR-002'].id;
    const inUse = await api(A).del(`${P(id)}/requirements/${nfr2}`);
    assert.equal(inUse.status, 409, 'referenced requirement cannot be deleted');
    await save(id, (m) => { m.components.cmp_reports_db.requirementIds = []; });
    assert.equal((await api(A).del(`${P(id)}/requirements/${nfr2}`)).status, 204);

    const detail = (await api(A).get(`${V(id)}/${v1.id}`)).body.data;
    const n1 = detail.requirements.find((r) => r.code === 'NFR-001');
    assert.equal(n1.target, 'p95 < 300ms');
    assert.equal(n1.current.target, 'p95 < 100ms');
    assert.equal(detail.requirements.find((r) => r.code === 'NFR-002').deleted, true);
    assert.ok(detail.readmeMd.includes('## 목적'));
    assert.deepEqual(detail.model.components.cmp_reports_db.requirementIds, [nfr2], 'version model is untouched');

    const d = await draft(id);
    const restored = await api(A).post(`${V(id)}/${v1.id}/restore`, { baseRevision: d.revision });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.data.revision, d.revision + 1);
    assert.deepEqual(restored.body.warnings.map((w) => w.removedIds).flat(), [nfr2]);
    const after = await draft(id);
    assert.equal(after.revision, d.revision + 1);
    assert.deepEqual(after.baseVersion.label, 'v1.0');
    assert.equal(after.warnings, undefined, 'no dangling reference stored');
    const expected = structuredClone(detail.model);
    expected.components.cmp_reports_db.requirementIds = [];
    assert.deepEqual(after.model, expected);

    assert.equal((await api(A).post(`${V(id)}/${v1.id}/restore`, { baseRevision: d.revision })).status, 409);
    // 복원과 저장 경쟁: 같은 baseRevision이면 하나만 성공
    const cur = await draft(id);
    const [rs, sv] = await Promise.all([
      api(A).post(`${V(id)}/${v1.id}/restore`, { baseRevision: cur.revision }),
      api(A).put(`${P(id)}/architecture/draft`, { baseRevision: cur.revision, model: cur.model }),
    ]);
    assert.deepEqual([rs.status, sv.status].sort(), [200, 409]);
  });

  it('keeps versions inside their owner and project', async () => {
    const a = await sampleProject('owner-a');
    const b = await sampleProject('owner-b');
    const v = (await publish(a, { label: 'v1.0' })).body.data;
    assert.equal((await api(B).get(V(a))).status, 404);
    assert.equal((await api(B).get(`${V(a)}/preview`)).status, 404);
    assert.equal((await api(A).get(`${V(b)}/${v.id}`)).status, 404, 'version id from another project');
    const db = await draft(b);
    assert.equal((await api(A).post(`${V(b)}/${v.id}/restore`, { baseRevision: db.revision })).status, 404);
    assert.equal((await api(A).get(`${V(a)}/not-a-uuid`)).status, 404);
  });
});
