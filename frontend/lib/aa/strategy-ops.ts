// 구조화 배포 전략 (Sprint 11 · DEP-04 · 03 "Sprint 11 모델 계약" · 08 D-45). 런타임 import 없음 — node --test로 검증한다.
// - 서버 V18과 같은 규칙을 화면에서 먼저 확인한다 → 자동 저장이 400에 막히지 않게 "적용" 전에 거른다
// - VM 복귀 대상(C2): 새로 고를 후보는 realizes 실행 요소가 있는 deployment 배치안만, 이미 고른 대상은 그대로 두고 상태만 알린다
import type { ArchitectureModel, DeploymentStrategy, View } from './architecture-types';

export const STRATEGY_LIMITS = { environments: 5, gates: 10, steps: 10, text: 500, minutes: 1440 } as const;
export const RELEASE_TYPES = ['rolling', 'blue-green', 'canary', 'recreate'] as const;
export const RELEASE_LABEL: Record<DeploymentStrategy['release']['type'], string> = { rolling: 'Rolling', 'blue-green': 'Blue-Green', canary: 'Canary', recreate: 'Recreate' };
export const SWITCH_BY = ['service-selector', 'lb', 'dns'] as const;
export const ROLLBACK_METHODS = ['previous-image', 'redeploy'] as const;
export const SWITCH_METHODS = ['lb-weight', 'dns', 'manual'] as const;
export const DB_POLICIES = ['expand-contract', 'backward-compatible', 'downtime', 'none'] as const;
export const PROMOTIONS = ['same-image', 'rebuild'] as const;

/** 새 구조화 전략의 시작값 (staging → prod, canary 10/50/100) */
export function defaultStrategy(): DeploymentStrategy {
  return {
    environments: [{ name: 'staging', promotion: 'same-image' }, { name: 'prod', approvalRole: 'owner', promotion: 'same-image' }],
    release: { type: 'canary', canary: { steps: [{ weight: 10, pauseMin: 10 }, { weight: 50, pauseMin: 10 }, { weight: 100, pauseMin: 0 }] } },
    gates: [{ name: '오류율', metric: '5xx 비율', threshold: '≤ 1%', observeMin: 10, requirementIds: [] }],
    rollback: { method: 'previous-image', targetMin: 10, trigger: '게이트 실패' },
    dbChange: { policy: 'expand-contract' },
  };
}

/** "10:10, 50:10, 100:0" (비율:대기분) ↔ steps */
export function formatCanary(steps: { weight: number; pauseMin: number }[] | undefined): string {
  return (steps ?? []).map((s) => `${s.weight}:${s.pauseMin}`).join(', ');
}
export function parseCanary(text: string): { weight: number; pauseMin: number }[] | null {
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out: { weight: number; pauseMin: number }[] = [];
  for (const p of parts) {
    const m = /^(\d+)\s*:\s*(\d+)$/.exec(p);
    if (!m) return null;
    out.push({ weight: Number(m[1]), pauseMin: Number(m[2]) });
  }
  return out;
}

/** 서버 V18과 같은 규칙. 문제가 없으면 빈 배열 */
export function strategyErrors(st: DeploymentStrategy, model: ArchitectureModel): string[] {
  const errs: string[] = [];
  const L = STRATEGY_LIMITS;
  const text = (v: string | undefined, label: string, required = true) => {
    if (v === undefined || v === null) { if (required) errs.push(`${label}: 값이 필요합니다.`); return; }
    if (typeof v !== 'string' || v.length > L.text || (required && !v.trim())) errs.push(`${label}: 1~${L.text}자로 입력하세요.`);
  };
  const minutes = (v: number, label: string, min = 1) => {
    if (!(Number.isInteger(v) && v >= min && v <= L.minutes)) errs.push(`${label}: ${min}~${L.minutes} 사이 정수(분)여야 합니다.`);
  };
  if (st.environments.length > L.environments) errs.push(`환경은 ${L.environments}개 이하입니다.`);   // 계약(V18): 상한만, 0개 허용
  st.environments.forEach((e, i) => { text(e.name, `환경 ${i + 1} 이름`); text(e.approvalRole, `환경 ${i + 1} 승인 역할`, false); });
  const r = st.release;
  if (r.type === 'rolling') { text(r.rolling?.maxSurge, 'maxSurge'); text(r.rolling?.maxUnavailable, 'maxUnavailable'); }
  if (r.type === 'canary') {
    const steps = r.canary?.steps ?? [];
    if (!steps.length || steps.length > L.steps) errs.push(`Canary 단계는 1~${L.steps}개여야 합니다.`);
    let prev = 0;
    steps.forEach((s, i) => {
      if (!Number.isInteger(s.weight) || s.weight < 1 || s.weight > 100 || s.weight <= prev) errs.push(`Canary ${i + 1}단계 비율: 1~100이고 단계마다 커져야 합니다.`);
      else prev = s.weight;
      minutes(s.pauseMin, `Canary ${i + 1}단계 대기`, 0);
    });
  }
  if (st.gates.length > L.gates) errs.push(`진행·중단 기준은 ${L.gates}개 이하입니다.`);
  st.gates.forEach((g, i) => {
    text(g.name, `기준 ${i + 1} 이름`); text(g.metric, `기준 ${i + 1} 지표`); text(g.threshold, `기준 ${i + 1} 임계값`);
    minutes(g.observeMin, `기준 ${i + 1} 관찰 시간`);
  });
  minutes(st.rollback.targetMin, '롤백 목표 시간'); text(st.rollback.trigger, '롤백 트리거');
  if (st.fallback) {
    const f = st.fallback;
    if (f.targetViewId !== undefined && model.views.find((v) => v.id === f.targetViewId)?.kind !== 'deployment') errs.push('VM 복귀 대상은 Deployment 배치안이어야 합니다.');
    text(f.trigger, 'VM 복귀 판단 기준'); text(f.ownerRole, 'VM 복귀 책임 역할'); minutes(f.targetMin, 'VM 복귀 목표 시간'); text(f.dbCondition, 'VM 복귀 DB 조건');
  }
  text(st.dbChange.note, 'DB 변경 메모', false);
  return errs;
}

/** realizes 실행 요소가 하나 이상 놓인 배치안인가 */
function hasExecutor(model: ArchitectureModel, view: View): boolean {
  const implementers = new Set(Object.values(model.relations).filter((r) => r.type === 'realizes').map((r) => r.from));
  return view.nodes.some((n) => n.componentId !== undefined && implementers.has(n.componentId));
}

/** 새로 고를 수 있는 VM 복귀 대상 (C2): 실행 요소가 있는 deployment 배치안 — 운영 설계 배치안은 빠진다 */
export function fallbackCandidates(model: ArchitectureModel): { viewId: string; variant: string }[] {
  return model.views.filter((v) => v.kind === 'deployment' && hasExecutor(model, v)).map((v) => ({ viewId: v.id, variant: v.variant ?? v.name }));
}

export type FallbackStatus =
  | { state: 'none' }
  | { state: 'unset' }
  | { state: 'ok'; variant: string }
  | { state: 'no-executor'; variant: string };

/** 이미 저장된 복귀 대상의 상태 (V19 경고 문구와 같다) */
export function fallbackStatus(model: ArchitectureModel, view: View | undefined): FallbackStatus {
  const f = view?.strategy?.fallback;
  if (!f) return { state: 'none' };
  if (f.targetViewId === undefined) return { state: 'unset' };
  const target = model.views.find((v) => v.id === f.targetViewId);
  if (!target || target.kind !== 'deployment') return { state: 'unset' };
  const variant = target.variant ?? target.name;
  return hasExecutor(model, target) ? { state: 'ok', variant } : { state: 'no-executor', variant };
}

/** Trace용: 이 요구사항을 쓰는 전략 게이트 */
export function strategyGatesFor(model: ArchitectureModel, requirementId: string) {
  return model.views.flatMap((v) => (v.strategy?.gates ?? [])
    .filter((g) => g.requirementIds.includes(requirementId))
    .map((g) => ({ viewId: v.id, variant: v.variant ?? v.name, name: g.name, metric: g.metric, threshold: g.threshold, observeMin: g.observeMin })));
}

/**
 * 버전 페이지용 (Sprint 11 Step 5 · C3): 그 버전의 모델·요구사항 스냅샷만으로 전략을 요약한다.
 * 발행 뒤 Draft에서 게이트·알림 노드를 바꿔도 버전의 연결은 이 값으로 남는다. codeOf: 요구사항 id → 발행 당시 코드
 */
export function versionStrategies(model: ArchitectureModel, codeOf: (id: string) => string | undefined) {
  return model.views.filter((v) => v.strategy).map((v) => {
    const st = v.strategy!;
    const fb = fallbackStatus(model, v);
    const steps = st.release.type === 'canary' && st.release.canary?.steps.length ? `${st.release.canary.steps.map((x) => x.weight).join('→')}%` : '';
    return {
      viewId: v.id,
      variant: v.variant ?? v.name,
      release: `${RELEASE_LABEL[st.release.type] ?? st.release.type}${steps ? ` ${steps}` : ''}`,
      environments: st.environments.map((e) => `${e.name}${e.approvalRole ? `(승인 ${e.approvalRole})` : ''}`).join(' → '),
      gates: st.gates.map((g) => ({
        name: g.name, text: `${g.metric} ${g.threshold} · 관찰 ${g.observeMin}분`,
        requirements: g.requirementIds.map(codeOf).filter((c): c is string => Boolean(c)),
      })),
      rollback: `${st.rollback.method === 'previous-image' ? '이전 이미지' : '재배포'} ${st.rollback.targetMin}분 · ${st.rollback.trigger}`,
      fallback: !st.fallback ? null
        : { status: fb, text: `${st.fallback.trigger} · ${st.fallback.switchMethod} · ${st.fallback.ownerRole} · ${st.fallback.targetMin}분 · ${st.fallback.dbCondition}` },
    };
  });
}
