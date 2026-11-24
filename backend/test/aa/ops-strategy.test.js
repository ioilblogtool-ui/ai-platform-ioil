// Sprint 11 Step 2: 운영 설계 배치안(레지스트리 v5·관계 7종·V17), 구조화 전략(V18·V19), 해시·Diff, 참조 수집
// 계약: 03 "Sprint 11 모델 계약", 08 D-45, Sprint 11 실행계획 v0.3.1
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { validateModel, placementWarnings, REGISTRY } = require('../../lib/aa/architecture-validator');
const { modelHash, canonModel } = require('../../lib/aa/model-canon');
const { summarize, hasSemanticChanges, diffModels } = require('../../lib/aa/graph-diff');
const { normalizeModel } = require('../../lib/aa/normalize');
const { lists, references, referencedRequirementIds } = require('../../lib/aa/requirement-refs');
const sample = require('../../lib/aa/templates/sample-migration');
const { dbSkipReason, getTokens, deleteProjects, api, createProject } = require('../helpers/aa-api');

const OPS = 'view_dep_ops';
const AWS = 'view_aws_migration';
const VM = 'view_dep_migration';
const REQ1 = '11111111-1111-4111-8111-111111111111';
const REQ2 = '22222222-2222-4222-8222-222222222222';

const comp = (id, type, name, properties = {}) => ({ id, type, layer: type.startsWith('ops.') ? 'ops' : 'logical', name, properties, requirementIds: [], decisionIds: [] });
const rel = (id, type, from, to) => ({ id, type, from, to, requirementIds: [] });

/** 샘플(VM·AWS·K8s)에 운영 설계 배치안을 더한 모델. 조회 API(cmp_query)는 참조 노드 */
function opsModel() {
  const m = sample.model();
  Object.assign(m.components, {
    cmp_prom: comp('cmp_prom', 'ops.metrics', 'Prometheus', { scrapeInterval: '30s' }),
    cmp_alert: comp('cmp_alert', 'ops.alerting', 'p95 알림', { expr: 'p95 > 0.3', for: '5m', channel: 'slack', receiverRole: 'on-call' }),
    cmp_col: comp('cmp_col', 'ops.collector', 'Collector', { maskingAt: 'collector', maskFields: ['email', 'token'], retentionDays: 14 }),
    cmp_dd: comp('cmp_dd', 'ops.telemetry', 'Datadog', { provider: 'Datadog' }),
    cmp_ci: comp('cmp_ci', 'ops.ci', 'CI'),
    cmp_reg: comp('cmp_reg', 'ops.registry', 'Registry'),
    cmp_cfg: comp('cmp_cfg', 'ops.config_repo', '배포 Git'),
    cmp_argo: comp('cmp_argo', 'ops.gitops', 'Argo CD', { stagingSync: 'auto', prodSync: 'manual', approvalRole: 'owner' }),
  });
  const rels = [
    rel('rel_scrape', 'scrapes', 'cmp_prom', 'cmp_query'),
    rel('rel_alert', 'alerts_to', 'cmp_prom', 'cmp_alert'),
    rel('rel_logs', 'ships_logs', 'cmp_query', 'cmp_col'),
    rel('rel_traces', 'exports_traces', 'cmp_col', 'cmp_dd'),
    rel('rel_build', 'builds', 'cmp_ci', 'cmp_reg'),
    rel('rel_push', 'pushes', 'cmp_ci', 'cmp_cfg'),
    rel('rel_sync', 'syncs', 'cmp_argo', 'cmp_query'),
  ];
  for (const r of rels) m.relations[r.id] = r;
  const ids = ['cmp_query', 'cmp_prom', 'cmp_alert', 'cmp_col', 'cmp_dd', 'cmp_ci', 'cmp_reg', 'cmp_cfg', 'cmp_argo'];
  m.views.push({
    id: OPS, kind: 'deployment', name: 'Deployment', variant: '운영 설계 · 관측·배포',
    nodes: ids.map((cid, i) => ({ id: `nd_ops_${i}`, kind: 'component', componentId: cid, position: { x: i * 120, y: 0 } })),
    edges: rels.map((r) => ({ id: `ed_${r.id.slice(4)}`, relationId: r.id })),
  });
  return m;
}

function strategy(over = {}) {
  return {
    environments: [{ name: 'staging', promotion: 'same-image' }, { name: 'prod', approvalRole: 'owner', promotion: 'same-image' }],
    release: { type: 'canary', canary: { steps: [{ weight: 10, pauseMin: 10 }, { weight: 50, pauseMin: 10 }, { weight: 100, pauseMin: 0 }] } },
    gates: [
      { name: '오류율', metric: '5xx 비율', threshold: '≤ 1%', observeMin: 10, requirementIds: [] },
      { name: '응답 시간', metric: 'p95', threshold: '< 300ms', observeMin: 10, requirementIds: [REQ1, REQ2] },
    ],
    rollback: { method: 'previous-image', targetMin: 10, trigger: '게이트 실패' },
    fallback: { targetViewId: VM, trigger: '오류율 > 2% 10분', switchMethod: 'lb-weight', ownerRole: 'on-call', targetMin: 15, dbCondition: 'RDS 공유, expand만' },
    dbChange: { policy: 'expand-contract' },
    ...over,
  };
}
const withStrategy = (m, st = strategy(), viewId = AWS) => { m.views.find((v) => v.id === viewId).strategy = st; return m; };
const errs = (m) => validateModel(m).errors;
const rules = (m) => errs(m).map((e) => e.rule);

describe('레지스트리 v5 (ops 8종)', () => {
  it('version 5, operations 분류, ops.* 8종은 deployment View 전용', () => {
    assert.equal(REGISTRY.version, 5);
    assert.ok(REGISTRY.categories.some((c) => c.key === 'operations'));
    const ops = Object.entries(REGISTRY.types).filter(([k]) => k.startsWith('ops.'));
    assert.deepEqual(ops.map(([k]) => k).sort(), ['ops.alerting', 'ops.ci', 'ops.collector', 'ops.config_repo', 'ops.gitops', 'ops.metrics', 'ops.registry', 'ops.telemetry']);
    for (const [, d] of ops) { assert.equal(d.layer, 'ops'); assert.deepEqual(d.views, ['deployment']); }
  });

  it('운영 설계 배치안 모델이 통과한다 (참조 노드 + 관계 7종)', () => {
    assert.deepEqual(errs(opsModel()), []);
  });

  it('ops 속성도 V6로 검사한다 (지속 시간 형식, 보존 기간 범위)', () => {
    const m = opsModel();
    m.components.cmp_alert.properties.for = '5 minutes';
    m.components.cmp_col.properties.retentionDays = 0;
    const paths = errs(m).filter((e) => e.rule === 'V6').map((e) => e.path);
    assert.ok(paths.includes('components.cmp_alert.properties.for'));
    assert.ok(paths.includes('components.cmp_col.properties.retentionDays'));
  });
});

describe('V17 운영 설계 관계', () => {
  it('양 끝이 모두 ops가 아니면 거부', () => {
    const m = opsModel();
    m.relations.rel_bad = rel('rel_bad', 'scrapes', 'cmp_client', 'cmp_query');
    m.views.find((v) => v.id === 'view_logical').edges.push({ id: 'ed_bad', relationId: 'rel_bad' });
    assert.ok(errs(m).some((e) => e.rule === 'V17' && e.path === 'relations.rel_bad'));
  });

  it('protocol·mode를 두지 않는다', () => {
    const m = opsModel();
    m.relations.rel_scrape.protocol = 'HTTP';
    assert.ok(errs(m).some((e) => e.rule === 'V17' && e.path === 'relations.rel_scrape.protocol'));
  });

  it('표시 엣지가 없는 관계는 거부', () => {
    const m = opsModel();
    const ops = m.views.find((v) => v.id === OPS);
    ops.edges = ops.edges.filter((e) => e.relationId !== 'rel_scrape');
    assert.ok(errs(m).some((e) => e.rule === 'V17' && e.path === 'relations.rel_scrape'));
  });

  it('두 끝점이 서로 다른 View에만 있으면 엣지를 둘 수 없어 거부 (V4 + V17)', () => {
    const m = opsModel();
    const ops = m.views.find((v) => v.id === OPS);
    ops.nodes = ops.nodes.filter((n) => n.componentId !== 'cmp_query');   // 조회 API는 Logical·VM에만
    const r = rules(m);
    assert.ok(r.includes('V4'));
    assert.ok(errs(m).some((e) => e.rule === 'V17' && e.path === 'relations.rel_scrape'));
  });

  it('엣지가 deployment가 아닌 View에 있으면 거부', () => {
    const m = opsModel();
    const logical = m.views.find((v) => v.id === 'view_logical');
    logical.nodes.push({ id: 'nd_lp', kind: 'component', componentId: 'cmp_prom', position: { x: 0, y: 300 } });
    logical.edges.push({ id: 'ed_lp', relationId: 'rel_scrape' });
    assert.ok(errs(m).some((e) => e.rule === 'V17' && /Deployment 배치안에만/.test(e.message)));
  });

  it('다른 deployment 배치안에 엣지가 하나 더 있어도 통과 (끝점 노드가 그 View에 있으면)', () => {
    const m = opsModel();
    const vm = m.views.find((v) => v.id === VM);
    vm.nodes.push({ id: 'nd_vm_prom', kind: 'component', componentId: 'cmp_prom', position: { x: 0, y: 500 } },
      { id: 'nd_vm_qref', kind: 'component', componentId: 'cmp_query', position: { x: 200, y: 500 } });
    vm.edges.push({ id: 'ed_vm_scrape', relationId: 'rel_scrape' });
    assert.deepEqual(errs(m), []);
  });
});

describe('V18 구조화 전략 · V19 경고', () => {
  it('AWS 배치안의 전략이 통과하고, 대상에 실행 요소가 있으면 V19가 없다', () => {
    const m = withStrategy(opsModel());
    assert.deepEqual(errs(m), []);
    assert.deepEqual(placementWarnings(m).filter((w) => w.rule === 'V19'), []);
  });

  it('K8s·Logical View에는 둘 수 없다', () => {
    const m = withStrategy(opsModel(), strategy(), 'view_k8s_migration');
    assert.ok(errs(m).some((e) => e.rule === 'V18' && e.path.endsWith('.strategy')));
  });

  it('예약 필드 path·decisionId·validationId는 거부 (S11-5)', () => {
    const st = strategy({ path: ['cmp_ci'] });
    st.release.decisionId = '33333333-3333-4333-8333-333333333333';
    st.gates[0].validationId = '44444444-4444-4444-8444-444444444444';
    const paths = errs(withStrategy(opsModel(), st)).filter((e) => e.rule === 'V18').map((e) => e.path);
    assert.ok(paths.some((p) => p.endsWith('.strategy.path')));
    assert.ok(paths.some((p) => p.endsWith('.release.decisionId')));
    assert.ok(paths.some((p) => p.endsWith('.gates[0].validationId')));
  });

  it('범위 밖 값·비오름차순 canary·deployment가 아닌 복귀 대상은 거부', () => {
    const st = strategy();
    st.gates[0].observeMin = 0;
    st.release.canary.steps[1].weight = 5;
    st.fallback.targetViewId = AWS;
    st.rollback.method = 'switch-back';
    const paths = errs(withStrategy(opsModel(), st)).filter((e) => e.rule === 'V18').map((e) => e.path);
    for (const tail of ['.gates[0].observeMin', '.canary.steps[1].weight', '.fallback.targetViewId', '.rollback.method']) {
      assert.ok(paths.some((p) => p.endsWith(tail)), tail + ' in ' + paths.join(', '));
    }
  });

  it('게이트 requirementIds는 V9 형식 검사', () => {
    const st = strategy();
    st.gates[1].requirementIds = ['not-a-uuid'];
    assert.ok(errs(withStrategy(opsModel(), st)).some((e) => e.rule === 'V9' && e.path.endsWith('.gates[1].requirementIds[0]')));
  });

  it('V19: 대상 미지정과 실행 요소 없음은 다른 문구, 저장은 막지 않는다 (C2)', () => {
    const unset = strategy();
    delete unset.fallback.targetViewId;
    const m1 = withStrategy(opsModel(), unset);
    assert.deepEqual(errs(m1), []);
    assert.match(placementWarnings(m1).find((w) => w.rule === 'V19').message, /미지정/);

    const m2 = withStrategy(opsModel());
    const vm = m2.views.find((v) => v.id === VM);
    const executors = new Set(Object.values(m2.relations).filter((r) => r.type === 'realizes').map((r) => r.from));
    for (const r of Object.values(m2.relations)) if (r.type === 'realizes' && vm.nodes.some((n) => n.componentId === r.from)) delete m2.relations[r.id];
    assert.ok(executors.size > 0);
    assert.deepEqual(errs(m2), []);
    const w = placementWarnings(m2).find((x) => x.rule === 'V19');
    assert.match(w.message, /현재 · VM.*실행 요소가 없습니다/);
    assert.equal(w.targetViewId, VM);
  });

  it('V12 비밀값 검사는 전략 문자열에도 적용된다', () => {
    const st = strategy();
    st.rollback.trigger = 'AKIAABCDEFGHIJKLMNOP';
    assert.ok(errs(withStrategy(opsModel(), st)).some((e) => e.rule === 'V12'));
  });
});

describe('해시·Diff (Q7, S11-4)', () => {
  const pub = (model) => ({ model, snapshot: {} });

  it('전략이 없는 모델의 정규화에는 strategy 키가 없다 (해시 호환)', () => {
    assert.ok(canonModel(sample.model()).views.every((v) => !('strategy' in v)));
    assert.equal(modelHash(sample.model()), modelHash(sample.model()));
  });

  it('게이트 requirementIds 순서만 바뀌면 같은 해시, 의미 변경 없음 (S11-4c)', () => {
    const a = withStrategy(opsModel());
    const st = strategy();
    st.gates[1].requirementIds = [REQ2, REQ1];
    const b = withStrategy(opsModel(), st);
    assert.equal(modelHash(a), modelHash(b));
    assert.equal(hasSemanticChanges(summarize(pub(a), pub(b))), false);
  });

  it('임계값만 바꾸면 발행 가능, parts = gates (S11-4a)', () => {
    const a = withStrategy(opsModel());
    const st = strategy();
    st.gates[0].threshold = '≤ 0.5%';
    const b = withStrategy(opsModel(), st);
    assert.notEqual(modelHash(a), modelHash(b));
    const s = summarize(pub(a), pub(b));
    assert.equal(s.strategiesChanged, 1);
    assert.ok(hasSemanticChanges(s));
    const ch = diffModels(pub(a), pub(b)).changes.find((c) => c.kind === 'view.strategy');
    assert.deepEqual(ch.parts, ['gates']);
    assert.equal(ch.change, 'modified');
  });

  it('VM 복귀 대상만 비우면 parts = fallback, 경고 fallback-unset (S11-4b)', () => {
    const a = withStrategy(opsModel());
    const st = strategy();
    delete st.fallback.targetViewId;
    const b = withStrategy(opsModel(), st);
    const ch = diffModels(pub(a), pub(b)).changes.find((c) => c.kind === 'view.strategy');
    assert.deepEqual(ch.parts, ['fallback']);
    assert.deepEqual(ch.warnings, ['fallback-unset']);
  });

  it('전략 추가는 added, 운영 설계 관계 삭제는 relation.removed', () => {
    const a = opsModel();
    const b = withStrategy(opsModel());
    const ops = b.views.find((v) => v.id === OPS);
    ops.edges = ops.edges.filter((e) => e.relationId !== 'rel_push');
    delete b.relations.rel_push;
    const changes = diffModels(pub(a), pub(b)).changes;
    assert.equal(changes.find((c) => c.kind === 'view.strategy').change, 'added');
    assert.ok(changes.some((c) => c.kind === 'relation.removed'));
  });
});

describe('Logical 출력과 요구사항 참조 (Q4·Q8)', () => {
  it('ops 컴포넌트는 Logical 출력에서 빠진다 → 출력이 ops 없는 모델과 같다', () => {
    const plain = normalizeModel(sample.model());
    const withOps = normalizeModel(opsModel());
    assert.deepEqual(withOps, plain);
  });

  it('게이트·알림 컴포넌트의 requirementIds가 참조 수집·삭제 보호에 들어간다', () => {
    const m = withStrategy(opsModel());
    m.components.cmp_alert.requirementIds = [REQ2];
    assert.ok(lists(m).some((e) => e.group === 'gates' && e.id === `${AWS}.gates[1]`));
    const ids = referencedRequirementIds(m);
    assert.ok(ids.has(REQ1) && ids.has(REQ2));
    assert.deepEqual(references(m, REQ1).strategyGates, [`${AWS}.gates[1]`]);
    const r2 = references(m, REQ2);
    assert.deepEqual(r2.componentIds, ['cmp_alert']);
    assert.deepEqual(r2.strategyGates, [`${AWS}.gates[1]`]);
  });
});

describe('Sprint 11 over the API', { skip: dbSkipReason }, () => {
  const created = [];
  let A, base, url;
  before(async () => {
    A = (await getTokens()).A;
    const project = await createProject(A, created, 's11-ops');
    base = `/api/aa/projects/${project.id}`;
    url = `${base}/architecture`;
  });
  after(async () => { await deleteProjects(created); });

  const save = async (model) => {
    const g = await api(A).get(url);
    return api(A).put(`${url}/draft`, { baseRevision: g.body.data.revision, model });
  };

  it('운영 설계 + 전략 저장·조회, 게이트의 없는 요구사항은 V9 경고와 함께 제외', async () => {
    const s = await save(withStrategy(opsModel()));
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.ok(s.body.warnings.some((w) => w.code === 'V9' && /strategy\.gates\[1\]/.test(w.path)));
    const g = await api(A).get(url);
    const aws = g.body.data.model.views.find((v) => v.id === AWS);
    assert.deepEqual(aws.strategy.gates[1].requirementIds, []);
    assert.equal(aws.strategy.fallback.targetViewId, VM);
    assert.equal(Object.values(g.body.data.model.relations).filter((r) => r.type === 'syncs').length, 1);
  });

  it('V18 위반은 400, revision 그대로', async () => {
    const before = (await api(A).get(url)).body.data.revision;
    const st = strategy({ path: ['cmp_ci'] });
    const s = await save(withStrategy(opsModel(), st));
    assert.equal(s.status, 400);
    assert.equal(s.body.code, 'VALIDATION_FAILED');
    assert.ok(s.body.details.some((d) => d.rule === 'V18'));
    assert.equal((await api(A).get(url)).body.data.revision, before);
  });

  it('조회 응답에 V19를 다시 계산해 준다', async () => {
    const st = strategy();
    delete st.fallback.targetViewId;
    assert.equal((await save(withStrategy(opsModel(), st))).status, 200);
    const g = await api(A).get(url);
    assert.ok((g.body.warnings ?? []).some((w) => w.rule === 'V19' && /미지정/.test(w.message)));
  });

  it('게이트만 참조하는 요구사항은 삭제가 409 IN_USE (strategyGates)', async () => {
    const r = await api(A).post(`${base}/requirements`, { title: 'p95 < 300ms', kind: 'nfr' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const st = strategy();
    st.gates[1].requirementIds = [r.body.data.id];
    assert.equal((await save(withStrategy(opsModel(), st))).status, 200);
    const d = await api(A).del(`${base}/requirements/${r.body.data.id}`);
    assert.equal(d.status, 409);
    assert.equal(d.body.code, 'IN_USE');
    assert.deepEqual(d.body.details.strategyGates, [`${AWS}.gates[1]`]);
  });
});
