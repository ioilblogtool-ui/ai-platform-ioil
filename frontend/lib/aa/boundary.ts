// 신뢰 경계·데이터 경로 표시 계산 (Sprint 8 · REL-07 · P2-6 · 04 §6.7(b)). 저장·검증과 무관한 표시 전용.
// React·네트워크·런타임 import 없음 — node --test로 바로 검증한다.
//
// 규칙 (Sprint 8 Q2, U5):
// - 경계 = 구역(dep.zone)의 trust 등급이 다를 때만. 같은 등급의 다른 구역은 경계가 아니다.
// - 배치안: 노드의 등급 = 같은 View 조상 체인에서 가장 가까운 dep.zone의 trust. 직접 calls 엣지의 양 끝 등급이 모두 있고
//   다르면 'confirmed'(확정).
// - Logical: 컴포넌트의 등급 집합 = 경계 기준 배치안에서 그 컴포넌트를 realizes하는 구현체들의 등급.
//   서로소면 'inferred'(추론), 다르지만 겹치면 'possible'(가능), 같으면 없음. 한쪽이라도 모르면 판단하지 않는다.
import type { ArchitectureModel, DataClass, View } from './architecture-types';

export type BoundaryKind = 'confirmed' | 'inferred' | 'possible';
export interface EdgeMark { boundary?: BoundaryKind; reason?: string; dataClass?: DataClass }

const ZONE_TYPE = 'dep.zone';
const TRUST_ORDER = ['external', 'dmz', 'internal', 'data'];
const sortTrust = (set: Set<string>) => [...set].sort((a, b) => TRUST_ORDER.indexOf(a) - TRUST_ORDER.indexOf(b));

/** 배치안 노드의 등급: 자기 자신이 구역이면 그 등급, 아니면 가장 가까운 조상 구역 */
export function nodeTrust(model: ArchitectureModel, view: View, nodeId: string): string | undefined {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let cur = byId.get(nodeId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const c = cur.componentId ? model.components[cur.componentId] : undefined;
    if (c?.type === ZONE_TYPE && typeof c.properties?.trust === 'string') return c.properties.trust as string;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return undefined;
}

/** Logical 컴포넌트 → 기준 배치안에서 그 컴포넌트를 구현하는 노드들의 등급 집합 */
export function logicalTrustSets(model: ArchitectureModel, baseViewId: string | null | undefined): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const view = baseViewId ? model.views.find((v) => v.id === baseViewId && v.kind === 'deployment') : undefined;
  if (!view) return out;
  const nodeOf = new Map(view.nodes.filter((n) => n.componentId).map((n) => [n.componentId!, n.id]));
  for (const r of Object.values(model.relations)) {
    if (r.type !== 'realizes') continue;
    const nodeId = nodeOf.get(r.from);
    if (!nodeId) continue;
    const trust = nodeTrust(model, view, nodeId);
    if (!trust) continue;
    if (!out.has(r.to)) out.set(r.to, new Set());
    out.get(r.to)!.add(trust);
  }
  return out;
}

function compareSets(a: Set<string>, b: Set<string>): BoundaryKind | undefined {
  const same = a.size === b.size && [...a].every((x) => b.has(x));
  if (same) return undefined;
  return [...a].some((x) => b.has(x)) ? 'possible' : 'inferred';
}

/**
 * 한 View의 calls 관계마다 표시할 것. key = relationId
 * @param baseViewId Logical View에서 쓸 경계 기준 배치안 (배치안 View에서는 무시 — 그 View 자체가 기준)
 */
export function edgeMarks(model: ArchitectureModel, viewId: string, baseViewId?: string | null): Map<string, EdgeMark> {
  const marks = new Map<string, EdgeMark>();
  const view = model.views.find((v) => v.id === viewId);
  if (!view) return marks;
  const nodeOf = new Map(view.nodes.filter((n) => n.componentId).map((n) => [n.componentId!, n.id]));
  const isDeployment = view.kind === 'deployment';
  const sets = isDeployment ? null : logicalTrustSets(model, baseViewId);
  const baseName = baseViewId ? model.views.find((v) => v.id === baseViewId)?.variant : undefined;
  for (const e of view.edges) {
    const r = model.relations[e.relationId];
    if (!r || r.type !== 'calls') continue;
    const mark: EdgeMark = {};
    if (r.dataClass) mark.dataClass = r.dataClass;
    if (isDeployment) {
      const a = nodeOf.get(r.from), b = nodeOf.get(r.to);
      const ta = a ? nodeTrust(model, view, a) : undefined;
      const tb = b ? nodeTrust(model, view, b) : undefined;
      if (ta && tb && ta !== tb) { mark.boundary = 'confirmed'; mark.reason = `${ta} → ${tb}`; }
    } else if (sets) {
      const sa = sets.get(r.from), sb = sets.get(r.to);
      const kind = sa && sb ? compareSets(sa, sb) : undefined;
      if (kind && sa && sb) {
        mark.boundary = kind;
        mark.reason = `${baseName ?? '기준 배치안'} 기준: ${sortTrust(sa).join('·')} → ${sortTrust(sb).join('·')}`;
      }
    }
    if (mark.boundary || mark.dataClass) marks.set(r.id, mark);
  }
  return marks;
}

/** 경계 기준 배치안: 고른 것이 있으면 그것, 없거나 지워졌으면 첫 배치안, 배치안이 없으면 null */
export function resolveBaseView(model: ArchitectureModel, chosen: string | null | undefined): string | null {
  const deps = model.views.filter((v) => v.kind === 'deployment');
  if (chosen && deps.some((v) => v.id === chosen)) return chosen;
  return deps[0]?.id ?? null;
}

export const BOUNDARY_LABEL: Record<BoundaryKind, string> = { confirmed: '경계 통과', inferred: '경계 통과(추론)', possible: '경계 통과 가능' };
export const DATA_CLASS_COLOR: Partial<Record<DataClass, string>> = { personal: '#f5a524', sensitive: '#e5484d' };
