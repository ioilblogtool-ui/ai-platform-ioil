// Project Overview (Sprint 3 Step 4) 순수 계산. React·네트워크 import 없음 — node --test로 바로 검증한다.
// 미니 캔버스는 모델을 읽기만 한다. 입력 모델을 바꾸지 않는다.
// 다른 lib 모듈을 런타임 import하지 않는다 (node --test가 확장자 없는 .ts import를 풀지 못함).
import type { ArchitectureModel, Requirement, View } from './architecture-types';

// model-ops.absolutePosition과 같은 규칙: parentId를 따라 상대 좌표를 더한다 (순환은 한 번만)
function absolutePosition(view: View, nodeId: string) {
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

// Studio 노드 크기와 맞춘 근사치 (ComponentNode 168×56, NoteNode 200×64)
const SIZE = { component: { w: 168, h: 56 }, note: { w: 200, h: 64 } } as const;
const PAD = 24;

export type MiniBox = { id: string; kind: 'component' | 'group' | 'note'; x: number; y: number; w: number; h: number; label: string; sub?: string };
export type MiniLine = { id: string; x1: number; y1: number; x2: number; y2: number; label?: string };
export type MiniCanvas = { boxes: MiniBox[]; lines: MiniLine[]; viewBox: { x: number; y: number; w: number; h: number } };

/** Logical View를 읽기 전용 SVG로 그릴 좌표. 노드가 없으면 null */
export function miniCanvasLayout(model: ArchitectureModel | null | undefined, viewId = 'view_logical'): MiniCanvas | null {
  const view = model?.views.find((entry) => entry.id === viewId);
  if (!model || !view || !view.nodes.length) return null;

  const boxes: MiniBox[] = [];
  const byComponent = new Map<string, MiniBox>();
  for (const node of view.nodes) {
    const { x, y } = absolutePosition(view, node.id);
    if (node.kind === 'group') {
      boxes.push({ id: node.id, kind: 'group', x, y, w: node.width ?? 360, h: node.height ?? 240, label: node.label || 'Boundary' });
    } else if (node.kind === 'note') {
      boxes.push({ id: node.id, kind: 'note', x, y, ...SIZE.note, label: (node.text ?? '').split('\n')[0].slice(0, 40) });
    } else {
      const component = node.componentId ? model.components[node.componentId] : undefined;
      if (!component) continue;
      // 배치안의 컨테이너(환경·구역·플랫폼·VM)는 크기가 있는 상자 → 그룹처럼 그린다
      const box: MiniBox = node.width && node.height
        ? { id: node.id, kind: 'group', x, y, w: node.width, h: node.height, label: component.name }
        : { id: node.id, kind: 'component', x, y, ...SIZE.component, label: component.name, sub: component.technology || component.type };
      boxes.push(box);
      byComponent.set(component.id, box);
    }
  }
  // 그룹을 먼저 그려 다른 노드 아래에 깔리게 한다
  boxes.sort((a, b) => Number(b.kind === 'group') - Number(a.kind === 'group'));

  const lines: MiniLine[] = [];
  for (const edge of view.edges) {
    const relation = model.relations[edge.relationId];
    const from = relation && byComponent.get(relation.from);
    const to = relation && byComponent.get(relation.to);
    if (!from || !to) continue;
    lines.push({ id: edge.id, x1: from.x + from.w, y1: from.y + from.h / 2, x2: to.x, y2: to.y + to.h / 2, label: relation.protocol });
  }

  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b.x)) - PAD;
  const minY = Math.min(...boxes.map((b) => b.y)) - PAD;
  const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + PAD;
  const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + PAD;
  return { boxes, lines, viewBox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

/** 활성 NFR 중 Draft의 어느 컴포넌트·관계에도 연결되지 않은 개수 */
export function unmappedNfrCount(model: ArchitectureModel | null | undefined, requirements: Requirement[]): number {
  const linked = new Set<string>();
  for (const item of [...Object.values(model?.components ?? {}), ...Object.values(model?.relations ?? {})]) {
    if (Array.isArray(item.requirementIds)) item.requirementIds.forEach((id) => linked.add(id.toLowerCase()));
  }
  return requirements.filter((entry) => entry.kind === 'nfr' && entry.status === 'active' && !linked.has(entry.id.toLowerCase())).length;
}
