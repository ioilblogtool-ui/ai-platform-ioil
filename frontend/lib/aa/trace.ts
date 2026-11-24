// Requirement Trace 계산 (Sprint 8 · TRC-01·02 Phase 2 부분 · 04 SCR-13). React·런타임 import 없음 — node --test로 검증한다.
// 기준은 Draft 모델. 설계 결정·검증·결과(ADR·Validation·Evidence)는 Phase 3 — 여기서는 다루지 않는다(화면이 빈칸으로 표시).
import type { ArchitectureModel, Requirement, RequirementMeasurement } from './architecture-types';

export type TraceGap = 'no-component' | 'no-flow' | 'no-measurement' | 'measurement-flow-missing';
export const GAP_LABEL: Record<TraceGap, string> = {
  'no-component': '컴포넌트 없음',
  'no-flow': 'Flow 없음',
  'no-measurement': '측정 기준 없음',
  'measurement-flow-missing': '측정 대상 흐름 없음',
};

export interface TraceResult {
  components: { id: string; name: string; type: string; nodeId?: string }[];
  relations: { id: string; from: string; to: string; label: string }[];
  flows: { id: string; name: string; endpoint?: string; linked: boolean; measured: boolean }[];
  /** Sprint 11 (Q8): 이 요구사항을 진행·중단 기준으로 쓰는 배치안 전략 게이트 */
  strategyGates: { viewId: string; variant: string; name: string; metric: string; threshold: string; observeMin: number }[];
  measurement: RequirementMeasurement;
  /** 측정 기준의 flowId가 Draft에 없음 (흐름 삭제·복원으로 끊김) */
  measurementFlowMissing: boolean;
  gaps: TraceGap[];
}

export function computeTrace(req: Pick<Requirement, 'id' | 'kind'> & { measurement?: RequirementMeasurement | null }, model: ArchitectureModel | null): TraceResult {
  const m = model ?? { components: {}, relations: {}, views: [], flows: {} } as unknown as ArchitectureModel;
  const name = (cid: string) => m.components[cid]?.name ?? '?';
  const logical = m.views.find((v) => v.id === 'view_logical');
  const components = Object.values(m.components)
    .filter((c) => c.requirementIds?.includes(req.id))
    .map((c) => ({ id: c.id, name: c.name, type: c.type, nodeId: logical?.nodes.find((n) => n.componentId === c.id)?.id ?? m.views.flatMap((v) => v.nodes).find((n) => n.componentId === c.id)?.id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const relations = Object.values(m.relations)
    .filter((r) => r.requirementIds?.includes(req.id))
    .map((r) => ({ id: r.id, from: name(r.from), to: name(r.to), label: [r.protocol, r.label].filter(Boolean).join(' · ') }));
  const measurement: RequirementMeasurement = { ...(req.measurement ?? {}) };
  const measuredFlow = measurement.flowId;
  const flowMap = m.flows ?? {};
  const flows = Object.values(flowMap)
    .filter((f) => f.requirementIds?.includes(req.id) || f.id === measuredFlow)
    .map((f) => ({ id: f.id, name: f.name, endpoint: f.endpoint ? `${f.endpoint.method} ${f.endpoint.path}` : undefined, linked: f.requirementIds?.includes(req.id) ?? false, measured: f.id === measuredFlow }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const measurementFlowMissing = Boolean(measuredFlow && !flowMap[measuredFlow]);
  const gaps: TraceGap[] = [];
  if (!components.length && !relations.length) gaps.push('no-component');
  if (req.kind === 'nfr') {
    if (!flows.length) gaps.push('no-flow');
    if (!Object.keys(measurement).length) gaps.push('no-measurement');
    if (measurementFlowMissing) gaps.push('measurement-flow-missing');
  }
  // Sprint 11 (Q8): 전략 게이트 — strategy-ops.strategyGatesFor와 같은 규칙 (런타임 import 없이)
  const strategyGates = m.views.flatMap((v) => (v.strategy?.gates ?? [])
    .filter((g) => g.requirementIds.includes(req.id))
    .map((g) => ({ viewId: v.id, variant: v.variant ?? v.name, name: g.name, metric: g.metric, threshold: g.threshold, observeMin: g.observeMin })));
  return { components, relations, flows, strategyGates, measurement, measurementFlowMissing, gaps };
}

export const MEASUREMENT_FIELDS: { key: 'endpoint' | 'environment' | 'load' | 'method'; label: string; placeholder: string }[] = [
  { key: 'endpoint', label: '대상 엔드포인트', placeholder: 'GET /api/my-ai/reports' },
  { key: 'environment', label: '환경', placeholder: 'staging' },
  { key: 'load', label: '부하 조건', placeholder: '동시 20명 · 5분' },
  { key: 'method', label: '측정 방법', placeholder: 'k6 http_req_duration p95' },
];
