// 도메인 모델 ↔ React Flow nodes/edges 변환 (02 §3.1)
// 진실의 원천은 도메인 모델이고, React Flow 상태는 표현 계층이다.
// 런타임 import 없음 (type만) — Node 테스트에서 바로 불러온다.
import type { Edge, Node } from '@xyflow/react';
import type { ArchitectureModel, Component, Relation, View, ViewNode } from './architecture-types';
import type { EdgeMark } from './boundary';

export type ComponentNodeData = {
  componentId: string;
  name: string;
  type: string;
  technology?: string;
  multiAz?: boolean;
  /** V11 경고 (Sprint 7): 배치안의 Process가 VM·Platform 밖에 있음 */
  warning?: string;
  /** Sprint 8 (VIEW-05): 이 컴포넌트가 놓인 View 수가 2 이상이면 그 수 (⧉ 표시) */
  sharedViews?: number;
  /** Sprint 8 (FLW-06): 흐름 강조 중 참여가 아닌 노드 */
  dimmed?: boolean;
};
/** 배치안의 컨테이너 컴포넌트(환경·구역·플랫폼·VM) — 크기를 가진 component 노드 (Sprint 7) */
export type ContainerNodeData = ComponentNodeData & { trust?: string; tier?: string; summary?: string };
export type GroupNodeData = { label: string };
export type NoteNodeData = { text: string };

export type AaComponentFlowNode = Node<ComponentNodeData, 'component'>;
export type AaGroupFlowNode = Node<GroupNodeData, 'group'>;
export type AaNoteFlowNode = Node<NoteNodeData, 'note'>;
export type AaContainerFlowNode = Node<ContainerNodeData, 'container'>;
export type AaFlowNode = AaComponentFlowNode | AaGroupFlowNode | AaNoteFlowNode | AaContainerFlowNode;

/** 크기를 가진 노드 = 부모가 될 수 있는 노드 (group, 컨테이너 컴포넌트) */
const isBox = (n: ViewNode) => n.kind === 'group' || (n.kind === 'component' && n.width !== undefined && n.height !== undefined);

export type RelationEdgeData = {
  relationId: string; protocol?: string; label?: string; mode?: 'sync' | 'async';
  /** Sprint 8: 운영·보안 속성 전체(툴팁) + 경계·데이터 표시 */
  relation?: Relation;
  mark?: EdgeMark;
  /** Sprint 8 (FLW-06): 흐름 강조 중 강조 대상이 아닌 엣지 */
  dimmed?: boolean;
};
export type AaFlowEdge = Edge<RelationEdgeData, 'relation'>;

export function getView(model: ArchitectureModel, viewId: string): View | undefined {
  return model.views.find((v) => v.id === viewId);
}

/**
 * 부모가 항상 자식보다 먼저 오도록 정렬 (React Flow sub-flow 요구사항, 중첩 포함).
 * 저장 순서는 바꾸지 않고, 같은 깊이 안에서는 원래 순서를 지킨다. 부모가 없거나 순환이면 최상위로 취급.
 */
export function sortParentsFirst(nodes: ViewNode[]): ViewNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const depthOf = (n: ViewNode): number => {
    if (depth.has(n.id)) return depth.get(n.id)!;
    const seen = new Set<string>([n.id]);
    let d = 0;
    let cur = n.parentId ? byId.get(n.parentId) : undefined;
    while (cur && !seen.has(cur.id)) { d++; seen.add(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    depth.set(n.id, d);
    return d;
  };
  // 같은 깊이에서는 그룹을 먼저 둔다 — React Flow는 배열 뒤쪽을 위에 그리므로, 나중에 만든 그룹이
  // 이미 있던 노드를 덮어 클릭·드래그를 가로채지 않게 한다 (Sprint 2 Step 4 발견)
  const groupFirst = (n: ViewNode) => (isBox(n) ? 0 : 1);
  return nodes
    .map((n, i) => ({ n, i, d: depthOf(n) }))
    .sort((a, b) => a.d - b.d || groupFirst(a.n) - groupFirst(b.n) || a.i - b.i)
    .map((x) => x.n);
}

/** 한 View의 노드·엣지를 React Flow 형태로 */
export function toFlow(
  model: ArchitectureModel, viewId: string, selectedNodeIds: Set<string> = new Set(), warnings: Map<string, string> = new Map(),
  marks: Map<string, EdgeMark> = new Map(),
  highlight: { componentIds: Set<string>; relationIds: Set<string> } | null = null,
): { nodes: AaFlowNode[]; edges: AaFlowEdge[] } {
  const view = getView(model, viewId);
  if (!view) return { nodes: [], edges: [] };

  const groupIds = new Set(view.nodes.filter(isBox).map((n) => n.id));
  const viewCount = new Map<string, number>();
  for (const vv of model.views) for (const cid of new Set(vv.nodes.map((n) => n.componentId).filter(Boolean) as string[])) viewCount.set(cid, (viewCount.get(cid) ?? 0) + 1);
  const nodes: AaFlowNode[] = [];
  for (const n of sortParentsFirst(view.nodes)) {
    const base = {
      id: n.id,
      position: { x: n.position.x, y: n.position.y },
      selected: selectedNodeIds.has(n.id),
      ...(n.parentId && groupIds.has(n.parentId) ? { parentId: n.parentId } : {}),
    };
    if (n.kind === 'component') {
      const c: Component | undefined = n.componentId ? model.components[n.componentId] : undefined;
      if (!c) continue;
      const shared = viewCount.get(c.id) ?? 0;
      const dim = highlight && !highlight.componentIds.has(c.id) ? { dimmed: true } : {};
      const data = { componentId: c.id, name: c.name, type: c.type, technology: c.technology, ...(c.type === 'aws.rds' && c.properties?.multiAz === true ? { multiAz: true } : {}), ...(warnings.has(n.id) ? { warning: warnings.get(n.id) } : {}), ...(shared > 1 ? { sharedViews: shared } : {}), ...dim };
      if (isBox(n)) {
        const trust = typeof c.properties?.trust === 'string' ? (c.properties.trust as string) : undefined;
        nodes.push({
          ...base, type: 'container', data: { ...data, ...(trust ? { trust } : {}), tier: typeof c.properties?.tier === 'string' ? c.properties.tier : undefined },
          width: n.width, height: n.height,
          style: { width: n.width, height: n.height, padding: 0, background: 'transparent', borderStyle: 'none', borderRadius: 10, boxShadow: 'none' },
        });
      } else {
        nodes.push({ ...base, type: 'component', data });
      }
    } else if (n.kind === 'group') {
      nodes.push({
        ...base, type: 'group', data: { label: n.label ?? '' },
        width: n.width, height: n.height,
        // React Flow 기본 .react-flow__node-group 스타일(패딩·테두리·배경)을 끄고 GroupNode가 그린다
        style: { width: n.width, height: n.height, padding: 0, background: 'transparent', borderStyle: 'none', borderRadius: 10, boxShadow: 'none' },
      });
    } else if (n.kind === 'note') {
      nodes.push({ ...base, type: 'note', data: { text: n.text ?? '' } });
    }
  }

  const nodeByComponent = new Map(view.nodes.filter((n) => n.componentId).map((n) => [n.componentId!, n.id]));
  const edges: AaFlowEdge[] = view.edges
    .map((e) => {
      const r: Relation | undefined = model.relations[e.relationId];
      if (!r) return null;
      const source = nodeByComponent.get(r.from);
      const target = nodeByComponent.get(r.to);
      if (!source || !target) return null;
      const edge: AaFlowEdge = {
        id: e.id, source, target, type: 'relation',
        sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
        data: { relationId: r.id, protocol: r.protocol, label: r.label, mode: r.mode, relation: r, ...(marks.has(r.id) ? { mark: marks.get(r.id) } : {}), ...(highlight && !highlight.relationIds.has(r.id) ? { dimmed: true } : {}) },
      };
      return edge;
    })
    .filter((e): e is AaFlowEdge => e !== null);

  return { nodes, edges };
}
