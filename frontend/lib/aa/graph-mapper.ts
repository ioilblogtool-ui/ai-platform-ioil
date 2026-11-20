// 도메인 모델 ↔ React Flow nodes/edges 변환 (02 §3.1)
// 진실의 원천은 도메인 모델이고, React Flow 상태는 표현 계층이다.
// 런타임 import 없음 (type만) — Node 테스트에서 바로 불러온다.
import type { Edge, Node } from '@xyflow/react';
import type { ArchitectureModel, Component, Relation, View, ViewNode } from './architecture-types';

export type ComponentNodeData = {
  componentId: string;
  name: string;
  type: string;
  technology?: string;
};
export type GroupNodeData = { label: string };
export type NoteNodeData = { text: string };

export type AaComponentFlowNode = Node<ComponentNodeData, 'component'>;
export type AaGroupFlowNode = Node<GroupNodeData, 'group'>;
export type AaNoteFlowNode = Node<NoteNodeData, 'note'>;
export type AaFlowNode = AaComponentFlowNode | AaGroupFlowNode | AaNoteFlowNode;

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
  return nodes
    .map((n, i) => ({ n, i, d: depthOf(n) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.n);
}

/** 한 View의 노드·엣지를 React Flow 형태로 */
export function toFlow(model: ArchitectureModel, viewId: string, selectedNodeIds: Set<string> = new Set()): { nodes: AaFlowNode[]; edges: Edge[] } {
  const view = getView(model, viewId);
  if (!view) return { nodes: [], edges: [] };

  const groupIds = new Set(view.nodes.filter((n) => n.kind === 'group').map((n) => n.id));
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
      nodes.push({ ...base, type: 'component', data: { componentId: c.id, name: c.name, type: c.type, technology: c.technology } });
    } else if (n.kind === 'group') {
      nodes.push({
        ...base, type: 'group', data: { label: n.label ?? '' },
        width: n.width, height: n.height, style: { width: n.width, height: n.height },
      });
    } else if (n.kind === 'note') {
      nodes.push({ ...base, type: 'note', data: { text: n.text ?? '' } });
    }
  }

  const nodeByComponent = new Map(view.nodes.filter((n) => n.componentId).map((n) => [n.componentId!, n.id]));
  const edges: Edge[] = view.edges
    .map((e) => {
      const r: Relation | undefined = model.relations[e.relationId];
      if (!r) return null;
      const source = nodeByComponent.get(r.from);
      const target = nodeByComponent.get(r.to);
      if (!source || !target) return null;
      const label = [r.protocol, r.label].filter(Boolean).join(' · ') || undefined;
      return {
        id: e.id, source, target, label,
        sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
        style: r.mode === 'async' ? { strokeDasharray: '6 4' } : undefined,
      } as Edge;
    })
    .filter((e): e is Edge => e !== null);

  return { nodes, edges };
}
