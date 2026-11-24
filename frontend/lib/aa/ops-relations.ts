// 운영 설계 관계 (Sprint 11 · OPS-02·06 · 03 V17 · 08 D-45). 런타임 import 없음 — Node 테스트에서 바로 불러온다.
// - 관계 7종: 양 끝 중 하나 이상이 ops layer, 표시 엣지는 deployment View에만
// - 선 구분·범례·레이어 토글(04 §6.10.1): API 흰 실선 · 메트릭 초록 점선 · 로그·트레이스 보라 파선 · 배포 주황 굵은 실선
// - 삭제: 마지막 표시 엣지(또는 그 노드)가 사라진 운영 설계 관계는 같은 모델 변경에서 함께 지운다
import type { ArchitectureModel, Component, RelationType } from './architecture-types';

export const OPS_RELATION_TYPES = ['scrapes', 'alerts_to', 'ships_logs', 'exports_traces', 'builds', 'pushes', 'syncs'] as const;
export type OpsRelationType = (typeof OPS_RELATION_TYPES)[number];
export const isOpsRelationType = (t: string | undefined): t is OpsRelationType => (OPS_RELATION_TYPES as readonly string[]).includes(t ?? '');

export const OPS_RELATION_LABEL: Record<OpsRelationType, string> = {
  scrapes: '메트릭 수집', alerts_to: '알림', ships_logs: '로그 전송', exports_traces: '트레이스 전송',
  builds: '빌드', pushes: '푸시', syncs: '동기화',
};

/** 레이어 토글 단위 (OPS-06) */
export type RelationLayer = 'api' | 'metrics' | 'telemetry' | 'deploy';
export const RELATION_LAYERS: { key: RelationLayer; label: string }[] = [
  { key: 'api', label: 'API 호출' }, { key: 'metrics', label: '메트릭' }, { key: 'telemetry', label: '로그·트레이스' }, { key: 'deploy', label: '배포' },
];
export function relationLayer(type: RelationType | string | undefined): RelationLayer {
  switch (type) {
    case 'scrapes': case 'alerts_to': return 'metrics';
    case 'ships_logs': case 'exports_traces': return 'telemetry';
    case 'builds': case 'pushes': case 'syncs': return 'deploy';
    default: return 'api';
  }
}

/** 선 스타일 (범례와 같은 값) */
export const LAYER_STYLE: Record<RelationLayer, { color: string; dash?: string; width: number }> = {
  api: { color: 'rgba(255,255,255,0.35)', width: 1.25 },
  metrics: { color: '#3ecf8e', dash: '2 4', width: 1.5 },
  telemetry: { color: '#a78bfa', dash: '7 4', width: 1.5 },
  deploy: { color: '#f59e0b', width: 2.5 },
};

const isOps = (c: Component | undefined) => c?.layer === 'ops';

/** 연결할 때의 기본 관계 유형. 한쪽도 ops가 아니면 null (기존 calls) */
export function defaultRelationType(from: Component | undefined, to: Component | undefined): OpsRelationType | null {
  if (!isOps(from) && !isOps(to)) return null;
  const f = from?.type, t = to?.type;
  if (f === 'ops.metrics') return t === 'ops.alerting' ? 'alerts_to' : 'scrapes';
  if (f === 'ops.alerting') return 'alerts_to';
  if (f === 'ops.collector') return t === 'ops.telemetry' ? 'exports_traces' : 'ships_logs';
  if (f === 'ops.ci') return t === 'ops.registry' ? 'builds' : 'pushes';
  if (f === 'ops.registry') return 'pushes';
  if (f === 'ops.config_repo' || f === 'ops.gitops') return 'syncs';
  // 앱 → 관측: 로그·트레이스는 앱이 보낸다
  if (t === 'ops.collector' || t === 'ops.telemetry') return 'ships_logs';
  if (t === 'ops.metrics') return 'scrapes';
  if (t === 'ops.alerting') return 'alerts_to';
  return 'syncs';
}

/**
 * 표시 엣지가 하나도 없는 운영 설계 관계를 지운다 (V17 ③). 입력 모델을 직접 고친다 — withView 안에서 쓴다.
 * 표시 엣지로 인정하는 것: deployment View에 있고, 그 View에 양 끝 컴포넌트의 노드가 있는 엣지.
 * @returns 지운 관계 id
 */
export function pruneOrphanOpsRelations(m: ArchitectureModel): string[] {
  const removed: string[] = [];
  for (const [rid, r] of Object.entries(m.relations)) {
    if (!isOpsRelationType(r.type)) continue;
    const shown = m.views.some((v) => v.kind === 'deployment'
      && v.edges.some((e) => e.relationId === rid)
      && v.nodes.some((n) => n.componentId === r.from) && v.nodes.some((n) => n.componentId === r.to));
    if (shown) continue;
    delete m.relations[rid];
    for (const v of m.views) v.edges = v.edges.filter((e) => e.relationId !== rid);
    removed.push(rid);
  }
  return removed;
}

/** Draft 복구용 (불러올 때): 표시 엣지가 없는 운영 설계 관계를 지우고 몇 개인지 알린다. 입력 모델은 그대로 */
export function repairOpsRelations(model: ArchitectureModel): { model: ArchitectureModel; removed: number } {
  const hasOps = Object.values(model.relations).some((r) => isOpsRelationType(r.type));
  if (!hasOps) return { model, removed: 0 };
  const next: ArchitectureModel = structuredClone(model);
  const removed = pruneOrphanOpsRelations(next).length;
  return removed ? { model: next, removed } : { model, removed: 0 };
}
