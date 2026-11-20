// 도메인 모델 순수 연산 (Sprint 2 Step 2). React·네트워크·런타임 import 없음 — Node type stripping으로 바로 테스트한다.
// 모든 함수는 입력 모델을 바꾸지 않고 새 모델을 돌려준다. 바꿀 것이 없거나 거부되면 입력 모델을 그대로 돌려준다.
//
// 좌표 기준: parentId가 있으면 position은 부모 그룹 좌상단 기준 상대 좌표, 없으면 캔버스 절대 좌표 (React Flow sub-flow와 같음).
import type { ArchitectureModel, Component, PropertyDef, Relation, TypeRegistry, View, ViewNode } from './architecture-types';

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

export function updateRelationField(model: ArchitectureModel, id: string, field: 'protocol' | 'mode' | 'label', value: string): ArchitectureModel {
  const relation = model.relations[id];
  if (!relation || relation.type !== 'calls' || relationFieldError(field, value) || (relation[field] ?? '') === value) return model;
  const updated: Relation = { ...relation, [field]: value };
  if (!value) delete updated[field];
  return { ...model, relations: { ...model.relations, [id]: updated } };
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
    v.nodes.push({ id: nodeId, kind: 'component', componentId, position: round(position) });
  });
  return { model: next, nodeId, componentId };
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
export function canSetParent(model: ArchitectureModel, viewId: string, nodeId: string, parentId: string | null): boolean {
  const v = getView(model, viewId);
  const node = v?.nodes.find((n) => n.id === nodeId);
  if (!v || !node) return false;
  if (parentId === null) return true;
  const parent = v.nodes.find((n) => n.id === parentId);
  if (!parent || parent.kind !== 'group') return false;
  return !isSelfOrDescendant(v, parentId, nodeId);
}

export function setParent(model: ArchitectureModel, viewId: string, nodeId: string, parentId: string | null): ArchitectureModel {
  if (!canSetParent(model, viewId, nodeId, parentId)) return model;
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
export function findDropGroup(model: ArchitectureModel, viewId: string, point: Point, movingNodeId?: string): string | null {
  const v = getView(model, viewId);
  if (!v) return null;
  let best: { id: string; area: number } | null = null;
  for (const g of v.nodes) {
    if (g.kind !== 'group' || !g.width || !g.height) continue;
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
    // 같은 from/to calls 관계가 있으면 재사용 (02 §6.2)
    let rel: Relation | undefined = Object.values(m.relations).find((r) => r.type === 'calls' && r.from === from && r.to === to);
    if (!rel) {
      rel = { id: newId('rel'), type: 'calls', from, to, protocol: 'HTTP', mode: 'sync', requirementIds: [] };
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
 * - deleteComponents=true: 어느 View에도 남지 않는 컴포넌트와 그 관계, 모든 View의 해당 엣지까지 지운다
 * - deleteComponents=false: "노드만 제거" — 컴포넌트·relations는 남는다 (저장 시 V7 경고)
 */
export function removeNodes(
  model: ArchitectureModel, viewId: string, nodeIds: string[], opts: { deleteComponents: boolean },
): ArchitectureModel {
  return withView(model, viewId, (m, v) => {
    const gone = new Set(nodeIds.filter((id) => v.nodes.some((n) => n.id === id)));
    if (!gone.size) return false;
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

    if (opts.deleteComponents) {
      for (const n of removed) {
        if (!n.componentId || !m.components[n.componentId]) continue;
        const stillShown = m.views.some((vv) => vv.nodes.some((x) => x.componentId === n.componentId));
        if (!stillShown) deleteComponent(m, n.componentId);
      }
    }
    pruneEdges(m, v);
  });
}

/** 엣지 제거. deleteRelations=true면 다른 View에서도 쓰지 않는 관계까지 지운다 (Sprint 1 동작) */
export function removeEdges(
  model: ArchitectureModel, viewId: string, edgeIds: string[], opts: { deleteRelations: boolean } = { deleteRelations: true },
): ArchitectureModel {
  return withView(model, viewId, (m, v) => {
    const gone = v.edges.filter((e) => edgeIds.includes(e.id));
    if (!gone.length) return false;
    v.edges = v.edges.filter((e) => !edgeIds.includes(e.id));
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
  const componentIds = nodes
    .filter((n) => n.kind === 'component' && n.componentId)
    .map((n) => n.componentId!)
    .filter((cid) => !model.views.some((vv) => vv.nodes.some((x) => x.componentId === cid && !nodeIds.includes(x.id))));
  const cset = new Set(componentIds);
  const relationCount = Object.values(model.relations).filter((r) => cset.has(r.from) || cset.has(r.to)).length;
  return {
    componentCount: componentIds.length,
    relationCount,
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
    const n = v.nodes.find((x) => x.id === nodeId && x.kind === 'group');
    if (!n) return false;
    n.width = Math.max(GROUP_MIN_SIZE, Math.round(size.width));
    n.height = Math.max(GROUP_MIN_SIZE, Math.round(size.height));
    if (position) n.position = round(position);
  });
}
