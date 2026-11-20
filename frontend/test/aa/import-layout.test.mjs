// Sprint 4 Step 0: Dagre 배치 + 기존 노드 아래 이동 + 그룹 상대 좌표
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existingBounds, IMPORT_GAP, layoutImport, NODE_SIZE } from '../../lib/aa/import-layout.ts';

const W = NODE_SIZE.component.width, H = NODE_SIZE.component.height;

function sample20() {
  const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, group: i < 5 ? 'ga' : i < 9 ? 'gb' : undefined }));
  const edges = Array.from({ length: 19 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` }));
  return { direction: 'LR', nodes, groups: [{ id: 'ga' }, { id: 'gb' }], edges };
}

const existing = [
  { id: 'nd_g', kind: 'group', position: { x: 100, y: 50 }, width: 400, height: 200 },
  { id: 'nd_a', kind: 'component', parentId: 'nd_g', position: { x: 20, y: 40 } },
  { id: 'nd_b', kind: 'component', position: { x: 600, y: 300 } },
  { id: 'nd_note', kind: 'note', position: { x: -50, y: 10 } },
];

function absolute(result, id) {
  const n = result.nodes[id];
  const g = n.parentGroup ? result.groups[n.parentGroup] : { x: 0, y: 0 };
  return { x: n.x + g.x, y: n.y + g.y };
}

describe('import layout (Dagre)', () => {
  it('computes existing bounds with group-relative children', () => {
    assert.deepEqual(existingBounds(existing), { minX: -50, minY: 10, maxX: 600 + W, maxY: 300 + H });
    assert.equal(existingBounds([]), null);
  });

  it('places 20 nodes and 2 groups below existing nodes without overlap', () => {
    const result = layoutImport(sample20(), existing);
    const top = 300 + H + IMPORT_GAP;
    const boxes = [
      ...Object.values(result.groups).map((g) => ({ ...g })),
      ...Object.keys(result.nodes).map((id) => ({ ...absolute(result, id), width: W, height: H })),
    ];
    for (const box of boxes) assert.ok(box.y >= top, `box at y=${box.y} must be below ${top}`);
    assert.equal(Math.min(...boxes.map((b) => b.y)), top);
    assert.equal(Math.min(...boxes.map((b) => b.x)), -50);

    // 새 노드끼리 겹치지 않는다
    const ids = Object.keys(result.nodes);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = absolute(result, ids[i]), b = absolute(result, ids[j]);
      const overlap = a.x < b.x + W && b.x < a.x + W && a.y < b.y + H && b.y < a.y + H;
      assert.ok(!overlap, `${ids[i]} overlaps ${ids[j]}`);
    }
  });

  it('returns group members as relative positions inside their group box', () => {
    const result = layoutImport(sample20(), existing);
    for (const [id, n] of Object.entries(result.nodes)) {
      const index = Number(id.slice(1));
      const expected = index < 5 ? 'ga' : index < 9 ? 'gb' : undefined;
      assert.equal(n.parentGroup, expected, id);
      if (!expected) continue;
      const g = result.groups[expected];
      assert.ok(n.x >= 0 && n.y >= 0, `${id} relative position must be inside`);
      assert.ok(n.x + W <= g.width && n.y + H <= g.height, `${id} must fit in ${expected}`);
    }
    assert.ok(Object.values(result.groups).every((g) => g.width >= 80 && g.height >= 80));
  });

  it('starts at (40, 40) on an empty view and ignores self loops and unknown ends', () => {
    const result = layoutImport({ direction: 'TB', nodes: [{ id: 'a' }, { id: 'b' }], groups: [], edges: [{ from: 'a', to: 'a' }, { from: 'a', to: 'zzz' }, { from: 'a', to: 'b' }] }, []);
    const pts = Object.values(result.nodes);
    assert.equal(Math.min(...pts.map((p) => p.x)), 40);
    assert.equal(Math.min(...pts.map((p) => p.y)), 40);
    assert.ok(result.nodes.b.y > result.nodes.a.y, 'TB puts b below a');
  });
});
