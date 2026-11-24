// 도메인 모델 순수 연산 (Sprint 2 Step 2). React·네트워크·런타임 import 없음 — Node type stripping으로 바로 테스트한다.
// 모든 함수는 입력 모델을 바꾸지 않고 새 모델을 돌려준다. 바꿀 것이 없거나 거부되면 입력 모델을 그대로 돌려준다.
//
// 좌표 기준: parentId가 있으면 position은 부모 그룹 좌상단 기준 상대 좌표, 없으면 캔버스 절대 좌표 (React Flow sub-flow와 같음).
import type { ArchitectureModel, Component, DeploymentStrategy, PropertyDef, Relation, RelationType, RetryBackoff, TypeRegistry, View, ViewNode } from './architecture-types';
import { defaultRelationType, isOpsRelationType, pruneOrphanOpsRelations, repairOpsRelations, type OpsRelationType } from './ops-relations.ts';

export type NewId = (prefix: 'cmp' | 'rel' | 'nd' | 'ed' | 'view') => string;
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export const DUPLICATE_OFFSET = 24;
export const GROUP_DEFAULT_SIZE: Size = { width: 360, height: 240 };
export const GROUP_MIN_SIZE = 80;

const round = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

export function cloneModel(model: ArchitectureModel): ArchitectureModel {
  return structuredClone(model);
}

export const DESCRIPTION_MAX_BYTES = 16 * 1024;
export const PROTOCOLS = ['HTTP', 'HTTPS', 'gRPC', 'TCP', 'AMQP', 'Kafka', 'JDBC', 'RESP', 'Other'] as const;
export const RELATION_MODES = ['sync', 'async'] as const;

export function parsePropertyInput(def: PropertyDef, raw: string): { value?: unknown; error?: string } {
  if (raw === '') return {};
  switch (def.type) {
    case 'number': {
      const value = Number(raw);
      if (!raw.trim() || !Number.isFinite(value)) return { error: '숫자를 입력하세요.' };
      if (def.integer && !Number.isInteger(value)) return { error: '정수를 입력하세요.' };
      if (def.min !== undefined && value < def.min) return { error: `${def.min} 이상이어야 합니다.` };
      if (def.max !== undefined && value > def.max) return { error: `${def.max} 이하여야 합니다.` };
      return { value };
    }
    case 'boolean':
      return raw === 'true' || raw === 'false' ? { value: raw === 'true' } : { error: '참 또는 거짓을 선택하세요.' };
    case 'enum':
      return def.options?.includes(raw) ? { value: raw } : { error: '목록에서 값을 선택하세요.' };
    case 'list': {
      const value = raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      return value.length > 50 || value.some((item) => item.length > 200)
        ? { error: '200자 이하 항목을 최대 50개 입력하세요.' }
        : { value: value.length ? value : undefined };
    }
    case 'string':
    case 'text': {
      const limit = def.type === 'string' ? 500 : 5000;
      if (raw.length > limit) return { error: `${limit}자 이하여야 합니다.` };
      if (def.type === 'string' && def.pattern && !new RegExp(def.pattern).test(raw)) return { error: '형식이 맞지 않습니다.' };
      return { value: raw };
    }
  }
}

export function componentTextError(field: 'name' | 'technology' | 'description', value: string): string | undefined {
  if (field === 'name' && (!value.trim() || value.length > 120)) return '이름은 1~120자여야 합니다.';
  if (field === 'technology' && value.length > 500) return '기술은 500자 이하여야 합니다.';
  if (field === 'description' && new TextEncoder().encode(value).length > DESCRIPTION_MAX_BYTES) return '설명은 UTF-8 기준 16KiB 이하여야 합니다.';
}

export function customKeyError(defs: PropertyDef[], key: string, custom: Record<string, string>, previous?: string): string | undefined {
  if (!key || key.length > 120) return '키는 1~120자여야 합니다.';
  if (defs.some((def) => def.key === key)) return '등록된 속성 키와 같은 이름은 사용할 수 없습니다.';
  if (key !== previous && Object.hasOwn(custom, key)) return '이미 있는 키입니다.';
}

export function updateComponentText(model: ArchitectureModel, id: string, field: 'name' | 'technology' | 'description', value: string): ArchitectureModel {
  const component = model.components[id];
  if (!component || componentTextError(field, value) || (component[field] ?? '') === value) return model;
  const updated = { ...component };
  if (!value && field !== 'name') delete updated[field];
  else updated[field] = value;
  return { ...model, components: { ...model.components, [id]: updated } };
}

export function updateComponentProperty(model: ArchitectureModel, registry: TypeRegistry | null, id: string, key: string, raw: string): ArchitectureModel {
  const component = model.components[id];
  const def = registry?.types[component?.type]?.properties?.find((property) => property.key === key);
  if (!component || !def) return model;
  const { value, error } = parsePropertyInput(def, raw);
  const previous = component.properties?.[key];
  if (error || previous === value || (Array.isArray(previous) && Array.isArray(value) && previous.length === value.length && previous.every((entry, index) => entry === value[index]))) return model;
  const properties = { ...component.properties };
  if (value === undefined) delete properties[key];
  else properties[key] = value;
  return { ...model, components: { ...model.components, [id]: { ...component, properties } } };
}

export function updateCustomProperty(model: ArchitectureModel, registry: TypeRegistry | null, id: string, previous: string | undefined, key: string, value?: string): ArchitectureModel {
  const component = model.components[id];
  if (!component) return model;
  const custom = component.custom ?? {};
  if (previous !== undefined && !Object.hasOwn(custom, previous)) return model;
  if (value === undefined) {
    if (previous === undefined) return model;
  } else {
    const defs = registry?.types[component.type]?.properties;
    if (!defs || customKeyError(defs, key, custom, previous) || value.length > 500 || (previous === key && custom[key] === value)) return model;
  }
  const updated = { ...custom };
  if (previous !== undefined) delete updated[previous];
  const next = value === undefined ? updated : { ...updated, [key]: value };
  const nextComponent = { ...component };
  if (Object.keys(next).length) nextComponent.custom = next;
  else delete nextComponent.custom;
  return { ...model, components: { ...model.components, [id]: nextComponent } };
}

export function relationFieldError(field: 'protocol' | 'mode' | 'label', value: string): string | undefined {
  if (!value) return;
  if (field === 'protocol' && !PROTOCOLS.some((entry) => entry === value)) return '지원하지 않는 프로토콜입니다.';
  if (field === 'mode' && !RELATION_MODES.some((entry) => entry === value)) return '동기 또는 비동기를 선택하세요.';
  if (field === 'label' && value.length > 500) return '라벨은 500자 이하여야 합니다.';
}

/** Sprint 11: 운영 설계 관계의 유형 바꾸기 (7종 안에서만) */
export function setRelationType(model: ArchitectureModel, id: string, type: OpsRelationType): ArchitectureModel {
  const relation = model.relations[id];
  if (!relation || !isOpsRelationType(relation.type) || !isOpsRelationType(type) || relation.type === type) return model;
  return { ...model, relations: { ...model.relations, [id]: { ...relation, type: type as RelationType } } };
}

/** 배치안 종류별 "그 배치안의 컴포넌트" layer — deployment 배치안은 운영 설계(ops) 컴포넌트도 가진다 (Sprint 11) */
const layerOf = (kind: string): string[] => (kind === 'deployment' ? ['deployment', 'ops'] : [kind]);

export function updateRelationField(model: ArchitectureModel, id: string, field: 'protocol' | 'mode' | 'label', value: string): ArchitectureModel {
  const relation = model.relations[id];
  if (!relation || relation.type !== 'calls' || relationFieldError(field, value) || (relation[field] ?? '') === value) return model;
  const updated: Relation = { ...relation, [field]: value };
  if (!value) delete updated[field];
  return { ...model, relations: { ...model.relations, [id]: updated } };
}

// ── 관계 운영·보안 속성 (Sprint 8 · REL-05·06 · D-26) ─────────────────────────────
// calls에만. 값 칸은 없다(유형만). 빈 값 = 그 속성 지우기. 수치는 서버 V2와 같은 제한.
export const TIMEOUT_MAX_MS = 600000;
export const RETRY_MAX = 10;
export const RETRY_BACKOFFS = ['none', 'fixed', 'exponential'] as const;
export const ON_FAILURE = ['propagate', 'fallback', 'queue_retry', 'ignore'] as const;
export const CREDENTIALS = ['none', 'session-cookie', 'jwt-bearer', 'api-key', 'service-role', 'mtls'] as const;
export const DATA_CLASSES = ['public', 'internal', 'personal', 'sensitive'] as const;
export type RelationAttr = 'timeoutMs' | 'retryMax' | 'retryBackoff' | 'onFailure' | 'credential' | 'dataClass';

const intIn = (raw: string, min: number, max: number) => /^\d+$/.test(raw.trim()) && Number(raw) >= min && Number(raw) <= max;

export function relationAttrError(attr: RelationAttr, raw: string): string | undefined {
  if (raw === '') return;
  switch (attr) {
    case 'timeoutMs': return intIn(raw, 1, TIMEOUT_MAX_MS) ? undefined : `1~${TIMEOUT_MAX_MS} 사이 정수(ms)로 입력하세요.`;
    case 'retryMax': return intIn(raw, 0, RETRY_MAX) ? undefined : `0~${RETRY_MAX} 사이 정수로 입력하세요.`;
    case 'retryBackoff': return (RETRY_BACKOFFS as readonly string[]).includes(raw) ? undefined : '지원하지 않는 방식입니다.';
    case 'onFailure': return (ON_FAILURE as readonly string[]).includes(raw) ? undefined : '지원하지 않는 동작입니다.';
    case 'credential': return (CREDENTIALS as readonly string[]).includes(raw) ? undefined : '지원하지 않는 자격증명 유형입니다.';
    case 'dataClass': return (DATA_CLASSES as readonly string[]).includes(raw) ? undefined : '지원하지 않는 데이터 등급입니다.';
  }
}

/** 운영·보안 속성 하나 바꾸기. retry는 횟수가 비면 통째로 지우고, 방식이 비면 'none' */
export function updateRelationAttr(model: ArchitectureModel, id: string, attr: RelationAttr, raw: string): ArchitectureModel {
  const relation = model.relations[id];
  if (!relation || relation.type !== 'calls' || relationAttrError(attr, raw)) return model;
  const updated: Relation = { ...relation };
  if (attr === 'timeoutMs') {
    if (raw === '') delete updated.timeoutMs; else updated.timeoutMs = Number(raw);
  } else if (attr === 'retryMax') {
    if (raw === '') delete updated.retry;
    else updated.retry = { max: Number(raw), backoff: relation.retry?.backoff ?? 'fixed' };
  } else if (attr === 'retryBackoff') {
    if (!relation.retry) return model;
    updated.retry = { max: relation.retry.max, backoff: (raw || 'none') as RetryBackoff };
  } else {
    if (raw === '') delete updated[attr]; else (updated as unknown as Record<string, unknown>)[attr] = raw;
  }
  return JSON.stringify(updated) === JSON.stringify(relation) ? model : { ...model, relations: { ...model.relations, [id]: updated } };
}

/** 엣지 툴팁·요약: `HTTPS · sync · 3s · retry 1 fixed · jwt-bearer · personal` */
export function relationSummary(r: Relation): string {
  const timeout = r.timeoutMs === undefined ? null : r.timeoutMs % 1000 === 0 ? `${r.timeoutMs / 1000}s` : `${r.timeoutMs}ms`;
  return [r.protocol, r.mode, timeout, r.retry ? `retry ${r.retry.max} ${r.retry.backoff}` : null, r.onFailure ? `실패 시 ${r.onFailure}` : null, r.credential, r.dataClass]
    .filter(Boolean).join(' · ');
}

export type RequirementTarget = 'components' | 'relations';

/** 컴포넌트·관계의 요구사항 연결(on=true)·해제(on=false). 이미 같은 상태면 입력 모델을 그대로 돌려준다 */
export function setRequirementLink(model: ArchitectureModel, target: RequirementTarget, id: string, requirementId: string, on: boolean): ArchitectureModel {
  const item = model[target][id];
  if (!item || !requirementId) return model;
  const current = Array.isArray(item.requirementIds) ? item.requirementIds : [];
  const has = current.includes(requirementId);
  if (has === on) return model;
  const requirementIds = on ? [...current, requirementId] : current.filter((value) => value !== requirementId);
  return { ...model, [target]: { ...model[target], [id]: { ...item, requirementIds } } };
}

/** 저장 응답의 V9 경고(현재 프로젝트에 없는 참조)를 반영해 해당 참조만 제거한다. 그 사이 추가한 편집은 유지한다 */
export function removeRequirementRefs(model: ArchitectureModel, removals: { path: string; removedIds?: string[] }[]): ArchitectureModel {
  let next = model;
  for (const { path, removedIds } of removals) {
    const match = /^(components|relations)\.([^.]+)\.requirementIds$/.exec(path);
    if (!match || !removedIds?.length) continue;
    const target = match[1] as RequirementTarget;
    const item = next[target][match[2]];
    if (!item || !Array.isArray(item.requirementIds)) continue;
    const removed = new Set(removedIds.map((value) => value.toLowerCase()));
    const requirementIds = item.requirementIds.filter((value) => !removed.has(value.toLowerCase()));
    if (requirementIds.length === item.requirementIds.length) continue;
    next = { ...next, [target]: { ...next[target], [match[2]]: { ...item, requirementIds } } };
  }
  return next;
}

export function getView(model: ArchitectureModel, viewId: string): View | undefined {
  return model.views.find((v) => v.id === viewId);
}

/** 이 View에서 노드의 캔버스 절대 좌표 (조상 그룹 좌표를 모두 더함) */
export function absolutePosition(view: View, nodeId: string): Point {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  let x = 0, y = 0;
  const seen = new Set<string>();
  let cur = byId.get(nodeId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    x += cur.position.x;
    y += cur.position.y;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return { x, y };
}

/** candidateId가 ancestorId 자신이거나 그 하위 노드인가 */
export function isSelfOrDescendant(view: View, candidateId: string, ancestorId: string): boolean {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let cur = byId.get(candidateId);
  while (cur && !seen.has(cur.id)) {
    if (cur.id === ancestorId) return true;
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

/**
 * 부모가 될 수 있는 노드인가: group 노드, 또는 배치안(deployment View)의 컨테이너 타입 컴포넌트 노드 (Sprint 7, 03 V5).
 * registry를 주지 않으면 group만 (Sprint 6까지와 같은 동작).
 */
export function canContain(model: ArchitectureModel, view: View, node: ViewNode, registry?: TypeRegistry | null): boolean {
  if (node.kind === 'group') return true;
  if (!['deployment', 'aws', 'kubernetes'].includes(view.kind) || node.kind !== 'component' || !node.componentId) return false;
  const type = model.components[node.componentId]?.type;
  return Boolean(type && registry?.types[type]?.container);
}

/** 모델을 복제해 대상 View와 함께 fn에 넘긴다. fn이 false를 돌려주면 원래 모델을 그대로 반환 */
function withView(model: ArchitectureModel, viewId: string, fn: (m: ArchitectureModel, v: View) => boolean | void): ArchitectureModel {
  if (!getView(model, viewId)) return model;
  const next = cloneModel(model);
  const v = getView(next, viewId)!;
  return fn(next, v) === false ? model : next;
}

// ── 추가 ─────────────────────────────────────────────────

/** 레지스트리의 default를 새 컴포넌트에만 채운다 (서버는 기본값을 채우지 않음) */
export function defaultProperties(registry: TypeRegistry | null, type: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const pd of registry?.types[type]?.properties ?? []) {
    if (pd.default !== undefined) props[pd.key] = structuredClone(pd.default);
  }
  return props;
}

export function addComponent(
  model: ArchitectureModel, viewId: string, type: string, registry: TypeRegistry | null, position: Point, newId: NewId,
): { model: ArchitectureModel; nodeId: string | null; componentId: string | null } {
  const def = registry?.types[type];
  if (def && def.nodeKind !== 'component') return { model, nodeId: null, componentId: null };
  let nodeId: string | null = null, componentId: string | null = null;
  const next = withView(model, viewId, (m, v) => {
    const label = def?.label ?? type;
    const count = Object.values(m.components).filter((c) => c.type === type).length + 1;
    componentId = newId('cmp');
    const component: Component = {
      id: componentId, type, layer: def?.layer ?? 'logical', name: `${label} ${count}`,
      properties: defaultProperties(registry, type), requirementIds: [], decisionIds: [],
    };
    m.components[componentId] = component;
    nodeId = newId('nd');
    const node: ViewNode = { id: nodeId, kind: 'component', componentId, position: round(position) };
    if (def?.container) { node.width = GROUP_DEFAULT_SIZE.width; node.height = GROUP_DEFAULT_SIZE.height; }
    v.nodes.push(node);
  });
  return { model: next, nodeId, componentId };
}

// ── 참조 노드 (Sprint 8 · VIEW-05 · 04 §6.3·§6.4) ─────────────────────────────────
// 같은 componentId의 노드를 다른 View에도 둔다. 한 View에 같은 컴포넌트 노드는 최대 1개(03 §2.2).

export type ReferenceCandidate = { componentId: string; name: string; type: string; views: { id: string; label: string }[]; orphan: boolean };

const viewLabel = (v: View) => (v.kind === 'deployment' ? v.variant ?? v.name : v.name);

/** 지금 View에 놓을 수 있는 다른 View의 컴포넌트 — 레지스트리 views가 이 View 종류를 허용하고, 이 View에 노드가 없는 것. 고아 먼저 */
/**
 * 참조 노드로 놓을 수 있는가: 레지스트리가 그 View 종류를 허용하거나,
 * (Sprint 11, 08 D-45 Q1) **운영 설계 배치안**(ops 컴포넌트 노드가 하나 이상 있는 deployment 배치안)에 Logical 컴포넌트를 놓는 경우.
 * 일반 배치안(VM·PaaS)은 Sprint 8(VIEW-05) 규칙 그대로 Logical을 받지 않는다.
 */
export const isOpsDesignView = (model: ArchitectureModel, view: View | undefined) =>
  view?.kind === 'deployment' && view.nodes.some((n) => n.componentId && model.components[n.componentId]?.layer === 'ops');

function canReference(model: ArchitectureModel, c: Component, view: View, registry: TypeRegistry | null): boolean {
  if (registry?.types[c.type]?.views?.includes(view.kind as never)) return true;
  return c.layer === 'logical' && Boolean(registry?.types[c.type]) && isOpsDesignView(model, view);
}

export function referenceCandidates(model: ArchitectureModel, viewId: string, registry: TypeRegistry | null): ReferenceCandidate[] {
  const view = getView(model, viewId);
  if (!view) return [];
  const here = new Set(view.nodes.map((n) => n.componentId).filter(Boolean));
  const out: ReferenceCandidate[] = [];
  for (const c of Object.values(model.components)) {
    if (here.has(c.id) || c.type === 'aws.eks') continue;
    if (!canReference(model, c, view, registry)) continue;
    const views = model.views.filter((v) => v.nodes.some((n) => n.componentId === c.id)).map((v) => ({ id: v.id, label: viewLabel(v) }));
    out.push({ componentId: c.id, name: c.name, type: c.type, views, orphan: views.length === 0 });
  }
  return out.sort((a, b) => Number(b.orphan) - Number(a.orphan) || a.name.localeCompare(b.name, 'ko'));
}

/** 참조 노드 추가. 이미 이 View에 있거나 허용되지 않는 타입이면 그대로 */
export function addReferenceNode(
  model: ArchitectureModel, viewId: string, componentId: string, registry: TypeRegistry | null, position: Point, newId: NewId,
): { model: ArchitectureModel; nodeId: string | null } {
  const c = model.components[componentId];
  const view = getView(model, viewId);
  if (!c || c.type === 'aws.eks' || !view || view.nodes.some((n) => n.componentId === componentId)) return { model, nodeId: null };
  const def = registry?.types[c.type];
  if (!def || !canReference(model, c, view, registry)) return { model, nodeId: null };
  let nodeId: string | null = null;
  const next = withView(model, viewId, (_m, v) => {
    nodeId = newId('nd');
    const node: ViewNode = { id: nodeId, kind: 'component', componentId, position: round(position) };
    if (def.container) { node.width = GROUP_DEFAULT_SIZE.width; node.height = GROUP_DEFAULT_SIZE.height; }
    v.nodes.push(node);
  });
  return { model: next, nodeId };
}

/** 이 컴포넌트가 있는 View와 그 노드 (Inspector 이동용) */
export function componentPlacements(model: ArchitectureModel, componentId: string): { viewId: string; label: string; nodeId: string }[] {
  return model.views.flatMap((v) => {
    const n = v.nodes.find((x) => x.componentId === componentId);
    return n ? [{ viewId: v.id, label: viewLabel(v), nodeId: n.id }] : [];
  });
}

export function addGroup(
  model: ArchitectureModel, viewId: string, position: Point, size: Size, newId: NewId, label = 'Boundary',
): { model: ArchitectureModel; nodeId: string | null } {
  let nodeId: string | null = null;
  const next = withView(model, viewId, (_m, v) => {
    nodeId = newId('nd');
    v.nodes.push({
      id: nodeId, kind: 'group', label, position: round(position),
      width: Math.max(GROUP_MIN_SIZE, Math.round(size.width)), height: Math.max(GROUP_MIN_SIZE, Math.round(size.height)),
    });
  });
  return { model: next, nodeId };
}

export function addNote(
  model: ArchitectureModel, viewId: string, position: Point, text: string, newId: NewId,
): { model: ArchitectureModel; nodeId: string | null } {
  let nodeId: string | null = null;
  const next = withView(model, viewId, (_m, v) => {
    nodeId = newId('nd');
    v.nodes.push({ id: nodeId, kind: 'note', text, position: round(position) });
  });
  return { model: next, nodeId };
}

// ── 이동·부모 ─────────────────────────────────────────────

/** 저장 좌표(부모가 있으면 상대 좌표)를 그대로 바꾼다. 그룹을 움직여도 자식의 상대 좌표는 그대로 */
export function moveNodes(model: ArchitectureModel, viewId: string, moves: { id: string; x: number; y: number }[]): ArchitectureModel {
  if (!moves.length) return model;
  return withView(model, viewId, (_m, v) => {
    let changed = false;
    for (const mv of moves) {
      const n = v.nodes.find((x) => x.id === mv.id);
      if (!n) continue;
      const p = round(mv);
      if (n.position.x !== p.x || n.position.y !== p.y) { n.position = p; changed = true; }
    }
    return changed;
  });
}

/** 그룹에 넣거나(parentId) 빼기(null). 화면 절대 위치는 유지. 자기 자신·하위로의 이동, group이 아닌 부모는 거부 */
export function canSetParent(model: ArchitectureModel, viewId: string, nodeId: string, parentId: string | null, registry?: TypeRegistry | null): boolean {
  const v = getView(model, viewId);
  const node = v?.nodes.find((n) => n.id === nodeId);
  if (!v || !node) return false;
  if (parentId === null) return true;
  const parent = v.nodes.find((n) => n.id === parentId);
  if (!parent || !canContain(model, v, parent, registry)) return false;
  return !isSelfOrDescendant(v, parentId, nodeId);
}

export function setParent(model: ArchitectureModel, viewId: string, nodeId: string, parentId: string | null, registry?: TypeRegistry | null): ArchitectureModel {
  if (!canSetParent(model, viewId, nodeId, parentId, registry)) return model;
  return withView(model, viewId, (_m, v) => {
    const node = v.nodes.find((n) => n.id === nodeId)!;
    if ((node.parentId ?? null) === parentId) return false;
    const abs = absolutePosition(v, nodeId);
    const base = parentId ? absolutePosition(v, parentId) : { x: 0, y: 0 };
    node.position = { x: abs.x - base.x, y: abs.y - base.y };
    if (parentId) node.parentId = parentId; else delete node.parentId;
  });
}

/**
 * 캔버스 절대 좌표 point를 품는 그룹 중 가장 안쪽(면적이 가장 작은) 그룹. 없으면 null.
 * movingNodeId를 주면 그 노드 자신과 그 하위 그룹은 후보에서 뺀다 (순환 방지).
 */
export function findDropGroup(model: ArchitectureModel, viewId: string, point: Point, movingNodeId?: string, registry?: TypeRegistry | null): string | null {
  const v = getView(model, viewId);
  if (!v) return null;
  let best: { id: string; area: number } | null = null;
  for (const g of v.nodes) {
    if (!canContain(model, v, g, registry) || !g.width || !g.height) continue;
    if (movingNodeId && isSelfOrDescendant(v, g.id, movingNodeId)) continue;
    const p = absolutePosition(v, g.id);
    if (point.x < p.x || point.y < p.y || point.x > p.x + g.width || point.y > p.y + g.height) continue;
    const area = g.width * g.height;
    if (!best || area < best.area) best = { id: g.id, area };
  }
  return best?.id ?? null;
}

// ── 연결 ─────────────────────────────────────────────────

export function connect(
  model: ArchitectureModel, viewId: string, sourceNodeId: string, targetNodeId: string,
  handles: { sourceHandle?: string | null; targetHandle?: string | null }, newId: NewId,
): { model: ArchitectureModel; relationId: string | null; edgeId: string | null } {
  let relationId: string | null = null, edgeId: string | null = null;
  if (sourceNodeId === targetNodeId) return { model, relationId, edgeId };
  const next = withView(model, viewId, (m, v) => {
    const from = v.nodes.find((n) => n.id === sourceNodeId && n.kind === 'component')?.componentId;
    const to = v.nodes.find((n) => n.id === targetNodeId && n.kind === 'component')?.componentId;
    if (!from || !to || from === to) return false;
    // Sprint 11 (V17): 한쪽이 운영 설계(ops) 컴포넌트면 운영 설계 관계. deployment View에서만 그릴 수 있다
    const opsType = defaultRelationType(m.components[from], m.components[to]);
    if (opsType && v.kind !== 'deployment') return false;
    // 같은 from/to 관계(calls 또는 운영 설계 관계)가 있으면 재사용 (02 §6.2)
    let rel: Relation | undefined = Object.values(m.relations).find((r) => r.from === from && r.to === to && (opsType ? isOpsRelationType(r.type) : r.type === 'calls'));
    if (!rel) {
      rel = opsType
        ? { id: newId('rel'), type: opsType, from, to, requirementIds: [] }
        : { id: newId('rel'), type: 'calls', from, to, protocol: 'HTTP', mode: 'sync', requirementIds: [] };
      m.relations[rel.id] = rel;
    }
    relationId = rel.id;
    const existing = v.edges.find((e) => e.relationId === rel!.id);
    if (existing) { edgeId = existing.id; return false; }   // 관계·엣지가 이미 있으면 변경 없음
    edgeId = newId('ed');
    v.edges.push({ id: edgeId, relationId: rel.id, sourceHandle: handles.sourceHandle ?? undefined, targetHandle: handles.targetHandle ?? undefined });
  });
  return { model: next, relationId, edgeId };
}

// ── 삭제 ─────────────────────────────────────────────────

/** 이 View에서 끝 노드(컴포넌트)가 보이지 않는 엣지를 지운다 */
function pruneEdges(m: ArchitectureModel, v: View) {
  const shown = new Set(v.nodes.filter((n) => n.kind === 'component').map((n) => n.componentId));
  v.edges = v.edges.filter((e) => {
    const r = m.relations[e.relationId];
    return !!r && shown.has(r.from) && shown.has(r.to);
  });
}

function deleteComponent(m: ArchitectureModel, componentId: string) {
  delete m.components[componentId];
  for (const view of m.views) {
    if (view.clusterRef === componentId) delete view.clusterRef;
  }
  // Sprint 8 (Q6): 흐름의 참여·인증 역할에서 뺀다. 참여가 2개 미만이 되는 흐름은 함께 지운다
  // (확인 창이 [취소]/[흐름도 함께 삭제]만 주므로 여기 왔으면 사용자가 동의함). 본문 참조는 그대로 — 화면이 불일치로 알린다
  for (const [fid, fl] of Object.entries(m.flows ?? {})) {
    if (!fl.participantIds.includes(componentId)) continue;
    fl.participantIds = fl.participantIds.filter((cid) => cid !== componentId);
    if (fl.auth) {
      for (const role of ['tokenIssuer', 'tokenVerifier', 'dataAccessor'] as const) if (fl.auth[role] === componentId) delete fl.auth[role];
      if (!Object.keys(fl.auth).length) delete fl.auth;
    }
    if (fl.participantIds.length < 2) delete m.flows![fid];
  }
  for (const [rid, r] of Object.entries(m.relations)) {
    if (r.from !== componentId && r.to !== componentId) continue;
    delete m.relations[rid];
    for (const vv of m.views) vv.edges = vv.edges.filter((e) => e.relationId !== rid);
  }
}

/**
 * 노드 제거 (04 §6.8).
 * - 지운 그룹의 자식은 화면 절대 위치를 유지한 채, 남아 있는 가장 가까운 조상(없으면 캔버스)으로 옮긴다
 * - 붙은 엣지(표현)는 지운다
 * - deleteComponents=true: 그 컴포넌트를 **모든 View에서** 지운다(Sprint 8 참조 노드 — 다른 View의 노드도 같은 규칙으로 제거),
 *   관계와 모든 View의 해당 엣지까지. Sprint 8 Step 3부터 흐름 참여·역할에서도 뺀다
 * - deleteComponents=false: "노드만 제거" — 이 View의 노드만. 컴포넌트·relations·다른 View는 그대로 (저장 시 V7 경고)
 */
export function removeNodes(
  model: ArchitectureModel, viewId: string, nodeIds: string[], opts: { deleteComponents: boolean },
): ArchitectureModel {
  return withView(model, viewId, (m, v) => {
    const requested = new Set(nodeIds);
    if (!opts.deleteComponents && v.nodes.some((node) => requested.has(node.id)
      && node.componentId && m.components[node.componentId]?.type === 'aws.eks')) return false;
    const removed = dropNodes(v, requested);
    if (!removed.length) return false;
    if (opts.deleteComponents) {
      const cids = new Set(removed.map((n) => n.componentId).filter((cid): cid is string => Boolean(cid && m.components[cid])));
      for (const vv of m.views) {
        if (vv === v) continue;
        const ids = vv.nodes.filter((n) => n.componentId && cids.has(n.componentId)).map((n) => n.id);
        if (ids.length) { dropNodes(vv, new Set(ids)); pruneEdges(m, vv); }
      }
      for (const cid of cids) deleteComponent(m, cid);
    }
    pruneEdges(m, v);
    pruneOrphanOpsRelations(m);   // Sprint 11 (V17): 마지막 표시 엣지가 사라진 운영 설계 관계도 함께
  });
}

/** 한 View에서 노드를 빼고 남는 자식의 절대 위치를 보존한다. 뺀 노드 목록을 돌려준다 */
function dropNodes(v: View, requested: Set<string>): ViewNode[] {
  const gone = new Set([...requested].filter((id) => v.nodes.some((n) => n.id === id)));
  if (!gone.size) return [];
  const byId = new Map(v.nodes.map((n) => [n.id, n]));
  // 남는 노드 중 부모가 지워지는 것: 새 좌표는 모두 계산한 뒤 한 번에 반영 (계산 중 좌표가 바뀌지 않게)
  const reparent = new Map<string, { position: Point; parentId?: string }>();
  for (const n of v.nodes) {
    if (gone.has(n.id) || !n.parentId || !gone.has(n.parentId)) continue;
    const abs = absolutePosition(v, n.id);
    let anc = byId.get(n.parentId);
    while (anc && gone.has(anc.id)) anc = anc.parentId ? byId.get(anc.parentId) : undefined;
    const base = anc ? absolutePosition(v, anc.id) : { x: 0, y: 0 };
    reparent.set(n.id, { position: { x: abs.x - base.x, y: abs.y - base.y }, parentId: anc?.id });
  }
  for (const [id, r] of reparent) {
    const n = byId.get(id)!;
    n.position = r.position;
    if (r.parentId) n.parentId = r.parentId; else delete n.parentId;
  }
  const removed = v.nodes.filter((n) => gone.has(n.id));
  v.nodes = v.nodes.filter((n) => !gone.has(n.id));
  return removed;
}

/** 엣지 제거. deleteRelations=true면 다른 View에서도 쓰지 않는 관계까지 지운다 (Sprint 1 동작) */
export function removeEdges(
  model: ArchitectureModel, viewId: string, edgeIds: string[], opts: { deleteRelations: boolean } = { deleteRelations: true },
): ArchitectureModel {
  return withView(model, viewId, (m, v) => {
    const gone = v.edges.filter((e) => edgeIds.includes(e.id));
    if (!gone.length) return false;
    v.edges = v.edges.filter((e) => !edgeIds.includes(e.id));
    pruneOrphanOpsRelations(m);   // Sprint 11 (V17): 운영 설계 관계는 엣지 없이 남을 수 없다
    if (!opts.deleteRelations) return;
    for (const e of gone) {
      const usedElsewhere = m.views.some((vv) => vv.edges.some((x) => x.relationId === e.relationId));
      if (!usedElsewhere) delete m.relations[e.relationId];
    }
  });
}

/** 삭제 확인 다이얼로그용 요약 */
export function deleteSummary(model: ArchitectureModel, viewId: string, nodeIds: string[]) {
  const v = getView(model, viewId);
  const nodes = v ? v.nodes.filter((n) => nodeIds.includes(n.id)) : [];
  const componentIds = [...new Set(nodes.filter((n) => n.kind === 'component' && n.componentId && model.components[n.componentId]).map((n) => n.componentId!))];
  const cset = new Set(componentIds);
  const relationCount = Object.values(model.relations).filter((r) => cset.has(r.from) || cset.has(r.to)).length;
  // Sprint 8: "컴포넌트 삭제"는 모든 View에서 지운다 → 다른 View 수를 알린다
  const otherViewCount = model.views.filter((vv) => vv.id !== viewId && vv.nodes.some((x) => x.componentId && cset.has(x.componentId))).length;
  // Sprint 8 (Q6): 흐름에서 빠지는 수, 참여가 2개 미만이 되어 함께 지워지는 흐름
  const flows = Object.values(model.flows ?? {}).filter((fl) => fl.participantIds.some((cid) => cset.has(cid)));
  const flowsUnderTwo = flows.filter((fl) => fl.participantIds.filter((cid) => !cset.has(cid)).length < 2).map((fl) => fl.name);
  return {
    componentCount: componentIds.length,
    relationCount,
    otherViewCount,
    flowCount: flows.length,
    flowsUnderTwo,
    includesEks: componentIds.some((id) => model.components[id]?.type === 'aws.eks'),
    detachedClusters: model.views.filter((view) => view.kind === 'kubernetes' && view.clusterRef && cset.has(view.clusterRef)).length,
    needsConfirm: componentIds.length > 0,   // 그룹·노트만이면 묻지 않음
  };
}

// ── 복제 ─────────────────────────────────────────────────

/**
 * 복제 (Ctrl+D). 새 nodeId·componentId, 관계는 복제하지 않는다.
 * - 선택 집합에서 조상이 함께 선택된 노드는 빼고 시작 → 자식은 한 번만 복제
 * - 그룹은 하위 전체를 함께 복제, 새 자식의 parentId = 새 그룹
 * - +24px는 최상위(루트)에만, 하위는 상대 좌표 그대로
 */
export function duplicateNodes(
  model: ArchitectureModel, viewId: string, nodeIds: string[], newId: NewId,
): { model: ArchitectureModel; newNodeIds: string[] } {
  const newNodeIds: string[] = [];
  const next = withView(model, viewId, (m, v) => {
    const selected = new Set(nodeIds.filter((id) => v.nodes.some((n) => n.id === id)));
    const roots = [...selected].filter((id) => ![...selected].some((other) => other !== id && isSelfOrDescendant(v, id, other)));
    if (!roots.length) return false;

    const children = new Map<string, ViewNode[]>();
    for (const n of v.nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);

    const copyNode = (src: ViewNode, parentId: string | undefined, offset: number) => {
      const copy: ViewNode = structuredClone(src);
      copy.id = newId('nd');
      copy.position = { x: src.position.x + offset, y: src.position.y + offset };
      if (parentId) copy.parentId = parentId; else delete copy.parentId;
      if (src.kind === 'component' && src.componentId && m.components[src.componentId]) {
        const c = structuredClone(m.components[src.componentId]);
        c.id = newId('cmp');
        c.name = `${c.name} copy`;
        m.components[c.id] = c;
        copy.componentId = c.id;
      }
      v.nodes.push(copy);
      newNodeIds.push(copy.id);
      for (const child of children.get(src.id) ?? []) copyNode(child, copy.id, 0);
    };
    const byId = new Map(v.nodes.map((n) => [n.id, n]));
    for (const id of roots) {
      const src = byId.get(id)!;
      copyNode(src, src.parentId, DUPLICATE_OFFSET);
    }
  });
  return { model: next, newNodeIds };
}

// ── group·note 편집 ──────────────────────────────────────

export function updateNoteText(model: ArchitectureModel, viewId: string, nodeId: string, text: string): ArchitectureModel {
  return withView(model, viewId, (_m, v) => {
    const n = v.nodes.find((x) => x.id === nodeId && x.kind === 'note');
    if (!n || n.text === text) return false;
    n.text = text;
  });
}

export function updateGroupLabel(model: ArchitectureModel, viewId: string, nodeId: string, label: string): ArchitectureModel {
  return withView(model, viewId, (_m, v) => {
    const n = v.nodes.find((x) => x.id === nodeId && x.kind === 'group');
    if (!n || n.label === label) return false;
    if (label) n.label = label; else delete n.label;
  });
}

/** 그룹 크기 조절. NodeResizer가 왼쪽·위쪽 손잡이로 줄이면 position도 함께 온다 */
export function resizeGroup(model: ArchitectureModel, viewId: string, nodeId: string, size: Size, position?: Point): ArchitectureModel {
  return withView(model, viewId, (_m, v) => {
    // group 또는 크기를 가진 컨테이너 컴포넌트 노드 (Sprint 7)
    const n = v.nodes.find((x) => x.id === nodeId && (x.kind === 'group' || (x.kind === 'component' && x.width !== undefined)));
    if (!n) return false;
    n.width = Math.max(GROUP_MIN_SIZE, Math.round(size.width));
    n.height = Math.max(GROUP_MIN_SIZE, Math.round(size.height));
    if (position) n.position = round(position);
  });
}

// ── Mermaid 가져오기 병합 (Sprint 4 Step 3 · IMP-05·06 · Q7·Q8) ────────────────
// 파싱(importers/mermaid-flowchart)과 배치(import-layout, Dagre)는 호출하는 쪽에서 끝내고 결과만 넘긴다.
// 이 함수는 순수하다: 입력 모델을 바꾸지 않고, 기존 노드 좌표도 바꾸지 않는다.
type ImportPreview = import('./importers/mermaid-flowchart').ImportResult;
type ImportLayout = import('./import-layout').LayoutResult;

/** reuse: 재사용할 기존 componentId, null = 새로 만들기, undefined = 아직 고르지 않음(후보가 여러 개) */
export type ImportChoice = { type: string; reuse: string | null | undefined };
export type ImportSummary = { newComponents: number; reused: number; newNodes: number; newRelations: number; skippedRelations: number; newGroups: number };

const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** 이름이 정확히 같은(대소문자·공백 무시) 기존 컴포넌트 후보 */
export function importCandidates(model: ArchitectureModel, preview: ImportPreview): Record<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const c of Object.values(model.components)) {
    const key = nameKey(c.name);
    byName.set(key, [...(byName.get(key) ?? []), c.id]);
  }
  return Object.fromEntries(preview.nodes.map((n) => [n.mermaidId, byName.get(nameKey(n.label)) ?? []]));
}

/** Q7 기본값: 후보 1개면 재사용, 여러 개면 미선택, 없으면 새로 만들기. 타입은 추론값 */
export function defaultImportChoices(preview: ImportPreview, candidates: Record<string, string[]>): Record<string, ImportChoice> {
  return Object.fromEntries(preview.nodes.map((n) => {
    const list = candidates[n.mermaidId] ?? [];
    return [n.mermaidId, { type: n.inferredType, reuse: list.length === 1 ? list[0] : list.length ? undefined : null }];
  }));
}

/** 적용 전에 막아야 하는 선택 문제. 미선택(후보 여러 개), 사라진 재사용 대상 */
export function importChoiceProblems(model: ArchitectureModel, preview: ImportPreview, choices: Record<string, ImportChoice>) {
  const unchosen: string[] = [], missing: string[] = [];
  for (const n of preview.nodes) {
    const choice = choices[n.mermaidId];
    if (!choice || choice.reuse === undefined) unchosen.push(n.mermaidId);
    else if (choice.reuse && !model.components[choice.reuse]) missing.push(n.mermaidId);
  }
  return { unchosen, missing };
}

/** 새 노드가 필요한 Mermaid 노드: 새 컴포넌트, 또는 이 View에 노드가 없는 기존 컴포넌트 */
export function importNodesToPlace(model: ArchitectureModel, viewId: string, preview: ImportPreview, choices: Record<string, ImportChoice>): string[] {
  const view = getView(model, viewId);
  const drawn = new Set(view?.nodes.filter((n) => n.kind === 'component').map((n) => n.componentId));
  return preview.nodes
    .filter((n) => { const reuse = choices[n.mermaidId]?.reuse; return !reuse || !drawn.has(reuse); })
    .map((n) => n.mermaidId);
}

const relationKey = (r: { from: string; to: string; type: string; protocol?: string; mode?: string; label?: string }) =>
  [r.from, r.to, r.type, r.protocol ?? '', r.mode ?? 'sync', r.label ?? ''].join('|');

export function mergeImport(
  model: ArchitectureModel, viewId: string, preview: ImportPreview, choices: Record<string, ImportChoice>,
  layout: ImportLayout, registry: TypeRegistry | null, newId: NewId,
): { model: ArchitectureModel; summary: ImportSummary } | { error: 'unchosen' | 'missing' | 'no_view' | 'layout'; ids: string[] } {
  if (!getView(model, viewId)) return { error: 'no_view', ids: [] };
  const { unchosen, missing } = importChoiceProblems(model, preview, choices);
  if (unchosen.length) return { error: 'unchosen', ids: unchosen };
  if (missing.length) return { error: 'missing', ids: missing };
  const toPlace = importNodesToPlace(model, viewId, preview, choices);
  const unplaced = toPlace.filter((id) => !layout.nodes[id]);
  if (unplaced.length) return { error: 'layout', ids: unplaced };

  const next = cloneModel(model);
  const view = getView(next, viewId)!;
  const summary: ImportSummary = { newComponents: 0, reused: 0, newNodes: 0, newRelations: 0, skippedRelations: 0, newGroups: 0 };
  const componentOf = new Map<string, string>();

  // 그룹: 새 노드를 하나라도 담는 subgraph만 만든다 (재사용한 기존 노드는 옮기지 않는다)
  const groupNodeId = new Map<string, string>();
  for (const g of preview.groups) {
    const box = layout.groups[g.id];
    if (!box || !g.members.some((m) => toPlace.includes(m) && layout.nodes[m]?.parentGroup === g.id)) continue;
    const id = newId('nd');
    view.nodes.push({ id, kind: 'group', label: g.label.slice(0, 120) || 'Boundary', position: round(box), width: Math.max(GROUP_MIN_SIZE, Math.round(box.width)), height: Math.max(GROUP_MIN_SIZE, Math.round(box.height)) });
    groupNodeId.set(g.id, id);
    summary.newGroups++;
  }

  for (const n of preview.nodes) {
    const choice = choices[n.mermaidId];
    let componentId = choice.reuse ?? null;
    if (componentId) {
      summary.reused++;
    } else {
      const def = registry?.types[choice.type];
      const type = def && def.nodeKind === 'component' ? choice.type : 'service';
      componentId = newId('cmp');
      next.components[componentId] = {
        id: componentId, type, layer: registry?.types[type]?.layer ?? 'logical', name: n.label.slice(0, 120) || n.mermaidId,
        properties: defaultProperties(registry, type), requirementIds: [], decisionIds: [],
      };
      summary.newComponents++;
    }
    componentOf.set(n.mermaidId, componentId);
    if (toPlace.includes(n.mermaidId)) {
      const pos = layout.nodes[n.mermaidId];
      const parentId = pos.parentGroup ? groupNodeId.get(pos.parentGroup) : undefined;
      view.nodes.push({ id: newId('nd'), kind: 'component', componentId, position: round(pos), ...(parentId ? { parentId } : {}) });
      summary.newNodes++;
    }
  }

  const seen = new Set(Object.values(next.relations).map(relationKey));
  for (const e of preview.edges) {
    const from = componentOf.get(e.from), to = componentOf.get(e.to);
    if (!from || !to || from === to) { summary.skippedRelations++; continue; }
    const rel: Relation = { id: newId('rel'), type: 'calls', from, to, mode: e.mode, requirementIds: [] };
    if (e.protocol) rel.protocol = e.protocol as Relation['protocol'];
    if (e.label) rel.label = e.label.slice(0, 500);
    const key = relationKey(rel);
    if (seen.has(key)) { summary.skippedRelations++; continue; }
    seen.add(key);
    next.relations[rel.id] = rel;
    view.edges.push({ id: newId('ed'), relationId: rel.id });
    summary.newRelations++;
  }
  return { model: next, summary };
}

// ── 배치안 (Sprint 7 · 03 V13 · 04 §6.10) ─────────────────────────────────
export const MAX_DEPLOYMENT_VIEWS = 5;
export const VARIANT_MAX = 60;
export const STRATEGY_MAX_BYTES = 64 * 1024;
export const STRATEGY_TEMPLATE = [
  '## 배포 경로', '', '- ', '',
  '## 환경과 승인', '', '- 운영 배포 승인: ', '',
  '## 릴리스 방식과 이유', '', '- ', '',
  '## 성공·중단 기준', '', '- ', '',
  '## 롤백과 DB 변경', '', '- ', '',
].join('\n');

export const deploymentViews = (model: ArchitectureModel) => model.views.filter((v) => v.kind === 'deployment');

/** 배치안 이름 검사. 문제가 없으면 undefined */
export function variantError(model: ArchitectureModel, name: string, exceptViewId?: string): string | undefined {
  return variantErrorFor(deploymentViews(model), name, exceptViewId);
}

function variantErrorFor(views: View[], name: string, exceptViewId?: string): string | undefined {
  const n = name.trim();
  if (!n || n.length > VARIANT_MAX) return `배치안 이름은 1~${VARIANT_MAX}자여야 합니다.`;
  if (views.some((v) => v.id !== exceptViewId && (v.variant ?? '').trim() === n)) return '같은 이름의 배치안이 있습니다.';
  return undefined;
}

const newViewId = (newId: NewId) => newId('view').replace(/^view_/, 'view_dep_');

/** 빈 배치안 추가 (전략은 템플릿으로 시작) */
export function addDeploymentView(model: ArchitectureModel, variant: string, newId: NewId): { model: ArchitectureModel; viewId: string | null; error?: string } {
  if (deploymentViews(model).length >= MAX_DEPLOYMENT_VIEWS) return { model, viewId: null, error: `배치안은 최대 ${MAX_DEPLOYMENT_VIEWS}개입니다.` };
  const error = variantError(model, variant);
  if (error) return { model, viewId: null, error };
  const next = cloneModel(model);
  const viewId = newViewId(newId);
  next.views.push({ id: viewId, kind: 'deployment', name: 'Deployment', variant: variant.trim(), nodes: [], edges: [], strategyMd: STRATEGY_TEMPLATE });
  return { model: next, viewId };
}

export type InfrastructureViewKind = 'aws' | 'kubernetes';

export function addInfrastructureView(model: ArchitectureModel, kind: InfrastructureViewKind, variant: string, newId: NewId): ReturnType<typeof addDeploymentView> {
  const views = model.views.filter((v) => v.kind === kind);
  const limit = kind === 'aws' ? 3 : 5;
  const error = views.length >= limit ? `View는 최대 ${limit}개입니다.` : variantErrorFor(views, variant);
  if (error) return { model, viewId: null, error };
  const next = cloneModel(model);
  const viewId = newId('view').replace(/^view_/, kind === 'aws' ? 'view_aws_' : 'view_k8s_');
  next.views.push({ id: viewId, kind, name: kind === 'aws' ? 'AWS' : 'Kubernetes', variant: variant.trim(), nodes: [], edges: [] });
  return { model: next, viewId };
}

export function renameDeploymentView(model: ArchitectureModel, viewId: string, variant: string): { model: ArchitectureModel; error?: string } {
  const v = getView(model, viewId);
  if (!v || !['deployment', 'aws', 'kubernetes'].includes(v.kind)) return { model, error: 'View를 찾을 수 없습니다.' };
  const error = variantErrorFor(model.views.filter((view) => view.kind === v.kind), variant, viewId);
  if (error) return { model, error };
  if (v.variant === variant.trim()) return { model };
  return { model: withView(model, viewId, (_m, vv) => { vv.variant = variant.trim(); }) };
}

/** Sprint 11: 구조화 전략 설정·삭제(null). deployment·aws 배치안만. 같은 값이면 입력 모델 그대로 */
export function setStructuredStrategy(model: ArchitectureModel, viewId: string, strategy: DeploymentStrategy | null): ArchitectureModel {
  return withView(model, viewId, (_m, v) => {
    if (v.kind !== 'deployment' && v.kind !== 'aws') return false;
    if (JSON.stringify(v.strategy ?? null) === JSON.stringify(strategy)) return false;
    if (strategy) v.strategy = structuredClone(strategy); else delete v.strategy;
  });
}

export function setStrategy(model: ArchitectureModel, viewId: string, strategyMd: string): ArchitectureModel {
  return withView(model, viewId, (_m, v) => {
    if (v.kind !== 'deployment' || (v.strategyMd ?? '') === strategyMd) return false;
    if (strategyMd) v.strategyMd = strategyMd; else delete v.strategyMd;
  });
}

/** 배치안 전용 컴포넌트: 이 View에 노드가 있고, 다른 View에는 노드가 없는 deployment 레이어 컴포넌트 */
function ownComponents(model: ArchitectureModel, viewId: string): Set<string> {
  const v = getView(model, viewId)!;
  const ids = new Set<string>();
  for (const n of v.nodes) {
    const c = n.componentId ? model.components[n.componentId] : undefined;
    if (!c || !layerOf(v.kind).includes(c.layer)) continue;
    if (model.views.some((o) => o.id !== viewId && o.nodes.some((x) => x.componentId === c.id))) continue;
    ids.add(c.id);
  }
  return ids;
}

/**
 * 배치안 복제: deployment 컴포넌트·노드·관계·엣지를 새 id로 복사하고 parentId·관계 끝점을 다시 연결한다.
 * Logical 컴포넌트(realizes의 대상)는 공유. 결과 모델 크기는 호출 쪽이 V8로 검사한다(modelByteSize).
 */
export function duplicateDeploymentView(model: ArchitectureModel, viewId: string, variant: string, newId: NewId) {
  return duplicatePlacementView(model, viewId, variant, newId, 'deployment');
}

export function duplicateAwsView(model: ArchitectureModel, viewId: string, variant: string, newId: NewId) {
  return duplicatePlacementView(model, viewId, variant, newId, 'aws');
}

function duplicatePlacementView(model: ArchitectureModel, viewId: string, variant: string, newId: NewId, kind: 'deployment' | 'aws'): { model: ArchitectureModel; viewId: string | null; error?: string } {
  const src = getView(model, viewId);
  if (!src || src.kind !== kind) return { model, viewId: null, error: '배치안을 찾을 수 없습니다.' };
  const maxViews = kind === 'aws' ? 3 : MAX_DEPLOYMENT_VIEWS;
  const views = model.views.filter((view) => view.kind === kind);
  if (views.length >= maxViews) return { model, viewId: null, error: `배치안은 최대 ${maxViews}개입니다.` };
  const error = variantErrorFor(views, variant);
  if (error) return { model, viewId: null, error };
  const next = cloneModel(model);
  const compMap = new Map<string, string>();
  for (const n of src.nodes) {
    const c = n.componentId ? next.components[n.componentId] : undefined;
    if (!c || !layerOf(src.kind).includes(c.layer) || compMap.has(c.id)) continue;
    const copy = structuredClone(c);
    copy.id = newId('cmp');
    next.components[copy.id] = copy;
    compMap.set(c.id, copy.id);
  }
  const relMap = new Map<string, string>();
  for (const r of Object.values(model.relations)) {
    const from = compMap.get(r.from) ?? null;
    const to = compMap.get(r.to) ?? null;
    if (!from && !to) continue;                                      // 이 배치안과 무관
    // 배치안 밖으로 이어진 호출선은 복사하지 않는다. Sprint 11: 이 배치안에 참조 노드로 놓인 공유 컴포넌트(예: Logical 조회 API)와 잇는 관계는 복사
    const shownHere = (cid: string) => src.nodes.some((n) => n.componentId === cid);
    if (r.type !== 'realizes' && (!(from || shownHere(r.from)) || !(to || shownHere(r.to)))) continue;
    const copy = structuredClone(r);
    copy.id = newId('rel');
    copy.from = from ?? r.from;
    copy.to = to ?? r.to;                                             // realizes의 Logical 끝점은 그대로
    next.relations[copy.id] = copy;
    relMap.set(r.id, copy.id);
  }
  const nodeMap = new Map(src.nodes.map((n) => [n.id, newId('nd')]));
  const newViewIdValue = src.kind === 'aws' ? newId('view').replace(/^view_/, 'view_aws_') : newViewId(newId);
  next.views.push({
    id: newViewIdValue, kind: src.kind, name: src.name, variant: variant.trim(),
    ...(src.strategyMd ? { strategyMd: src.strategyMd } : {}),
    ...(src.strategy ? { strategy: structuredClone(src.strategy) } : {}),   // Sprint 11: 복귀 대상은 원본과 같게
    nodes: src.nodes.map((n) => {
      const copy: ViewNode = structuredClone(n);
      copy.id = nodeMap.get(n.id)!;
      if (n.parentId) copy.parentId = nodeMap.get(n.parentId);
      if (n.componentId) copy.componentId = compMap.get(n.componentId) ?? n.componentId;
      return copy;
    }),
    edges: src.edges.filter((e) => relMap.has(e.relationId)).map((e) => ({ ...structuredClone(e), id: newId('ed'), relationId: relMap.get(e.relationId)! })),
  });
  return { model: next, viewId: newViewIdValue };
}

/** 배치안 삭제: View와, 다른 View에서 쓰지 않는 deployment 컴포넌트·그 관계(realizes 포함)를 지운다 */
export function removeDeploymentView(model: ArchitectureModel, viewId: string): ArchitectureModel {
  return removePlacementView(model, viewId, 'deployment');
}

export function removeAwsView(model: ArchitectureModel, viewId: string): ArchitectureModel {
  return removePlacementView(model, viewId, 'aws');
}

export function removeKubernetesView(model: ArchitectureModel, viewId: string): ArchitectureModel {
  return removePlacementView(model, viewId, 'kubernetes');
}

function removePlacementView(model: ArchitectureModel, viewId: string, kind: 'deployment' | 'aws' | 'kubernetes'): ArchitectureModel {
  const v = getView(model, viewId);
  if (!v || v.kind !== kind) return model;
  const own = ownComponents(model, viewId);
  const next = cloneModel(model);
  next.views = next.views.filter((x) => x.id !== viewId);
  for (const id of own) deleteComponent(next, id);
  clearFallbackTarget(next, viewId);   // Sprint 11 (C2): 복귀 대상만 비우고 정책 문구는 남긴다
  pruneOrphanOpsRelations(next);
  return next;
}

/** 이 배치안을 VM 복귀 대상으로 쓰는 전략 수 (삭제 확인 창 안내) */
export function fallbackReferrers(model: ArchitectureModel, viewId: string): string[] {
  return model.views.filter((v) => v.strategy?.fallback?.targetViewId === viewId).map((v) => v.variant ?? v.name);
}

function clearFallbackTarget(m: ArchitectureModel, viewId: string) {
  for (const v of m.views) if (v.strategy?.fallback?.targetViewId === viewId) delete v.strategy.fallback.targetViewId;
}

/**
 * 불러올 때 한 번에 하는 정리 (Sprint 10 clusterRef + Sprint 11 C2·V17). 입력 모델은 그대로.
 * detached = 끊긴 EKS 연결, fallbackCleared = 끊긴 VM 복귀 대상, opsRemoved = 표시 엣지 없는 운영 설계 관계
 */
export function repairOnLoad(model: ArchitectureModel): { model: ArchitectureModel; detached: number; fallbackCleared: number; opsRemoved: number } {
  const clusters = repairClusterRefs(model);
  const fallback = repairFallbackTargets(clusters.model);
  const opsRels = repairOpsRelations(fallback.model);
  return { model: opsRels.model, detached: clusters.detached, fallbackCleared: fallback.cleared, opsRemoved: opsRels.removed };
}

/** Draft 복구용: 없는 배치안이나 deployment가 아닌 View를 가리키는 복귀 대상을 비운다 (C2). 입력 모델은 그대로 */
export function repairFallbackTargets(model: ArchitectureModel): { model: ArchitectureModel; cleared: number } {
  const ok = new Set(model.views.filter((v) => v.kind === 'deployment').map((v) => v.id));
  const broken = model.views.filter((v) => v.strategy?.fallback?.targetViewId !== undefined && !ok.has(v.strategy.fallback.targetViewId));
  if (!broken.length) return { model, cleared: 0 };
  const next = cloneModel(model);
  for (const v of next.views) if (v.strategy?.fallback?.targetViewId !== undefined && !ok.has(v.strategy.fallback.targetViewId)) delete v.strategy.fallback.targetViewId;
  return { model: next, cleared: broken.length };
}

/** 삭제 확인 창용 요약 */
export function deploymentViewSummary(model: ArchitectureModel, viewId: string) {
  const v = getView(model, viewId);
  if (!v) return null;
  const own = ownComponents(model, viewId);
  const comps = v.nodes.map((n) => (n.componentId ? model.components[n.componentId] : undefined)).filter((c): c is Component => Boolean(c));
  const implementers = comps.filter((c) => Object.values(model.relations).some((r) => r.type === 'realizes' && r.from === c.id));
  const realized = new Set(Object.values(model.relations).filter((r) => r.type === 'realizes' && own.has(r.from)).map((r) => r.to));
  return {
    variant: v.variant ?? '',
    components: comps.length,
    ownComponents: own.size,
    relations: Object.values(model.relations).filter((r) => own.has(r.from) || own.has(r.to)).length,
    implementers: implementers.length,
    realizedLogical: realized.size,
    unrealizedLogical: Object.values(model.components).filter((c) => c.layer === 'logical' && !realized.has(c.id)).map((c) => c.name),
  };
}

// ── realizes (Sprint 7 · 03 V2) ─────────────────────────────────────────
/** 구현체(registry realizes) → Logical 컴포넌트. on=false면 해제. 거부되면 입력 모델 그대로 */
export function setRealizes(model: ArchitectureModel, registry: TypeRegistry | null, fromId: string, toId: string, on: boolean, newId: NewId): ArchitectureModel {
  const from = model.components[fromId], to = model.components[toId];
  if (!from || !to) return model;
  const existing = Object.values(model.relations).find((r) => r.type === 'realizes' && r.from === fromId && r.to === toId);
  if (!on) {
    if (!existing) return model;
    const next = cloneModel(model);
    delete next.relations[existing.id];
    return next;
  }
  if (existing || !registry?.types[from.type]?.realizes || to.layer !== 'logical') return model;
  const next = cloneModel(model);
  const id = newId('rel');
  next.relations[id] = { id, type: 'realizes', from: fromId, to: toId, requirementIds: [] };
  return next;
}

/** 구현체가 구현하는 Logical 컴포넌트 id 목록 */
export const realizesTargets = (model: ArchitectureModel, componentId: string) =>
  Object.values(model.relations).filter((r) => r.type === 'realizes' && r.from === componentId).map((r) => r.to);

export function eksPlacements(model: ArchitectureModel) {
  return model.views.flatMap((view) => view.kind !== 'aws' ? [] : view.nodes.flatMap((node) => {
    const c = node.componentId ? model.components[node.componentId] : undefined;
    return c?.type === 'aws.eks' ? [{
      componentId: c.id, name: c.name, viewId: view.id, nodeId: node.id, variant: view.variant ?? view.name,
    }] : [];
  }));
}

/** Draft 복구용. 발행 버전 조회에서는 원본 모델을 그대로 사용한다. */
export function repairClusterRefs(model: ArchitectureModel): { model: ArchitectureModel; detached: number } {
  const placements = new Map<string, number>();
  for (const placement of eksPlacements(model)) {
    placements.set(placement.componentId, (placements.get(placement.componentId) ?? 0) + 1);
  }
  const linked = new Set<string>();
  let detached = 0;
  const views = model.views.map((view) => {
    if (view.clusterRef === undefined) return view;
    if (view.kind === 'kubernetes' && placements.get(view.clusterRef) === 1 && !linked.has(view.clusterRef)) {
      linked.add(view.clusterRef);
      return view;
    }
    const repaired = { ...view };
    delete repaired.clusterRef;
    detached++;
    return repaired;
  });
  return { model: detached ? { ...model, views } : model, detached };
}

export function setClusterRef(model: ArchitectureModel, viewId: string, clusterId?: string): ArchitectureModel {
  return withView(model, viewId, (_model, view) => {
    if (view.kind !== 'kubernetes' || view.clusterRef === clusterId) return false;
    if (!clusterId) { delete view.clusterRef; return; }
    if (eksPlacements(model).filter((p) => p.componentId === clusterId).length !== 1
        || model.views.some((other) => other.id !== viewId && other.clusterRef === clusterId)) return false;
    view.clusterRef = clusterId;
  });
}

export type RunLocation = { viewId: string; variant: string; nodeId: string; implementer: string; container: string | null; instances: number | null };

/** Logical 컴포넌트의 배치안별 실행 위치 (04 §6.10: "현재 · PaaS → Railway / backend (node) ×1") */
export function runLocations(model: ArchitectureModel, logicalId: string): RunLocation[] {
  const out: RunLocation[] = [];
  const impls = Object.values(model.relations).filter((r) => r.type === 'realizes' && r.to === logicalId).map((r) => r.from);
  const clusters = new Map(eksPlacements(model).map((p) => [p.componentId, p]));
  for (const v of model.views) {
    if (!['deployment', 'aws', 'kubernetes'].includes(v.kind)) continue;
    const cluster = v.clusterRef ? clusters.get(v.clusterRef) : undefined;
    const byId = new Map(v.nodes.map((n) => [n.id, n]));
    for (const n of v.nodes) {
      if (!n.componentId || !impls.includes(n.componentId)) continue;
      const c = model.components[n.componentId];
      let parent = n.parentId ? byId.get(n.parentId) : undefined;
      // 가장 가까운 컨테이너 컴포넌트(VM·플랫폼 등)의 이름
      while (parent && !parent.componentId) parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      if (!c) continue;
      const count = v.kind === 'kubernetes' ? c.properties?.replicas : c.properties?.instances;
      const instances = typeof count === 'number' ? count : null;
      out.push({ viewId: v.id, variant: cluster ? [cluster.variant, cluster.name, v.variant ?? v.name].join(' → ') : v.variant ?? v.name, nodeId: n.id, implementer: c.name, container: parent?.componentId ? model.components[parent.componentId]?.name ?? null : null, instances });
    }
  }
  return out;
}
