// API Flow 모델 연산 (Sprint 8 · D-25 · 03 V10·V14 · 04 §6.11). React·런타임 import 없음 — node --test로 검증한다.
// 모든 함수는 입력 모델을 바꾸지 않고 새 모델을 돌려준다. 거부되면 입력 모델을 그대로 돌려준다(이유는 error).
import type { ApiFlow, ArchitectureModel, FlowOutcome, HttpMethod, OutcomeCause } from './architecture-types';

export const FLOW_LIMITS = { flows: 30, name: 80, description: 2000, path: 200, participantsMin: 2, participantsMax: 12, outcomesMax: 10, outcomeLabel: 60, mermaidBytes: 32 * 1024 } as const;
export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const OUTCOME_CAUSES: OutcomeCause[] = ['auth', 'validation', 'timeout', 'dependency_down', 'queue_retry', 'other'];
export type AuthRole = 'tokenIssuer' | 'tokenVerifier' | 'dataAccessor';
export const AUTH_ROLES: AuthRole[] = ['tokenIssuer', 'tokenVerifier', 'dataAccessor'];
type Result = { model: ArchitectureModel; error?: string };

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function randomAlnum(n: number, rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < n; i++) s += ALNUM[Math.floor(rand() * ALNUM.length)];
  return s;
}
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
const isLogical = (model: ArchitectureModel, cid: string) => model.components[cid]?.layer === 'logical';

function withFlow(model: ArchitectureModel, flowId: string, fn: (f: ApiFlow) => string | void): Result {
  const cur = model.flows?.[flowId];
  if (!cur) return { model, error: '흐름을 찾을 수 없습니다.' };
  const next = structuredClone(cur);
  const error = fn(next);
  if (error) return { model, error };
  if (JSON.stringify(next) === JSON.stringify(cur)) return { model };
  return { model: { ...model, flows: { ...model.flows, [flowId]: next } } };
}

export function flowNameError(name: string) {
  const t = name.trim();
  if (!t) return '흐름 이름을 입력하세요.';
  if (t.length > FLOW_LIMITS.name) return `흐름 이름은 ${FLOW_LIMITS.name}자 이하여야 합니다.`;
}
export function pathError(path: string) {
  if (!path) return;
  if (!path.startsWith('/')) return '경로는 /로 시작해야 합니다.';
  if (/\s/.test(path)) return '경로에 공백을 넣을 수 없습니다.';
  if (path.length > FLOW_LIMITS.path) return `경로는 ${FLOW_LIMITS.path}자 이하여야 합니다.`;
}
export function participantsError(model: ArchitectureModel, ids: string[]) {
  if (ids.length < FLOW_LIMITS.participantsMin) return `참여 컴포넌트는 ${FLOW_LIMITS.participantsMin}개 이상이어야 합니다.`;
  if (ids.length > FLOW_LIMITS.participantsMax) return `참여 컴포넌트는 ${FLOW_LIMITS.participantsMax}개 이하여야 합니다.`;
  if (new Set(ids).size !== ids.length) return '참여 컴포넌트가 겹칩니다.';
  if (ids.some((cid) => !isLogical(model, cid))) return '흐름에는 Logical 컴포넌트만 참여할 수 있습니다.';
}

/** 새 흐름: 이름·참여(2개 이상)·엔드포인트. 결과는 ✓ 200 OK 하나, 본문은 템플릿 */
export function addFlow(
  model: ArchitectureModel, input: { name: string; participantIds: string[]; endpoint?: { method: HttpMethod; path: string } },
  body: (participantIds: string[], outcomes: FlowOutcome[]) => string, rand?: () => number,
): Result & { flowId?: string } {
  const flows = model.flows ?? {};
  if (Object.keys(flows).length >= FLOW_LIMITS.flows) return { model, error: `흐름은 최대 ${FLOW_LIMITS.flows}개입니다.` };
  const error = flowNameError(input.name) ?? participantsError(model, input.participantIds) ?? (input.endpoint ? pathError(input.endpoint.path) : undefined);
  if (error) return { model, error };
  let flowId = `flw_${randomAlnum(10, rand)}`;
  while (flows[flowId]) flowId = `flw_${randomAlnum(10, rand)}`;
  const outcomes: FlowOutcome[] = [{ id: `out_${randomAlnum(6, rand)}`, kind: 'success', label: '200 OK' }];
  const flow: ApiFlow = {
    id: flowId, name: input.name.trim(), participantIds: [...input.participantIds], outcomes, requirementIds: [],
    ...(input.endpoint?.path ? { endpoint: { method: input.endpoint.method, path: input.endpoint.path } } : {}),
    mermaid: body(input.participantIds, outcomes),
  };
  return { model: { ...model, flows: { ...flows, [flowId]: flow } }, flowId };
}

export function removeFlow(model: ArchitectureModel, flowId: string): ArchitectureModel {
  if (!model.flows?.[flowId]) return model;
  const flows = { ...model.flows };
  delete flows[flowId];
  return { ...model, flows };
}

export function updateFlowText(model: ArchitectureModel, flowId: string, field: 'name' | 'description' | 'mermaid', value: string): Result {
  return withFlow(model, flowId, (f) => {
    if (field === 'name') { const e = flowNameError(value); if (e) return e; f.name = value.trim(); }
    else if (field === 'description') {
      if (value.length > FLOW_LIMITS.description) return `설명은 ${FLOW_LIMITS.description}자 이하여야 합니다.`;
      if (value) f.description = value; else delete f.description;
    } else {
      if (utf8Bytes(value) > FLOW_LIMITS.mermaidBytes) return 'Mermaid 본문은 32KB 이하여야 합니다.';
      f.mermaid = value;
    }
  });
}

export function setEndpoint(model: ArchitectureModel, flowId: string, method: HttpMethod | '', path: string): Result {
  return withFlow(model, flowId, (f) => {
    if (!path) { delete f.endpoint; return; }
    const e = pathError(path);
    if (e) return e;
    f.endpoint = { method: (method || 'GET') as HttpMethod, path };
  });
}

/** 참여 목록 바꾸기 (순서 포함). 빠진 참여가 맡던 인증 역할은 지운다 */
export function setParticipants(model: ArchitectureModel, flowId: string, ids: string[]): Result {
  return withFlow(model, flowId, (f) => {
    const e = participantsError(model, ids);
    if (e) return e;
    f.participantIds = [...ids];
    for (const role of AUTH_ROLES) if (f.auth?.[role] && !ids.includes(f.auth[role]!)) delete f.auth[role];
    if (f.auth && !Object.keys(f.auth).length) delete f.auth;
  });
}

export function moveParticipant(model: ArchitectureModel, flowId: string, cid: string, delta: -1 | 1): Result {
  const f = model.flows?.[flowId];
  if (!f) return { model };
  const i = f.participantIds.indexOf(cid), j = i + delta;
  if (i < 0 || j < 0 || j >= f.participantIds.length) return { model };
  const ids = [...f.participantIds];
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return setParticipants(model, flowId, ids);
}

export function setAuthRole(model: ArchitectureModel, flowId: string, role: AuthRole, cid: string): Result {
  return withFlow(model, flowId, (f) => {
    if (cid && !f.participantIds.includes(cid)) return '인증 역할은 참여 컴포넌트 중에서 고르세요.';
    const auth = { ...(f.auth ?? {}) };
    if (cid) auth[role] = cid; else delete auth[role];
    if (Object.keys(auth).length) f.auth = auth; else delete f.auth;
  });
}

export function addOutcome(model: ArchitectureModel, flowId: string, kind: FlowOutcome['kind'], label: string, rand?: () => number): Result {
  return withFlow(model, flowId, (f) => {
    if (f.outcomes.length >= FLOW_LIMITS.outcomesMax) return `결과 분기는 최대 ${FLOW_LIMITS.outcomesMax}개입니다.`;
    const t = label.trim();
    if (!t || t.length > FLOW_LIMITS.outcomeLabel) return `결과 라벨은 1~${FLOW_LIMITS.outcomeLabel}자여야 합니다.`;
    let id = `out_${randomAlnum(6, rand)}`;
    while (f.outcomes.some((o) => o.id === id)) id = `out_${randomAlnum(6, rand)}`;
    f.outcomes.push({ id, kind, label: t });
  });
}

export function updateOutcome(model: ArchitectureModel, flowId: string, outcomeId: string, patch: { kind?: FlowOutcome['kind']; label?: string; cause?: OutcomeCause | '' }): Result {
  return withFlow(model, flowId, (f) => {
    const o = f.outcomes.find((x) => x.id === outcomeId);
    if (!o) return '결과를 찾을 수 없습니다.';
    if (patch.label !== undefined) {
      const t = patch.label.trim();
      if (!t || t.length > FLOW_LIMITS.outcomeLabel) return `결과 라벨은 1~${FLOW_LIMITS.outcomeLabel}자여야 합니다.`;
      o.label = t;
    }
    if (patch.kind) o.kind = patch.kind;
    if (patch.cause !== undefined) { if (patch.cause) o.cause = patch.cause; else delete o.cause; }
    if (!f.outcomes.some((x) => x.kind === 'success')) return '성공 결과가 하나 이상 있어야 합니다.';
  });
}

export function removeOutcome(model: ArchitectureModel, flowId: string, outcomeId: string): Result {
  return withFlow(model, flowId, (f) => {
    const rest = f.outcomes.filter((o) => o.id !== outcomeId);
    if (!rest.length) return '결과 분기는 하나 이상 있어야 합니다.';
    if (!rest.some((o) => o.kind === 'success')) return '성공 결과가 하나 이상 있어야 합니다.';
    f.outcomes = rest;
  });
}

export function toggleFlowRequirement(model: ArchitectureModel, flowId: string, requirementId: string): Result {
  return withFlow(model, flowId, (f) => {
    f.requirementIds = f.requirementIds.includes(requirementId) ? f.requirementIds.filter((x) => x !== requirementId) : [...f.requirementIds, requirementId];
  });
}

/**
 * 저장된 흐름의 끊긴 참조 정리 (Studio 로드 시 · Q12). 없는·Logical이 아닌 참여와 그 역할만 뺀다.
 * 유효 참여가 2개 미만이 된 흐름은 **지우지 않고** underTwo로 알린다(사용자가 [수정]/[삭제]).
 */
export function repairFlows(model: ArchitectureModel): { model: ArchitectureModel; removed: number; underTwo: string[] } {
  let removed = 0;
  const underTwo: string[] = [];
  let flows = model.flows;
  for (const [id, f] of Object.entries(model.flows ?? {})) {
    const keep = f.participantIds.filter((cid) => isLogical(model, cid));
    const lost = f.participantIds.length - keep.length;
    const auth = { ...(f.auth ?? {}) };
    for (const role of AUTH_ROLES) if (auth[role] && !keep.includes(auth[role]!)) { delete auth[role]; removed++; }
    if (lost) removed += lost;
    if (lost || Object.keys(auth).length !== Object.keys(f.auth ?? {}).length) {
      const next: ApiFlow = { ...f, participantIds: keep };
      if (Object.keys(auth).length) next.auth = auth; else delete next.auth;
      flows = { ...flows, [id]: next };
    }
    if (keep.length < FLOW_LIMITS.participantsMin) underTwo.push(id);
  }
  return { model: flows === model.flows ? model : { ...model, flows }, removed, underTwo };
}

/** 컴포넌트 삭제가 흐름에 주는 영향 (확인 창) */
export function flowDeleteImpact(model: ArchitectureModel, componentIds: string[]): { affected: string[]; underTwo: string[] } {
  const gone = new Set(componentIds);
  const affected: string[] = [], underTwo: string[] = [];
  for (const [id, f] of Object.entries(model.flows ?? {})) {
    if (!f.participantIds.some((cid) => gone.has(cid))) continue;
    affected.push(id);
    if (f.participantIds.filter((cid) => !gone.has(cid)).length < FLOW_LIMITS.participantsMin) underTwo.push(id);
  }
  return { affected, underTwo };
}

/** FLW-06: 흐름 강조 — 참여 컴포넌트와 양 끝이 모두 참여인 calls */
export function flowHighlight(model: ArchitectureModel, flowId: string | null): { componentIds: Set<string>; relationIds: Set<string> } | null {
  const f = flowId ? model.flows?.[flowId] : undefined;
  if (!f) return null;
  const componentIds = new Set(f.participantIds);
  const relationIds = new Set(Object.values(model.relations).filter((r) => r.type === 'calls' && componentIds.has(r.from) && componentIds.has(r.to)).map((r) => r.id));
  return { componentIds, relationIds };
}
