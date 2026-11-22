// Sprint 4 Step 2 — Mermaid flowchart 파서·타입 추론 (S4-1, S4-4 일부)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  IMPORT_PROTOCOLS, IMPORT_SECRET_PATTERNS, MAX_LINES, MAX_NODES,
  inferType, isImportError, parseMermaidFlowchart, splitEdgeLabel,
} from '../../lib/aa/importers/mermaid-flowchart.ts';
import { PROTOCOLS } from '../../lib/aa/model-ops.ts';
import { secretPatterns } from '../../lib/aa/draft-backup.ts';

const require = createRequire(import.meta.url);
const REGISTRY = require('../../../backend/lib/aa/type-registry.json');
const { normalizeModel } = require('../../../backend/lib/aa/normalize.js');
const { toMermaidFlowchart } = require('../../../backend/lib/aa/mermaid-export.js');

const parse = (text) => parseMermaidFlowchart(text, REGISTRY);
const ok = (text) => {
  const r = parse(text);
  assert.ok(!isImportError(r), `unexpected error: ${r.message}`);
  return r;
};

describe('shared constants stay in sync', () => {
  it('protocols and secret patterns match their sources', () => {
    assert.deepEqual([...IMPORT_PROTOCOLS], [...PROTOCOLS]);
    assert.deepEqual(IMPORT_SECRET_PATTERNS.map(String), secretPatterns.map(String));
  });
});

describe('parseMermaidFlowchart', () => {
  it('P2-8: chain of four nodes with a spaced name, Redis inferred as cache', () => {
    const r = ok('flowchart LR\n  Client --> Gateway --> Reports API --> Redis');
    assert.equal(r.direction, 'LR');
    assert.deepEqual(r.nodes.map((n) => [n.mermaidId, n.label, n.inferredType, n.confidence]), [
      ['Client', 'Client', 'client', 'high'],
      ['Gateway', 'Gateway', 'gateway', 'high'],
      ['Reports API', 'Reports API', 'service', 'medium'],
      ['Redis', 'Redis', 'cache', 'high'],
    ]);
    assert.deepEqual(r.edges.map((e) => `${e.from}>${e.to}`), ['Client>Gateway', 'Gateway>Reports API', 'Reports API>Redis']);
    assert.deepEqual(r.warnings, []);

    // 같은 이름을 공백 수만 다르게 써도 한 노드, 대괄호 표기와도 섞어 쓸 수 있다
    const mixed = ok('flowchart LR\n  Reports  API --> DB[(Reports DB)]\n  Client --> Reports API');
    assert.deepEqual(mixed.nodes.map((n) => n.mermaidId), ['Reports API', 'DB', 'Client']);
  });

  it('reads every supported shape, arrow and label form', () => {
    const r = ok([
      'graph TD',
      '  A[Web App] --> B([Gateway])',
      '  B -->|HTTPS| C["Reports \\"API\\""]',
      '  C ==>|jdbc| D[(Reports DB)]',
      '  C -.->|events| E((Kafka))',
      '  E --- F',
      '  C-->D',
      '  C --->|retry| F;',
    ].join('\n').replace(/\\"/g, '#quot;'));
    assert.equal(r.direction, 'TB');
    assert.deepEqual(r.nodes.map((n) => [n.mermaidId, n.shape, n.inferredType]), [
      ['A', 'box', 'client'], ['B', 'stadium', 'gateway'], ['C', 'box', 'service'],
      ['D', 'cylinder', 'database'], ['E', 'circle', 'queue'], ['F', 'box', 'service'],
    ]);
    assert.equal(r.nodes[2].label, 'Reports "API"');
    assert.deepEqual(r.edges, [
      { from: 'A', to: 'B', mode: 'sync' },
      { from: 'B', to: 'C', mode: 'sync', protocol: 'HTTPS' },
      { from: 'C', to: 'D', mode: 'sync', protocol: 'JDBC' },
      { from: 'C', to: 'E', mode: 'async', label: 'events' },
      { from: 'E', to: 'F', mode: 'sync' },
      { from: 'C', to: 'D', mode: 'sync' },
      { from: 'C', to: 'F', mode: 'sync', label: 'retry' },
    ]);
    assert.deepEqual(r.warnings, []);
  });

  it('keeps the first label and maps subgraph members (one level)', () => {
    const r = ok([
      'flowchart LR',
      '  Client[Browser]',
      '  subgraph backend [Backend]',
      '    API[Reports API] --> DB[(Postgres)]',
      '  end',
      '  subgraph "Edge zone"',
      '    Client --> API',
      '  end',
      '  API[다른 이름]',
    ].join('\n'));
    assert.equal(r.nodes.find((n) => n.mermaidId === 'API').label, 'Reports API');
    assert.deepEqual(r.groups, [
      { id: 'backend', label: 'Backend', members: ['API', 'DB'] },
      { id: 'sg1', label: 'Edge zone', members: ['Client'] },
    ]);
  });

  it('warns with line numbers and ignores unsupported lines entirely', () => {
    const r = ok([
      'flowchart RL',              // 1 방향 경고
      '  A --> B',                 // 2
      '  C{결정} --> A',            // 3 마름모
      '  A -- 호출 --> B',          // 4 -- 라벨 -->
      '  A & B --> C2',            // 5 &
      '  classDef x fill:#f00',    // 6
      '  style A fill:#f00',       // 7
      '  %% 주석은 조용히 넘긴다',   // 8
      '  subgraph outer',          // 9
      '    subgraph inner',        // 10 중첩
      '      D --> E',             // 11
      '    end',                   // 12
      '  end',                     // 13
      '  A --> A',                 // 14 자기 연결
      '  end',                     // 15 짝 없음
      '  B(round)',                // 16 둥근 모양
    ].join('\n'));
    assert.equal(r.direction, 'LR');
    assert.deepEqual(r.warnings.map((w) => w.line), [1, 3, 4, 5, 6, 7, 10, 14, 15, 16]);
    assert.ok(r.warnings.every((w) => w.reason && typeof w.text === 'string'));
    assert.deepEqual(r.nodes.map((n) => n.mermaidId), ['A', 'B', 'D', 'E']);   // 3·5·16줄 노드는 만들지 않는다
    assert.deepEqual(r.groups, [{ id: 'outer', label: 'outer', members: ['D', 'E'] }]);
    assert.deepEqual(r.edges, [{ from: 'A', to: 'B', mode: 'sync' }, { from: 'D', to: 'E', mode: 'sync' }]);
  });

  it('reports an unclosed subgraph', () => {
    const r = ok('flowchart LR\n subgraph g\n  A --> B');
    assert.match(r.warnings.at(-1).reason, /닫히지 않은 subgraph/);
  });

  it('returns errors for empty input, missing header, secrets and limits', () => {
    assert.equal(parse('   \n').error, 'empty');
    assert.equal(parse('A --> B').error, 'no_header');
    const secret = parse(`flowchart LR\n  A[key sk-${'a'.repeat(24)}] --> B`);
    assert.equal(secret.error, 'secret');
    assert.equal(secret.line, 2);
    assert.ok(!secret.message.includes('sk-aaa'), 'the secret value is not echoed back');

    // 줄 수만 늘리고 노드는 100개 안에서 반복한다 (노드 한도와 따로 확인)
    const filler = (n) => ['flowchart TD', ...Array.from({ length: n - 1 }, (_, i) => `  N${i % 100}`)].join('\n');
    assert.ok(!isImportError(parse(filler(MAX_LINES))));
    assert.equal(parse(filler(MAX_LINES + 1)).error, 'too_many_lines');
    assert.ok(!isImportError(parse(filler(MAX_LINES) + '\n\n\n')), 'trailing blank lines are not counted');

    const nodes = (n) => ['flowchart TD', ...Array.from({ length: Math.ceil(n / 2) }, (_, i) => `  A${i} --> B${i}`)].join('\n');
    assert.equal(ok(nodes(MAX_NODES)).nodes.length, MAX_NODES);
    const tooMany = parse(nodes(MAX_NODES) + '\n  Extra');
    assert.equal(tooMany.error, 'too_many_nodes');
  });
});

describe('inference helpers', () => {
  it('prefers longer and exact alias matches', () => {
    assert.deepEqual(inferType('API Gateway', 'box', REGISTRY), { type: 'gateway', confidence: 'high' });
    assert.deepEqual(inferType('Order API', 'box', REGISTRY), { type: 'service', confidence: 'medium' });
    assert.deepEqual(inferType('postgres', 'box', REGISTRY), { type: 'database', confidence: 'high' });
    assert.deepEqual(inferType('Kafka cluster', 'box', REGISTRY), { type: 'queue', confidence: 'medium' });
    assert.deepEqual(inferType('결제 모듈', 'box', REGISTRY), { type: 'service', confidence: 'low' });
    assert.deepEqual(inferType('anything', 'cylinder', REGISTRY), { type: 'database', confidence: 'high' });
    assert.deepEqual(inferType('Boundary', 'box', REGISTRY), { type: 'service', confidence: 'low' }, 'group/note types are not candidates');
  });

  it('splits protocol from label case-insensitively', () => {
    assert.deepEqual(splitEdgeLabel('grpc'), { protocol: 'gRPC' });
    assert.deepEqual(splitEdgeLabel('토큰 검증'), { label: '토큰 검증' });
    assert.deepEqual(splitEdgeLabel(undefined), {});
  });
});

describe('round trip with the backend Mermaid exporter (Step 1)', () => {
  it('keeps node, relation and group counts and the database shape', () => {
    const c = (id, name, type) => ({ id, layer: 'logical', type, name, properties: {}, requirementIds: [], decisionIds: [] });
    const model = {
      schemaVersion: 1,
      components: { cmp_a: c('cmp_a', 'Web "App"', 'client'), cmp_b: c('cmp_b', 'Reports API', 'service'), cmp_c: c('cmp_c', 'Reports DB', 'database') },
      relations: {
        rel_1: { id: 'rel_1', type: 'calls', from: 'cmp_a', to: 'cmp_b', protocol: 'HTTPS', requirementIds: [] },
        rel_2: { id: 'rel_2', type: 'calls', from: 'cmp_b', to: 'cmp_c', mode: 'async', label: 'a | b', requirementIds: [] },
      },
      views: [{ id: 'view_logical', kind: 'logical', nodes: [
        { id: 'nd_g', kind: 'group', position: { x: 0, y: 0 }, width: 300, height: 200, label: 'Backend <core>' },
        { id: 'nd_a', kind: 'component', componentId: 'cmp_a', position: { x: 0, y: 0 } },
        { id: 'nd_b', kind: 'component', componentId: 'cmp_b', parentId: 'nd_g', position: { x: 10, y: 40 } },
        { id: 'nd_c', kind: 'component', componentId: 'cmp_c', parentId: 'nd_g', position: { x: 10, y: 120 } },
      ], edges: [] }],
    };
    const text = toMermaidFlowchart(normalizeModel(model));
    const r = ok(text);
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(r.nodes.map((n) => n.label), ['Reports API', 'Reports DB', 'Web "App"']);
    assert.equal(r.nodes.find((n) => n.label === 'Reports DB').inferredType, 'database');
    assert.equal(r.edges.length, 2);
    assert.deepEqual(r.edges[1], { from: 'c2', to: 'c3', mode: 'async', label: 'a / b' });
    assert.deepEqual(r.groups, [{ id: 'g1', label: 'Backend <core>', members: ['c2', 'c3'] }]);
  });
});
