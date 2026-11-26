// Sprint 11 Step 4: 구조화 전략 — 화면 검사(V18과 같은 규칙), VM 복귀 후보·상태(C2), Trace 게이트(Q8)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  defaultStrategy, fallbackCandidates, fallbackStatus, formatCanary, parseCanary, strategyErrors, strategyGatesFor, versionStrategies,
} from '../../lib/aa/strategy-ops.ts';
import { setStructuredStrategy } from '../../lib/aa/model-ops.ts';
import { computeTrace } from '../../lib/aa/trace.ts';

const require = createRequire(import.meta.url);
const { validateModel, placementWarnings } = require('../../../backend/lib/aa/architecture-validator.js');
const sample = require('../../../backend/lib/aa/templates/sample-migration.js');

const AWS = 'view_aws_migration';
const VM = 'view_dep_migration';
const NFR = '11111111-1111-4111-8111-111111111111';
const view = (m, id) => m.views.find((v) => v.id === id);
const serverRules = (m) => validateModel(m).errors.map((e) => e.rule);

function withOpsPlan(m) {
  m.components.cmp_prom = { id: 'cmp_prom', type: 'ops.metrics', layer: 'ops', name: 'Prometheus', properties: {}, requirementIds: [], decisionIds: [] };
  m.views.push({ id: 'view_dep_ops', kind: 'deployment', name: 'Deployment', variant: '운영 설계', edges: [],
    nodes: [{ id: 'nd_ops_prom', kind: 'component', componentId: 'cmp_prom', position: { x: 0, y: 0 } }] });
  return m;
}

describe('기본값과 화면 검사 (V18과 같은 규칙)', () => {
  it('기본 전략은 화면·서버 검사를 모두 통과한다', () => {
    const m = sample.baseModel();
    const st = defaultStrategy();
    assert.deepEqual(strategyErrors(st, m), []);
    assert.deepEqual(serverRules(setStructuredStrategy(m, AWS, st)), []);
  });

  it('화면이 막는 값은 서버도 V18로 막는다 (관찰 0분, 비오름차순 canary, AWS를 복귀 대상으로)', () => {
    const m = sample.baseModel();
    const cases = [
      (st) => { st.gates[0].observeMin = 0; },
      (st) => { st.release.canary.steps[1].weight = 5; },
      (st) => { st.fallback = { targetViewId: AWS, trigger: 'x', switchMethod: 'manual', ownerRole: 'on-call', targetMin: 15, dbCondition: 'x' }; },
      (st) => { st.environments = Array.from({ length: 6 }, (_, i) => ({ name: `e${i}`, promotion: "same-image" })); },
    ];
    for (const fn of cases) {
      const st = defaultStrategy(); fn(st);
      assert.ok(strategyErrors(st, m).length > 0, fn.toString());
      const raw = structuredClone(m); view(raw, AWS).strategy = st;
      assert.ok(serverRules(raw).includes('V18') || serverRules(raw).length > 0, fn.toString());
    }
  });

  it('canary 문자열 ↔ 단계', () => {
    assert.deepEqual(parseCanary('10:10, 50:10,100:0'), [{ weight: 10, pauseMin: 10 }, { weight: 50, pauseMin: 10 }, { weight: 100, pauseMin: 0 }]);
    assert.equal(parseCanary('10%, 50%'), null);
    assert.equal(formatCanary(defaultStrategy().release.canary.steps), '10:10, 50:10, 100:0');
  });

  it('setStructuredStrategy: deployment·aws만, 같은 값이면 입력 그대로, null이면 삭제', () => {
    const m = sample.baseModel();
    const st = defaultStrategy();
    const a = setStructuredStrategy(m, AWS, st);
    assert.deepEqual(view(a, AWS).strategy, st);
    assert.equal(setStructuredStrategy(a, AWS, structuredClone(st)), a);
    assert.equal(setStructuredStrategy(m, 'view_k8s_migration', st), m);
    assert.equal(view(setStructuredStrategy(a, AWS, null), AWS).strategy, undefined);
  });
});

describe('VM 복귀 대상 (C2)', () => {
  it('새 후보는 실행 요소가 있는 deployment 배치안만 — 운영 설계 배치안은 빠진다', () => {
    const m = withOpsPlan(sample.baseModel());
    assert.deepEqual(fallbackCandidates(m).map((c) => c.viewId), [VM]);
  });

  it('상태: ok → 실행 요소 없음 → 미지정, 서버 V19 문구와 같다', () => {
    const m = sample.baseModel();
    const st = defaultStrategy();
    st.fallback = { targetViewId: VM, trigger: '오류율 > 2%', switchMethod: 'lb-weight', ownerRole: 'on-call', targetMin: 15, dbCondition: 'expand만' };
    let x = setStructuredStrategy(m, AWS, st);
    assert.deepEqual(fallbackStatus(x, view(x, AWS)), { state: 'ok', variant: '현재 · VM' });

    // 마지막 실행 요소 제거 (realizes 끊기) → 대상 id 유지, 상태 no-executor, 저장 가능
    x = structuredClone(x);
    for (const r of Object.values(x.relations)) if (r.type === 'realizes' && view(x, VM).nodes.some((n) => n.componentId === r.from)) delete x.relations[r.id];
    assert.equal(view(x, AWS).strategy.fallback.targetViewId, VM);
    assert.deepEqual(fallbackStatus(x, view(x, AWS)), { state: 'no-executor', variant: '현재 · VM' });
    assert.deepEqual(validateModel(x).errors, []);
    assert.match(placementWarnings(x).find((w) => w.rule === 'V19').message, /실행 요소가 없습니다/);
    assert.ok(!fallbackCandidates(x).some((c) => c.viewId === VM), '새 후보 목록에서는 빠진다');

    delete view(x, AWS).strategy.fallback.targetViewId;
    assert.deepEqual(fallbackStatus(x, view(x, AWS)), { state: 'unset' });
    assert.match(placementWarnings(x).find((w) => w.rule === 'V19').message, /미지정/);
  });
});

describe('Trace 게이트 (Q8, S11-2)', () => {
  it('이 NFR을 쓰는 게이트를 배치안 이름과 함께 보여 준다', () => {
    const st = defaultStrategy();
    st.gates.push({ name: '응답 시간', metric: 'p95', threshold: '< 300ms', observeMin: 10, requirementIds: [NFR] });
    const m = setStructuredStrategy(sample.baseModel(), AWS, st);
    assert.deepEqual(strategyGatesFor(m, NFR), [{ viewId: AWS, variant: '목표 · EKS', name: '응답 시간', metric: 'p95', threshold: '< 300ms', observeMin: 10 }]);
    const trace = computeTrace({ id: NFR, kind: 'nfr' }, m);
    assert.deepEqual(trace.strategyGates, strategyGatesFor(m, NFR));
    assert.deepEqual(computeTrace({ id: NFR, kind: 'nfr' }, sample.baseModel()).strategyGates, []);
  });
});

describe('버전 페이지 전략 요약 (Step 5, C3·S11-4d·S11-5)', () => {
  it('확장 샘플: 발행 당시 코드로 게이트 NFR, VM 복귀 대상 이름을 보여 준다', () => {
    const m = sample.model({ nfr_query_latency: NFR });
    const [s] = versionStrategies(m, (id) => (id === NFR ? 'NFR-001' : undefined));
    assert.equal(s.viewId, AWS);
    assert.equal(s.release, 'Canary 10→50→100%');
    assert.equal(s.environments, 'staging → prod(승인 owner)');
    assert.deepEqual(s.gates.map((g) => g.requirements), [[], ['NFR-001']]);
    assert.deepEqual(s.fallback.status, { state: 'ok', variant: '현재 · VM' });
  });

  it('대상이 비면 unset, 전략이 없으면 빈 목록', () => {
    const m = sample.model();
    delete m.views.find((v) => v.id === AWS).strategy.fallback.targetViewId;
    assert.equal(versionStrategies(m, () => undefined)[0].fallback.status.state, 'unset');
    assert.deepEqual(versionStrategies(sample.baseModel(), () => undefined), []);
  });
});
