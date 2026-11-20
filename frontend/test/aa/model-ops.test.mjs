// model-ops 순수 함수 단위 테스트 (Sprint 2 Step 2)
// Node 24+ type stripping으로 .ts를 직접 불러온다. 결과 모델은 백엔드 validator로도 검증한다.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as ops from '../../lib/aa/model-ops.ts';
import { toFlow, sortParentsFirst } from '../../lib/aa/graph-mapper.ts';

const require = createRequire(import.meta.url);
const { validateModel, REGISTRY } = require('../../../backend/lib/aa/architecture-validator.js');

const VIEW = 'view_logical';

function idGen() {
  let n = 0;
  return (prefix) => `${prefix}_${String(++n).padStart(10, '0')}`;
}

function emptyModel() {
  return {
    schemaVersion: 1, components: {}, relations: {},
    views: [{ id: VIEW, kind: 'logical', name: 'Logical', nodes: [], edges: [] }],
    flows: {},
  };
}

const view = (m) => m.views.find((v) => v.id === VIEW);
const node = (m, id) => view(m).nodes.find((n) => n.id === id);
const abs = (m, id) => ops.absolutePosition(view(m), id);
const errors = (m) => validateModel(m).errors;
const assertValid = (m) => assert.deepEqual(errors(m), []);

/** client·service 두 노드와 그룹 하나 */
function setup() {
  const newId = idGen();
  let m = emptyModel();
  const a = ops.addComponent(m, VIEW, 'client', REGISTRY, { x: 100, y: 100 }, newId); m = a.model;
  const b = ops.addComponent(m, VIEW, 'service', REGISTRY, { x: 300, y: 120 }, newId); m = b.model;
  const g = ops.addGroup(m, VIEW, { x: 50, y: 50 }, { width: 500, height: 300 }, newId); m = g.model;
  return { m, newId, a: a.nodeId, b: b.nodeId, g: g.nodeId, ca: a.componentId, cb: b.componentId };
}

describe('addComponent / addGroup / addNote', () => {
  it('새 컴포넌트에만 레지스트리 기본값을 채운다 (service stateless: true)', () => {
    const { m, cb, ca } = setup();
    assert.deepEqual(m.components[cb].properties, { stateless: true });
    assert.deepEqual(m.components[ca].properties, {});   // client는 default 없음
    assert.equal(m.components[cb].name, 'Service 1');
    assertValid(m);
  });

  it('입력 모델을 바꾸지 않는다', () => {
    const m0 = emptyModel();
    const before = JSON.stringify(m0);
    ops.addComponent(m0, VIEW, 'service', REGISTRY, { x: 1, y: 2 }, idGen());
    assert.equal(JSON.stringify(m0), before);
  });

  it('group·note 타입은 컴포넌트로 만들지 않는다', () => {
    const m0 = emptyModel();
    for (const t of ['group', 'note']) assert.equal(ops.addComponent(m0, VIEW, t, REGISTRY, { x: 0, y: 0 }, idGen()).model, m0);
  });

  it('group(크기 하한 80)·note는 validator를 통과한다', () => {
    const newId = idGen();
    let m = ops.addGroup(emptyModel(), VIEW, { x: 0, y: 0 }, { width: 10, height: 10 }, newId).model;
    m = ops.addNote(m, VIEW, { x: 10, y: 400 }, '조회는 캐시 우선', newId).model;
    const g = view(m).nodes.find((n) => n.kind === 'group');
    assert.equal(g.width, 80);
    assert.equal(g.height, 80);
    assertValid(m);
  });
});

describe('setParent / moveNodes 좌표', () => {
  it('그룹에 넣고 빼도 절대 위치가 같다', () => {
    const { m: m0, a, g } = setup();
    const before = abs(m0, a);
    const m1 = ops.setParent(m0, VIEW, a, g);
    assert.equal(node(m1, a).parentId, g);
    assert.deepEqual(node(m1, a).position, { x: 50, y: 50 });   // 100-50
    assert.deepEqual(abs(m1, a), before);
    assertValid(m1);
    const m2 = ops.setParent(m1, VIEW, a, null);
    assert.equal(node(m2, a).parentId, undefined);
    assert.deepEqual(node(m2, a).position, before);
  });

  it('중첩 2단계 넣기·빼기 왕복도 절대 위치 동일', () => {
    let { m, a, g, newId } = setup();
    const inner = ops.addGroup(m, VIEW, { x: 80, y: 70 }, { width: 200, height: 150 }, newId); m = inner.model;
    const before = abs(m, a);
    m = ops.setParent(m, VIEW, inner.nodeId, g);
    m = ops.setParent(m, VIEW, a, inner.nodeId);
    assert.deepEqual(abs(m, a), before);
    assert.deepEqual(node(m, a).position, { x: 20, y: 30 });   // 100-80, 100-70
    assertValid(m);
    // 바깥 그룹으로 바로 옮기기 → 빼기
    m = ops.setParent(m, VIEW, a, g);
    assert.deepEqual(abs(m, a), before);
    m = ops.setParent(m, VIEW, a, null);
    assert.deepEqual(node(m, a).position, before);
  });

  it('그룹을 움직이면 자식 상대 좌표는 그대로, 절대 위치는 같이 이동', () => {
    let { m, a, g } = setup();
    m = ops.setParent(m, VIEW, a, g);
    const rel = { ...node(m, a).position };
    const absBefore = abs(m, a);
    m = ops.moveNodes(m, VIEW, [{ id: g, x: 150, y: 90 }]);
    assert.deepEqual(node(m, a).position, rel);
    assert.deepEqual(abs(m, a), { x: absBefore.x + 100, y: absBefore.y + 40 });
  });

  it('자기 자신·자기 하위 그룹·group이 아닌 노드로는 거부, 모델 불변', () => {
    let { m, a, b, g, newId } = setup();
    const inner = ops.addGroup(m, VIEW, { x: 80, y: 70 }, { width: 200, height: 150 }, newId); m = inner.model;
    m = ops.setParent(m, VIEW, inner.nodeId, g);
    for (const [nid, pid] of [[g, g], [g, inner.nodeId], [a, b]]) {
      assert.equal(ops.canSetParent(m, VIEW, nid, pid), false);
      assert.equal(ops.setParent(m, VIEW, nid, pid), m);
    }
  });

  it('위치가 그대로면 같은 모델을 돌려준다 (dirty 아님)', () => {
    const { m, a } = setup();
    assert.equal(ops.moveNodes(m, VIEW, [{ id: a, x: 100, y: 100 }]), m);
    assert.notEqual(ops.moveNodes(m, VIEW, [{ id: a, x: 100.4, y: 101 }]), m);
  });
});

describe('connect', () => {
  it('같은 from/to 관계를 재사용하고, 이미 있으면 변경 없음', () => {
    let { m, a, b, newId } = setup();
    const r1 = ops.connect(m, VIEW, a, b, {}, newId); m = r1.model;
    assert.equal(Object.keys(m.relations).length, 1);
    assert.equal(view(m).edges.length, 1);
    const r2 = ops.connect(m, VIEW, a, b, {}, newId);
    assert.equal(r2.model, m);
    assert.equal(r2.relationId, r1.relationId);
    assertValid(m);
  });

  it('그룹·노트·자기 자신과는 연결하지 않는다', () => {
    const { m, a, g } = setup();
    assert.equal(ops.connect(m, VIEW, a, g, {}, idGen()).model, m);
    assert.equal(ops.connect(m, VIEW, a, a, {}, idGen()).model, m);
  });
});

describe('removeNodes / removeEdges', () => {
  it('그룹 삭제 → 자식(중첩 포함) 절대 위치 유지, parentId는 남은 조상 또는 없음', () => {
    let { m, a, b, g, newId } = setup();
    const inner = ops.addGroup(m, VIEW, { x: 80, y: 70 }, { width: 200, height: 150 }, newId); m = inner.model;
    m = ops.setParent(m, VIEW, inner.nodeId, g);
    m = ops.setParent(m, VIEW, a, inner.nodeId);
    m = ops.setParent(m, VIEW, b, g);
    const absA = abs(m, a), absB = abs(m, b);

    const m1 = ops.removeNodes(m, VIEW, [inner.nodeId], { deleteComponents: true });   // 안쪽만
    assert.equal(node(m1, a).parentId, g);
    assert.deepEqual(abs(m1, a), absA);
    assertValid(m1);

    const m2 = ops.removeNodes(m, VIEW, [g, inner.nodeId], { deleteComponents: true });   // 둘 다
    assert.equal(node(m2, a).parentId, undefined);
    assert.equal(node(m2, b).parentId, undefined);
    assert.deepEqual(node(m2, a).position, absA);
    assert.deepEqual(node(m2, b).position, absB);
    assertValid(m2);

    const m3 = ops.removeNodes(m, VIEW, [g], { deleteComponents: true });   // 바깥만 → 안쪽 그룹이 최상위로
    assert.equal(node(m3, inner.nodeId).parentId, undefined);
    assert.equal(node(m3, a).parentId, inner.nodeId);
    assert.deepEqual(abs(m3, a), absA);
  });

  it('"노드만 제거" → 노드·엣지만 사라지고 컴포넌트·relations 유지, V7 경고만', () => {
    let { m, a, b, ca, newId } = setup();
    m = ops.connect(m, VIEW, a, b, {}, newId).model;
    const m1 = ops.removeNodes(m, VIEW, [a], { deleteComponents: false });
    assert.equal(node(m1, a), undefined);
    assert.equal(view(m1).edges.length, 0);
    assert.ok(m1.components[ca]);
    assert.equal(Object.keys(m1.relations).length, 1);
    const r = validateModel(m1);
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => w.rule === 'V7'));
  });

  it('"컴포넌트 삭제" → 컴포넌트·관계·엣지 모두 제거', () => {
    let { m, a, b, ca, newId } = setup();
    m = ops.connect(m, VIEW, a, b, {}, newId).model;
    const m1 = ops.removeNodes(m, VIEW, [a], { deleteComponents: true });
    assert.equal(m1.components[ca], undefined);
    assert.deepEqual(m1.relations, {});
    assert.equal(view(m1).edges.length, 0);
    const r = validateModel(m1);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });

  it('deleteSummary: 컴포넌트가 있으면 확인 필요, 그룹·노트만이면 아님', () => {
    let { m, a, b, g, newId } = setup();
    m = ops.connect(m, VIEW, a, b, {}, newId).model;
    m = ops.addNote(m, VIEW, { x: 0, y: 500 }, 'memo', newId).model;
    const note = view(m).nodes.find((n) => n.kind === 'note').id;
    assert.deepEqual(ops.deleteSummary(m, VIEW, [a]), { componentCount: 1, relationCount: 1, needsConfirm: true });
    assert.equal(ops.deleteSummary(m, VIEW, [g, note]).needsConfirm, false);
  });

  it('엣지 삭제는 다른 곳에서 안 쓰는 관계까지 지운다 (Sprint 1 동작)', () => {
    let { m, a, b, newId } = setup();
    const c = ops.connect(m, VIEW, a, b, {}, newId); m = c.model;
    const m1 = ops.removeEdges(m, VIEW, [c.edgeId]);
    assert.deepEqual(m1.relations, {});
    const m2 = ops.removeEdges(m, VIEW, [c.edgeId], { deleteRelations: false });
    assert.equal(Object.keys(m2.relations).length, 1);
  });
});

describe('duplicateNodes', () => {
  it('그룹과 자식을 함께 선택 → 자식 한 번만, +24px는 최상위만, 새 자식 parentId = 새 그룹, 관계 복제 없음', () => {
    let { m, a, b, g, newId } = setup();
    m = ops.connect(m, VIEW, a, b, {}, newId).model;
    m = ops.setParent(m, VIEW, a, g);
    m = ops.setParent(m, VIEW, b, g);
    const nodesBefore = view(m).nodes.length, compsBefore = Object.keys(m.components).length;

    const d = ops.duplicateNodes(m, VIEW, [g, a], newId);
    assert.equal(d.newNodeIds.length, 3);   // 그룹 + 자식 2 (a는 한 번만)
    assert.equal(view(d.model).nodes.length, nodesBefore + 3);
    assert.equal(Object.keys(d.model.components).length, compsBefore + 2);
    assert.equal(Object.keys(d.model.relations).length, 1);
    assert.equal(view(d.model).edges.length, 1);

    const [ng, ...kids] = d.newNodeIds.map((id) => node(d.model, id));
    assert.equal(ng.kind, 'group');
    assert.deepEqual(ng.position, { x: node(m, g).position.x + 24, y: node(m, g).position.y + 24 });
    for (const k of kids) assert.equal(k.parentId, ng.id);
    const kidA = kids.find((k) => d.model.components[k.componentId].type === 'client');
    assert.deepEqual(kidA.position, node(m, a).position);   // 상대 좌표 그대로
    assert.notEqual(kidA.componentId, node(m, a).componentId);
    assertValid(d.model);
  });

  it('그룹 안 자식만 복제하면 같은 그룹 안에 +24px', () => {
    let { m, a, g, newId } = setup();
    m = ops.setParent(m, VIEW, a, g);
    const d = ops.duplicateNodes(m, VIEW, [a], newId);
    const copy = node(d.model, d.newNodeIds[0]);
    assert.equal(copy.parentId, g);
    assert.deepEqual(copy.position, { x: node(m, a).position.x + 24, y: node(m, a).position.y + 24 });
    assertValid(d.model);
  });
});

describe('group·note 편집', () => {
  it('note 글, 그룹 라벨·크기 변경', () => {
    let { m, g, newId } = setup();
    const n = ops.addNote(m, VIEW, { x: 0, y: 500 }, 'a', newId); m = n.model;
    m = ops.updateNoteText(m, VIEW, n.nodeId, '두 줄\n메모');
    m = ops.updateGroupLabel(m, VIEW, g, 'Platform');
    m = ops.resizeGroup(m, VIEW, g, { width: 640.6, height: 20 }, { x: 40, y: 40 });
    assert.equal(node(m, n.nodeId).text, '두 줄\n메모');
    assert.equal(node(m, g).label, 'Platform');
    assert.deepEqual([node(m, g).width, node(m, g).height], [641, 80]);
    assert.deepEqual(node(m, g).position, { x: 40, y: 40 });
    assert.equal(ops.updateNoteText(m, VIEW, n.nodeId, '두 줄\n메모'), m);
    assertValid(m);
  });
});

describe('graph-mapper', () => {
  it('저장 순서가 섞여도(자식이 부모보다 앞) 부모가 먼저 온다, 중첩 포함', () => {
    let { m, a, g, newId } = setup();
    const inner = ops.addGroup(m, VIEW, { x: 80, y: 70 }, { width: 200, height: 150 }, newId); m = inner.model;
    m = ops.setParent(m, VIEW, inner.nodeId, g);
    m = ops.setParent(m, VIEW, a, inner.nodeId);
    view(m).nodes.reverse();   // 자식 → 안쪽 그룹 → 바깥 그룹 순으로 저장된 것처럼
    const order = toFlow(m, VIEW).nodes.map((n) => n.id);
    assert.ok(order.indexOf(g) < order.indexOf(inner.nodeId));
    assert.ok(order.indexOf(inner.nodeId) < order.indexOf(a));
    const flowA = toFlow(m, VIEW).nodes.find((n) => n.id === a);
    assert.equal(flowA.parentId, inner.nodeId);
    assert.equal(sortParentsFirst(view(m).nodes).length, view(m).nodes.length);
  });

  it('group은 크기, note는 글을 data로 넘긴다', () => {
    let { m, g, newId } = setup();
    m = ops.addNote(m, VIEW, { x: 0, y: 500 }, 'memo', newId).model;
    const flow = toFlow(m, VIEW).nodes;
    const fg = flow.find((n) => n.id === g);
    assert.equal(fg.type, 'group');
    assert.deepEqual([fg.width, fg.height], [500, 300]);
    assert.equal(flow.find((n) => n.type === 'note').data.text, 'memo');
  });
});

describe('S2-0 흐름: 연결 → 그룹 넣기 → 그룹 이동 → 그룹 삭제', () => {
  it('자식 절대 위치·관계·엣지가 기대값과 같고 validator 통과', () => {
    let { m, a, b, g, ca, cb, newId } = setup();
    m = ops.connect(m, VIEW, a, b, {}, newId).model;
    m = ops.setParent(m, VIEW, a, g);
    m = ops.setParent(m, VIEW, b, g);
    assertValid(m);
    m = ops.moveNodes(m, VIEW, [{ id: g, x: 250, y: 150 }]);   // +200, +100
    const absA = abs(m, a), absB = abs(m, b);
    assert.deepEqual(absA, { x: 300, y: 200 });
    assert.deepEqual(absB, { x: 500, y: 220 });
    assertValid(m);

    // 그룹·노트만 지우는 경우는 확인 없이 삭제 (needsConfirm=false) — 컴포넌트는 지우지 않는다
    assert.equal(ops.deleteSummary(m, VIEW, [g]).needsConfirm, false);
    m = ops.removeNodes(m, VIEW, [g], { deleteComponents: true });

    assert.equal(node(m, g), undefined);
    assert.deepEqual(node(m, a).position, absA);
    assert.deepEqual(node(m, b).position, absB);
    assert.equal(node(m, a).parentId, undefined);
    const rels = Object.values(m.relations);
    assert.equal(rels.length, 1);
    assert.deepEqual([rels[0].from, rels[0].to], [ca, cb]);
    assert.equal(view(m).edges.length, 1);
    assert.equal(view(m).edges[0].relationId, rels[0].id);
    const r = validateModel(m);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);

    // UI(React Flow) 표현도 같은 위치·엣지
    const flow = toFlow(m, VIEW);
    assert.deepEqual(flow.nodes.find((n) => n.id === a).position, absA);
    assert.equal(flow.edges.length, 1);
    assert.deepEqual([flow.edges[0].source, flow.edges[0].target], [a, b]);
  });
});
