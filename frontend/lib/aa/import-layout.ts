// Mermaid 가져오기 자동 배치 (Sprint 4 Step 0·3, D-33·Q6). React·네트워크 import 없음.
// Dagre로 새 노드·그룹을 배치한 뒤, 기존 노드의 경계 상자 아래(여백 80px)로 옮긴다.
// 그룹 안 노드는 그룹 좌상단 기준 상대 좌표로 돌려준다 (React Flow sub-flow·Studio 규칙과 같음).
import dagre from '@dagrejs/dagre';

export const IMPORT_GAP = 80;
export const NODE_SIZE = { component: { width: 168, height: 56 }, note: { width: 200, height: 64 } } as const;
const GROUP_PADDING = 32;
const GROUP_HEADER = 28;
const GROUP_MIN = 80;

export type LayoutInput = {
  direction: 'TB' | 'LR';
  nodes: { id: string; group?: string }[];
  groups: { id: string }[];
  edges: { from: string; to: string }[];
};

export type ExistingNode = {
  id: string;
  kind: 'component' | 'group' | 'note';
  parentId?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
};

export type LayoutResult = {
  nodes: Record<string, { x: number; y: number; parentGroup?: string }>;
  groups: Record<string, { x: number; y: number; width: number; height: number }>;
};

function sizeOf(node: ExistingNode) {
  if (node.kind === 'group') return { width: node.width ?? 360, height: node.height ?? 240 };
  return NODE_SIZE[node.kind === 'note' ? 'note' : 'component'];
}

/** 기존 View 노드의 절대 좌표 경계 상자. 노드가 없으면 null */
export function existingBounds(nodes: ExistingNode[]) {
  if (!nodes.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const abs = (node: ExistingNode) => {
    let x = 0, y = 0;
    const seen = new Set<string>();
    let cur: ExistingNode | undefined = node;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      x += cur.position.x;
      y += cur.position.y;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return { x, y };
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    const { x, y } = abs(node);
    const { width, height } = sizeOf(node);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width); maxY = Math.max(maxY, y + height);
  }
  return { minX, minY, maxX, maxY };
}

/** 새 노드·그룹 배치. 기존 노드가 있으면 그 아래로, 없으면 (40, 40)에서 시작한다 */
export function layoutImport(input: LayoutInput, existing: ExistingNode[]): LayoutResult {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: false });
  g.setGraph({ rankdir: input.direction, nodesep: 48, ranksep: 72, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  const groupIds = new Set(input.groups.map((group) => group.id));
  for (const group of input.groups) g.setNode(`g:${group.id}`, { paddingTop: GROUP_HEADER });
  for (const node of input.nodes) {
    g.setNode(`n:${node.id}`, { ...NODE_SIZE.component });
    if (node.group && groupIds.has(node.group)) g.setParent(`n:${node.id}`, `g:${node.group}`);
  }
  for (const edge of input.edges) {
    if (g.hasNode(`n:${edge.from}`) && g.hasNode(`n:${edge.to}`) && edge.from !== edge.to) g.setEdge(`n:${edge.from}`, `n:${edge.to}`);
  }
  dagre.layout(g);

  // Dagre 좌표는 중심점. 좌상단으로 바꾸고 그룹은 여백을 둔 상자로 다시 계산한다
  const topLeft: Record<string, { x: number; y: number }> = {};
  for (const node of input.nodes) {
    const p = g.node(`n:${node.id}`);
    topLeft[node.id] = { x: p.x - NODE_SIZE.component.width / 2, y: p.y - NODE_SIZE.component.height / 2 };
  }
  const groupBox: LayoutResult['groups'] = {};
  for (const group of input.groups) {
    const members = input.nodes.filter((node) => node.group === group.id);
    if (!members.length) {
      const p = g.node(`g:${group.id}`);
      groupBox[group.id] = { x: (p?.x ?? 0) - GROUP_MIN, y: (p?.y ?? 0) - GROUP_MIN, width: GROUP_MIN * 2, height: GROUP_MIN * 2 };
      continue;
    }
    const xs = members.map((m) => topLeft[m.id].x), ys = members.map((m) => topLeft[m.id].y);
    const minX = Math.min(...xs) - GROUP_PADDING, minY = Math.min(...ys) - GROUP_PADDING - GROUP_HEADER;
    const maxX = Math.max(...xs) + NODE_SIZE.component.width + GROUP_PADDING;
    const maxY = Math.max(...ys) + NODE_SIZE.component.height + GROUP_PADDING;
    groupBox[group.id] = { x: minX, y: minY, width: Math.max(GROUP_MIN, maxX - minX), height: Math.max(GROUP_MIN, maxY - minY) };
  }

  // 새 배치 전체의 좌상단을 기존 경계 아래(또는 40,40)로 옮긴다
  const all = [...Object.values(topLeft), ...Object.values(groupBox)];
  const newMinX = Math.min(...all.map((p) => p.x));
  const newMinY = Math.min(...all.map((p) => p.y));
  const bounds = existingBounds(existing);
  const originX = bounds ? bounds.minX : 40;
  const originY = bounds ? bounds.maxY + IMPORT_GAP : 40;
  const dx = originX - (Number.isFinite(newMinX) ? newMinX : 0);
  const dy = originY - (Number.isFinite(newMinY) ? newMinY : 0);
  const round = (v: number) => Math.round(v);

  const result: LayoutResult = { nodes: {}, groups: {} };
  for (const [id, box] of Object.entries(groupBox)) {
    result.groups[id] = { x: round(box.x + dx), y: round(box.y + dy), width: round(box.width), height: round(box.height) };
  }
  for (const node of input.nodes) {
    const abs = { x: topLeft[node.id].x + dx, y: topLeft[node.id].y + dy };
    const parent = node.group && result.groups[node.group];
    result.nodes[node.id] = parent
      ? { x: round(abs.x - parent.x), y: round(abs.y - parent.y), parentGroup: node.group }
      : { x: round(abs.x), y: round(abs.y) };
  }
  return result;
}
