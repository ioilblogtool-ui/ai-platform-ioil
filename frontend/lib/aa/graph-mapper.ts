// 도메인 모델 ↔ React Flow nodes/edges 변환 (02 §3.1)
// 진실의 원천은 도메인 모델이고, React Flow 상태는 표현 계층이다.
import type { Edge, Node } from '@xyflow/react';
import type { ArchitectureModel, Component, Relation, View } from './architecture-types';

export type ComponentNodeData = {
  componentId: string;
  name: string;
  type: string;
  technology?: string;
};

export type AaFlowNode = Node<ComponentNodeData, 'component'>;

export function getView(model: ArchitectureModel, viewId: string): View | undefined {
  return model.views.find((v) => v.id === viewId);
}

/** 한 View의 노드·엣지를 React Flow 형태로 */
export function toFlow(model: ArchitectureModel, viewId: string, selectedNodeIds: Set<string> = new Set()): { nodes: AaFlowNode[]; edges: Edge[] } {
  const view = getView(model, viewId);
  if (!view) return { nodes: [], edges: [] };

  const nodes: AaFlowNode[] = view.nodes
    .filter((n) => n.kind === 'component' && n.componentId && model.components[n.componentId])
    .map((n) => {
      const c: Component = model.components[n.componentId!];
      return {
        id: n.id,
        type: 'component',
        position: { x: n.position.x, y: n.position.y },
        selected: selectedNodeIds.has(n.id),
        data: { componentId: c.id, name: c.name, type: c.type, technology: c.technology },
      };
    });

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
