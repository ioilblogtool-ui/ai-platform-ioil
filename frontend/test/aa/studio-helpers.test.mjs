// Step 3 보조 순수 함수: 그룹 놓기 판정(findDropGroup), 팔레트 검색(paletteItems)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as ops from '../../lib/aa/model-ops.ts';
import { paletteItems } from '../../components/aa/studio/palette-meta.ts';
import { toFlow } from '../../lib/aa/graph-mapper.ts';

const require = createRequire(import.meta.url);
const { REGISTRY } = require('../../../backend/lib/aa/architecture-validator.js');
const VIEW = 'view_logical';
const idGen = () => { let n = 0; return (p) => `${p}_${String(++n).padStart(10, '0')}`; };
const empty = () => ({ schemaVersion: 1, components: {}, relations: {}, views: [{ id: VIEW, kind: 'logical', name: 'Logical', nodes: [], edges: [] }], flows: {} });

describe('findDropGroup', () => {
  function nested() {
    const newId = idGen();
    let m = empty();
    const outer = ops.addGroup(m, VIEW, { x: 0, y: 0 }, { width: 600, height: 400 }, newId); m = outer.model;
    const inner = ops.addGroup(m, VIEW, { x: 100, y: 100 }, { width: 200, height: 150 }, newId); m = inner.model;
    m = ops.setParent(m, VIEW, inner.nodeId, outer.nodeId);   // inner 상대 (100,100)
    return { m, outer: outer.nodeId, inner: inner.nodeId };
  }

  it('가장 안쪽 그룹을 고르고, 밖이면 null', () => {
    const { m, outer, inner } = nested();
    assert.equal(ops.findDropGroup(m, VIEW, { x: 150, y: 150 }), inner);
    assert.equal(ops.findDropGroup(m, VIEW, { x: 500, y: 350 }), outer);
    assert.equal(ops.findDropGroup(m, VIEW, { x: 700, y: 50 }), null);
  });

  it('움직이는 그룹 자신·하위 그룹은 후보에서 뺀다', () => {
    const { m, outer, inner } = nested();
    assert.equal(ops.findDropGroup(m, VIEW, { x: 150, y: 150 }, outer), null);
    assert.equal(ops.findDropGroup(m, VIEW, { x: 150, y: 150 }, inner), outer);
  });
});

describe('paletteItems', () => {
  const types = (q) => paletteItems(REGISTRY, 'logical', q).map((i) => i.type);

  it('Logical 팔레트는 11종(컴포넌트 9 + Boundary·Note)', () => {
    const all = paletteItems(REGISTRY, 'logical');
    assert.equal(all.length, 11);
    assert.deepEqual(all.filter((i) => i.category === 'general').map((i) => i.nodeKind).sort(), ['group', 'note']);
  });

  it('별칭 검색: postgres→Database, redis→Cache, kafka→Queue, 대소문자 무시', () => {
    assert.deepEqual(types('postgres'), ['database']);
    assert.deepEqual(types('REDIS'), ['cache']);
    assert.ok(types('kafka').includes('queue'));
    assert.deepEqual(types('boundary'), ['group']);
    assert.deepEqual(types('zzz'), []);
  });
});

describe('RelationEdge 매핑', () => {
  it('엣지는 relation 타입이고 protocol·mode를 data로 넘긴다', () => {
    const newId = idGen();
    let m = empty();
    const a = ops.addComponent(m, VIEW, 'service', REGISTRY, { x: 0, y: 0 }, newId); m = a.model;
    const b = ops.addComponent(m, VIEW, 'queue', REGISTRY, { x: 300, y: 0 }, newId); m = b.model;
    const c = ops.connect(m, VIEW, a.nodeId, b.nodeId, {}, newId); m = c.model;
    m.relations[c.relationId].mode = 'async';
    m.relations[c.relationId].protocol = 'Kafka';
    const [e] = toFlow(m, VIEW).edges;
    assert.equal(e.type, 'relation');
    const { relation, ...rest } = e.data;
    assert.deepEqual(rest, { relationId: c.relationId, protocol: 'Kafka', label: undefined, mode: 'async', layer: 'api' });   // Sprint 11: 레이어
    assert.equal(relation, m.relations[c.relationId], 'Sprint 8: 툴팁용 관계 전체');
  });
});
