// Sprint 4 Step 3 — 가져오기 병합 (S4-2, Q7·Q8). 파서 + Dagre 배치 + mergeImport + 서버 검증기까지 엮는다.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseMermaidFlowchart } from '../../lib/aa/importers/mermaid-flowchart.ts';
import { layoutImport, NODE_SIZE } from '../../lib/aa/import-layout.ts';
import {
  defaultImportChoices, getView, importCandidates, importChoiceProblems, importNodesToPlace, mergeImport,
} from '../../lib/aa/model-ops.ts';

const require = createRequire(import.meta.url);
const REGISTRY = require('../../../backend/lib/aa/type-registry.json');
const { validateModel } = require('../../../backend/lib/aa/architecture-validator.js');

let seq = 0;
const newId = (prefix) => `${prefix}_t${String(++seq).padStart(8, '0')}`;

function baseModel() {
  const c = (id, name, type) => ({ id, layer: 'logical', type, name, properties: {}, requirementIds: [], decisionIds: [] });
  return {
    schemaVersion: 1,
    components: {
      cmp_client01: c('cmp_client01', 'Client', 'client'),
      cmp_redisa01: c('cmp_redisa01', 'Redis', 'cache'),
      cmp_redisb01: c('cmp_redisb01', 'redis', 'cache'),
      cmp_orphan01: c('cmp_orphan01', 'Gateway', 'gateway'),
    },
    relations: {
      rel_exist001: { id: 'rel_exist001', type: 'calls', from: 'cmp_client01', to: 'cmp_orphan01', protocol: 'HTTPS', mode: 'sync', requirementIds: [] },
    },
    views: [{ id: 'view_logical', kind: 'logical', name: 'Logical', nodes: [
      { id: 'nd_client01', kind: 'component', componentId: 'cmp_client01', position: { x: 0, y: 0 } },
      { id: 'nd_redisa01', kind: 'component', componentId: 'cmp_redisa01', position: { x: 300, y: 0 } },
      { id: 'nd_redisb01', kind: 'component', componentId: 'cmp_redisb01', position: { x: 600, y: 0 } },
    ], edges: [] }],
    flows: {},
  };
}

const TEXT = [
  'flowchart LR',
  '  Client -->|HTTPS| Gateway',
  '  Gateway --> Reports API --> Redis',
  '  subgraph data [Data]',
  '    Reports API -->|JDBC| DB[(Reports DB)]',
  '    Reports API -.->|JDBC| DB',
  '    Reports API -->|JDBC| DB',
  '  end',
].join('\n');

function prepare(model, choicesPatch = {}) {
  const parsed = parseMermaidFlowchart(TEXT, REGISTRY);
  const candidates = importCandidates(model, parsed);
  const choices = { ...defaultImportChoices(parsed, candidates), ...choicesPatch };
  return { parsed, candidates, choices };
}

function layoutFor(model, parsed, choices) {
  const toPlace = new Set(importNodesToPlace(model, 'view_logical', parsed, choices));
  const groupOf = new Map(parsed.groups.flatMap((g) => g.members.map((m) => [m, g.id])));
  return layoutImport({
    direction: parsed.direction,
    nodes: parsed.nodes.filter((n) => toPlace.has(n.mermaidId)).map((n) => ({ id: n.mermaidId, group: groupOf.get(n.mermaidId) })),
    groups: parsed.groups.filter((g) => g.members.some((m) => toPlace.has(m))).map((g) => ({ id: g.id })),
    edges: parsed.edges.filter((e) => toPlace.has(e.from) && toPlace.has(e.to)),
  }, getView(model, 'view_logical').nodes);
}

describe('import candidates and choices (Q7)', () => {
  it('suggests 0 / 1 / many candidates by exact name ignoring case and spaces', () => {
    const model = baseModel();
    const { candidates, choices } = prepare(model);
    assert.deepEqual(candidates.Client, ['cmp_client01']);
    assert.deepEqual(candidates.Gateway, ['cmp_orphan01']);
    assert.deepEqual(candidates.Redis.sort(), ['cmp_redisa01', 'cmp_redisb01']);
    assert.deepEqual(candidates['Reports API'], []);
    assert.equal(choices.Client.reuse, 'cmp_client01');   // 1개 → 기본 연결
    assert.equal(choices.Redis.reuse, undefined);          // 여러 개 → 미선택
    assert.equal(choices['Reports API'].reuse, null);      // 없음 → 새로 만들기
    assert.equal(choices.DB.type, 'database');
  });

  it('blocks apply until every multi-candidate row is chosen and reused targets still exist', () => {
    const model = baseModel();
    const { parsed, choices } = prepare(model);
    assert.deepEqual(importChoiceProblems(model, parsed, choices), { unchosen: ['Redis'], missing: [] });
    const layout = layoutFor(model, parsed, { ...choices, Redis: { type: 'cache', reuse: null } });
    assert.deepEqual(mergeImport(model, 'view_logical', parsed, choices, layout, REGISTRY, newId), { error: 'unchosen', ids: ['Redis'] });

    const chosen = { ...choices, Redis: { type: 'cache', reuse: 'cmp_redisa01' } };
    const removed = structuredClone(model);
    delete removed.components.cmp_client01;
    removed.views[0].nodes = removed.views[0].nodes.filter((n) => n.componentId !== 'cmp_client01');
    delete removed.relations.rel_exist001;
    assert.deepEqual(importChoiceProblems(removed, parsed, chosen).missing, ['Client']);
  });
});

describe('mergeImport', () => {
  it('reuses, adds, groups and de-duplicates without touching existing nodes', () => {
    const model = baseModel();
    const snapshot = structuredClone(model);
    const { parsed, choices } = prepare(model, { Redis: { type: 'cache', reuse: 'cmp_redisa01' } });
    assert.deepEqual(importNodesToPlace(model, 'view_logical', parsed, choices), ['Gateway', 'Reports API', 'DB']);
    const result = mergeImport(model, 'view_logical', parsed, choices, layoutFor(model, parsed, choices), REGISTRY, newId);
    assert.ok(!('error' in result), JSON.stringify(result));
    assert.deepEqual(model, snapshot, 'input model is not mutated');

    const m = result.model;
    const view = getView(m, 'view_logical');
    // 연결 6개 = 새 4 + 중복 2(기존 Client→Gateway HTTPS, 같은 줄 반복)
    assert.deepEqual(result.summary, { newComponents: 2, reused: 3, newNodes: 3, newRelations: 4, skippedRelations: 2, newGroups: 1 });

    // 기존 노드 좌표 그대로, 새 노드는 기존 아래
    for (const n of snapshot.views[0].nodes) assert.deepEqual(view.nodes.find((x) => x.id === n.id), n);
    const existingBottom = NODE_SIZE.component.height;
    const newTop = view.nodes.filter((n) => !snapshot.views[0].nodes.some((o) => o.id === n.id) && !n.parentId).map((n) => n.position.y);
    assert.ok(newTop.every((y) => y >= existingBottom), 'new top-level nodes are placed below existing ones');

    // 고아였던 Gateway는 같은 컴포넌트로 노드만 추가, Reports API·DB는 새 컴포넌트
    assert.equal(view.nodes.filter((n) => n.componentId === 'cmp_orphan01').length, 1);
    const api = Object.values(m.components).find((c) => c.name === 'Reports API');
    const db = Object.values(m.components).find((c) => c.name === 'Reports DB');
    assert.equal(api.type, 'service');
    assert.equal(api.properties.stateless, true, 'registry defaults are filled for new components');
    assert.equal(db.type, 'database');

    // 그룹: Data 하나, 멤버는 그룹 기준 상대 좌표
    const group = view.nodes.find((n) => n.kind === 'group');
    assert.equal(group.label, 'Data');
    const members = view.nodes.filter((n) => n.parentId === group.id);
    assert.deepEqual(members.map((n) => m.components[n.componentId].name).sort(), ['Reports API', 'Reports DB']);

    // 관계: 기존 Client→Gateway HTTPS는 중복이라 새로 만들지 않음, 같은 줄 반복도 제외, async는 따로 남음
    const rels = Object.values(m.relations).map((r) => `${m.components[r.from].name}>${m.components[r.to].name}:${r.protocol ?? ''}:${r.mode}`).sort();
    assert.deepEqual(rels, [
      'Client>Gateway:HTTPS:sync',
      'Gateway>Reports API::sync',
      'Reports API>Redis::sync',
      'Reports API>Reports DB:JDBC:async',
      'Reports API>Reports DB:JDBC:sync',
    ]);
    assert.equal(view.edges.length, 4, 'one view edge per new relation');

    // 서버 검증기(V1~V12)를 그대로 통과
    assert.deepEqual(validateModel(m).errors, []);
  });

  it('creates everything new on an empty model and starts at (40, 40)', () => {
    const model = { schemaVersion: 1, components: {}, relations: {}, views: [{ id: 'view_logical', kind: 'logical', name: 'Logical', nodes: [], edges: [] }], flows: {} };
    const { parsed, choices } = prepare(model);
    const result = mergeImport(model, 'view_logical', parsed, choices, layoutFor(model, parsed, choices), REGISTRY, newId);
    assert.equal(result.summary.newComponents, 5);
    assert.equal(result.summary.reused, 0);
    const tops = getView(result.model, 'view_logical').nodes.filter((n) => !n.parentId);
    assert.equal(Math.min(...tops.map((n) => n.position.x)), 40);
    assert.equal(Math.min(...tops.map((n) => n.position.y)), 40);
    assert.deepEqual(validateModel(result.model).errors, []);
  });

  it('reports nodes the layout did not place', () => {
    const model = baseModel();
    const { parsed, choices } = prepare(model, { Redis: { type: 'cache', reuse: 'cmp_redisa01' } });
    const result = mergeImport(model, 'view_logical', parsed, choices, { nodes: {}, groups: {} }, REGISTRY, newId);
    assert.equal(result.error, 'layout');
  });
});
