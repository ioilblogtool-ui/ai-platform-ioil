// Sprint 11 Step 5: sample-migration 확장(Q10), Publish 미리보기 V19 경고(C2), 발행·Compare·복원(S11-4a~d), 예약 필드(S11-5)
// 계약: 03 "Sprint 11 모델 계약", 05 "Sprint 11 Draft·Publish·Compare", Sprint 11 실행계획 v0.3.1
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { validateModel, placementWarnings } = require('../../lib/aa/architecture-validator');
const { normalizeModel } = require('../../lib/aa/normalize');
const { referencedRequirementIds } = require('../../lib/aa/requirement-refs');
const sample = require('../../lib/aa/templates/sample-migration');
const { dbSkipReason, getTokens, deleteProjects, api, TEST_PREFIX } = require('../helpers/aa-api');

const AWS = 'view_aws_migration';
const VM = 'view_dep_migration';
const OPS = 'view_dep_ops';
const NFR = '33333333-3333-4333-8333-333333333333';

describe('sample-migration 확장 (Q10)', () => {
  it('NFR-001 한 건을 시드하고, 모델은 검증을 경고 없이 통과한다', () => {
    assert.deepEqual(sample.requirements.map((r) => [r.kind, r.target]), [['nfr', 'p95 < 300ms']]);
    for (const m of [sample.model(), sample.model({ nfr_query_latency: NFR })]) {
      const r = validateModel(m);
      assert.deepEqual(r.errors, []);
      assert.deepEqual(placementWarnings(m), []);
    }
  });

  it('운영 설계 배치안: 조회 API 참조 노드, ops 8종, 관계 7종(표시 엣지 포함)', () => {
    const m = sample.model();
    const ops = m.views.find((v) => v.id === OPS);
    assert.equal(ops.kind, 'deployment');
    assert.ok(ops.nodes.some((n) => n.componentId === 'cmp_query'));
    const types = ops.nodes.map((n) => m.components[n.componentId].type).filter((t) => t.startsWith('ops.')).sort();
    assert.deepEqual(types, ['ops.alerting', 'ops.ci', 'ops.collector', 'ops.config_repo', 'ops.gitops', 'ops.metrics', 'ops.registry', 'ops.telemetry']);
    const rels = ops.edges.map((e) => m.relations[e.relationId].type).sort();
    assert.deepEqual(rels, ['alerts_to', 'builds', 'exports_traces', 'pushes', 'scrapes', 'ships_logs', 'syncs']);
    assert.equal(m.components.cmp_argo.properties.prodSync, 'manual');
    assert.deepEqual(m.components.cmp_collector.properties.maskFields, ['email', 'token']);
  });

  it('목표 AWS 전략: canary 10→50→100, 게이트 2개(하나는 NFR-001), VM 복귀 대상 "현재 · VM", 사례용 가정 표시', () => {
    const m = sample.model({ nfr_query_latency: NFR });
    const st = m.views.find((v) => v.id === AWS).strategy;
    assert.deepEqual(st.release.canary.steps.map((s) => s.weight), [10, 50, 100]);
    assert.equal(st.gates.length, 2);
    assert.deepEqual(st.gates[1].requirementIds, [NFR]);
    assert.deepEqual(m.components.cmp_alert.requirementIds, [NFR]);
    assert.equal(st.fallback.targetViewId, VM);
    assert.equal(st.fallback.switchMethod, 'lb-weight');
    assert.match(st.fallback.dbCondition, /사례용 가정/);
    assert.match(sample.readmeMd, /사례용 가정/);
    assert.ok(referencedRequirementIds(m).has(NFR));
  });

  it('Logical 출력은 Sprint 10 샘플과 같다 (Q4)', () => {
    assert.deepEqual(normalizeModel(sample.model()), normalizeModel(sample.baseModel()));
  });
});

describe('Sprint 11 발행·Compare·복원 (DB, S11-4a~d·S11-5)', { skip: dbSkipReason }, () => {
  const created = [];
  let A, id, nfrId;
  const P = () => `/api/aa/projects/${id}`;
  before(async () => {
    ({ A } = await getTokens());
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} s11 publish ${Date.now()}`, template: 'sample-migration' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    id = res.body.data.id;
    created.push(id);
  });
  after(async () => { await deleteProjects(created); });

  const preview = async () => (await api(A).get(`${P()}/architecture/versions/preview`)).body;
  async function publish(label) {
    const p = (await preview()).data;
    const r = await api(A).post(`${P()}/architecture/versions`, { label, baseRevision: p.revision, expectedLatestVersionId: p.latestVersion?.id ?? null, snapshotHash: p.snapshotHash });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.data;
  }
  async function edit(fn) {
    const d = (await api(A).get(`${P()}/architecture`)).body.data;
    fn(d.model);
    return api(A).put(`${P()}/architecture/draft`, { baseRevision: d.revision, model: d.model });
  }
  const draftStrategy = async () => (await api(A).get(`${P()}/architecture`)).body.data.model.views.find((v) => v.id === AWS).strategy;
  const compare = async (from, to) => (await api(A).get(`${P()}/architecture/compare?from=${from}&to=${to}`)).body.data.changes;

  let v1, v2;
  it('새 샘플: NFR-001이 알림 규칙·게이트에 연결되고 미리보기 경고가 없다', async () => {
    const reqs = (await api(A).get(`${P()}/requirements`)).body.data;
    assert.deepEqual(reqs.map((r) => r.code), ['NFR-001']);
    nfrId = reqs[0].id;
    const d = (await api(A).get(`${P()}/architecture`)).body;
    assert.deepEqual(d.data.model.components.cmp_alert.requirementIds, [nfrId]);
    assert.deepEqual(d.data.model.views.find((v) => v.id === AWS).strategy.gates[1].requirementIds, [nfrId]);
    assert.equal(d.warnings, undefined);
    assert.equal((await preview()).warnings, undefined);
    v1 = await publish('v1');
  });

  it('S11-4a: 게이트 임계값만 바꿔 발행 → Compare parts = gates → v1 복원으로 원래 값', async () => {
    assert.equal((await edit((m) => { m.views.find((v) => v.id === AWS).strategy.gates[0].threshold = '≤ 0.5%'; })).status, 200);
    v2 = await publish('v2');
    const ch = (await compare(v1.id, v2.id)).filter((c) => c.kind === 'view.strategy');
    assert.equal(ch.length, 1);
    assert.deepEqual(ch[0].parts, ['gates']);
    assert.equal(ch[0].change, 'modified');
    const d = (await api(A).get(`${P()}/architecture`)).body.data;
    assert.equal((await api(A).post(`${P()}/architecture/versions/${v1.id}/restore`, { baseRevision: d.revision })).status, 200);
    assert.equal((await draftStrategy()).gates[0].threshold, '≤ 1%');
    assert.deepEqual(await compare(v1.id, 'draft'), []);
  });

  it('S11-4b: VM 복귀 대상만 비워 발행 → 미리보기 V19 미지정, Compare parts = fallback + fallback-unset', async () => {
    assert.equal((await edit((m) => {
      const st = m.views.find((v) => v.id === AWS).strategy;
      st.gates[0].threshold = '≤ 0.5%';   // v2와 같게 → 바뀐 것은 복귀 대상뿐
      delete st.fallback.targetViewId;
    })).status, 200);
    const p = await preview();
    assert.equal(p.data.noChanges, false);
    assert.ok(p.warnings.some((w) => w.rule === 'V19' && /미지정/.test(w.message)));
    const v3 = await publish('v3');
    const ch = (await compare(v2.id, v3.id)).filter((c) => c.kind === 'view.strategy');
    assert.deepEqual(ch[0].parts, ['fallback']);
    assert.deepEqual(ch[0].warnings, ['fallback-unset']);
    const st = await draftStrategy();
    assert.equal(st.fallback.targetViewId, undefined);
    assert.equal(st.fallback.switchMethod, 'lb-weight', '정책 문구는 남는다');
  });

  it('S11-4c: 게이트 requirementIds 순서만 바꾸면 발행할 변경이 없다', async () => {
    const r = await api(A).post(`${P()}/requirements`, { title: '[aa-test] 오류율', kind: 'nfr' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const second = r.body.data.id;
    assert.equal((await edit((m) => { m.views.find((v) => v.id === AWS).strategy.gates[1].requirementIds = [nfrId, second]; })).status, 200);
    await publish('v4');
    assert.equal((await edit((m) => { m.views.find((v) => v.id === AWS).strategy.gates[1].requirementIds = [second, nfrId]; })).status, 200);
    assert.equal((await preview()).data.noChanges, true);
  });

  it('S11-4d: Draft에서 알림 규칙을 지워도 v1의 알림 규칙·NFR-001 연결은 남는다', async () => {
    assert.equal((await edit((m) => {
      delete m.components.cmp_alert;
      delete m.relations.rel_ops_alert;
      const ops = m.views.find((v) => v.id === OPS);
      ops.nodes = ops.nodes.filter((n) => n.componentId !== 'cmp_alert');
      ops.edges = ops.edges.filter((e) => e.relationId !== 'rel_ops_alert');
    })).status, 200);
    const v = (await api(A).get(`${P()}/architecture/versions/${v1.id}`)).body.data;
    assert.deepEqual(v.model.components.cmp_alert.requirementIds, [nfrId]);
    assert.deepEqual(v.requirements.map((r) => r.code), ['NFR-001']);
    assert.deepEqual(v.model.views.find((x) => x.id === AWS).strategy.gates[1].requirementIds, [nfrId]);
    const draft = (await api(A).get(`${P()}/architecture`)).body.data.model;
    assert.equal(draft.components.cmp_alert, undefined);
  });

  it('S11-5: decisionId·validationId·path는 400 VALIDATION_FAILED, revision 그대로', async () => {
    const rev = (await api(A).get(`${P()}/architecture`)).body.data.revision;
    const cases = [
      (st) => { st.release.decisionId = 'adr_1'; },
      (st) => { st.gates[0].validationId = 'val_1'; },
      (st) => { st.path = ['cmp_ci']; },
    ];
    for (const mutate of cases) {
      const r = await edit((m) => mutate(m.views.find((v) => v.id === AWS).strategy));
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(r.body.code, 'VALIDATION_FAILED');
      assert.ok(r.body.details.some((d) => d.rule === 'V18'));
    }
    assert.equal((await api(A).get(`${P()}/architecture`)).body.data.revision, rev);
  });
});
