// Sprint 4 Step 1 — 내보내기 공통 정규화·Mermaid 변환·경고 검사·확인 기록. DB 불필요, 항상 실행.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { scanForExport, scanForSecrets } = require('../../lib/aa/sensitive-scan');
const { normalizeModel } = require('../../lib/aa/normalize');
const { toMermaidFlowchart } = require('../../lib/aa/mermaid-export');
const { createScanStore, contentHash } = require('../../lib/aa/scan-store');

const NFR1 = '11111111-1111-4111-8111-111111111111';
const NFR2 = '22222222-2222-4222-8222-222222222222';
const FR1 = '33333333-3333-4333-8333-333333333333';

function model() {
  const c = (id, name, type, extra = {}) => ({ id, layer: 'logical', type, name, properties: {}, requirementIds: [], decisionIds: [], ...extra });
  return {
    schemaVersion: 1,
    components: {
      cmp_web00001: c('cmp_web00001', 'Web App', 'client', { technology: 'Next.js', description: '사용자 화면\n둘째 줄' }),
      cmp_api00001: c('cmp_api00001', 'Reports "API"', 'service', {
        technology: 'Node.js', properties: { runtime: 'Node 24', port: 4000, stateless: true },
        custom: { region: 'ap-northeast-2', DB_PASSWORD: 'x', apiToken: 'y', note: 'DATABASE_URL=postgres://x' },
        requirementIds: [NFR1.toUpperCase(), 'ffffffff-ffff-4fff-8fff-ffffffffffff'],
      }),
      cmp_db000001: c('cmp_db000001', 'Reports DB', 'database', { technology: 'PostgreSQL' }),
      cmp_orphan01: c('cmp_orphan01', 'Archive', 'storage'),
    },
    relations: {
      rel_a0000001: { id: 'rel_a0000001', type: 'calls', from: 'cmp_web00001', to: 'cmp_api00001', protocol: 'HTTPS', mode: 'sync', requirementIds: [] },
      rel_a0000002: { id: 'rel_a0000002', type: 'calls', from: 'cmp_api00001', to: 'cmp_db000001', protocol: 'JDBC', mode: 'sync', requirementIds: [NFR2] },
      rel_a0000003: { id: 'rel_a0000003', type: 'calls', from: 'cmp_api00001', to: 'cmp_db000001', mode: 'async', label: 'audit | log', requirementIds: [] },
      rel_a0000004: { id: 'rel_a0000004', type: 'calls', from: 'cmp_api00001', to: 'cmp_orphan01', protocol: 'HTTPS', requirementIds: [] },
    },
    views: [{
      id: 'view_logical', kind: 'logical', name: 'Logical',
      nodes: [
        { id: 'nd_outer001', kind: 'group', position: { x: 200, y: 0 }, width: 600, height: 300, label: 'Backend' },
        { id: 'nd_inner001', kind: 'group', parentId: 'nd_outer001', position: { x: 300, y: 40 }, width: 240, height: 160, label: 'Data' },
        { id: 'nd_web00001', kind: 'component', componentId: 'cmp_web00001', position: { x: 0, y: 80 } },
        { id: 'nd_api00001', kind: 'component', componentId: 'cmp_api00001', parentId: 'nd_outer001', position: { x: 20, y: 60 } },
        { id: 'nd_db000001', kind: 'component', componentId: 'cmp_db000001', parentId: 'nd_inner001', position: { x: 20, y: 40 } },
        { id: 'nd_note0001', kind: 'note', position: { x: 0, y: 400 }, text: '비밀 메모' },
      ],
      edges: [],
    }],
    flows: {},
  };
}

const requirements = [
  { id: NFR2, code: 'NFR-002', kind: 'nfr', title: '가용성 99.5%', category: 'availability', status: 'active' },
  { id: NFR1, code: 'NFR-001', kind: 'nfr', title: '조회 p95 300ms', category: 'performance', target: '300ms', metric: 'p95', status: 'active' },
  { id: FR1, code: 'FR-001', kind: 'fr', title: '월별 리포트', status: 'deprecated' },
];

describe('scanForExport', () => {
  it('warns on IP, internal domain and email without returning raw values', () => {
    const { blocks, warnings } = scanForExport({
      a: 'db at 10.12.3.4 and 10.12.3.4 again',
      b: 'api.corp and reports.internal',
      c: 'contact ops@example.com',
      d: 'listen 0.0.0.0, local 127.0.0.1, version 1.2.3, spring 3.2.1.RELEASE',
    });
    assert.deepEqual(blocks, []);
    assert.deepEqual(warnings.map((w) => `${w.rule}@${w.path}`).sort(), [
      'email@c', 'internal_domain@b', 'internal_domain@b', 'ip_address@a',
    ]);
    for (const w of warnings) assert.match(w.sample, /\*\*\*\*$/);
    assert.ok(!JSON.stringify(warnings).includes('10.12.3.4'));
  });

  it('keeps blocks separate and identical to the save-time V12 rules', () => {
    const value = { k: 'token sk-' + 'a'.repeat(24), ip: '192.168.0.10' };
    const { blocks, warnings } = scanForExport(value);
    assert.deepEqual(blocks, scanForSecrets(value));
    assert.deepEqual(blocks.map((b) => b.rule), ['generic_secret']);
    assert.deepEqual(warnings.map((w) => w.rule), ['ip_address']);
  });
});

describe('normalizeModel', () => {
  it('drops internal ids, coordinates, notes, secret-like custom keys and env values', () => {
    const n = normalizeModel(model(), { requirements });
    const json = JSON.stringify(n);
    for (const forbidden of ['cmp_', 'rel_', 'nd_', 'position', '비밀 메모', 'DB_PASSWORD', 'apiToken', 'DATABASE_URL']) {
      assert.ok(!json.includes(forbidden), `must not include ${forbidden}`);
    }
    const api = n.components.find((c) => c.name === 'Reports "API"');
    assert.deepEqual(api.custom, [{ label: 'region', value: 'ap-northeast-2' }]);
    assert.deepEqual(api.properties, [
      { label: 'Runtime', value: 'Node 24' }, { label: 'Port', value: '4000' }, { label: 'Stateless', value: 'true' },
    ]);
  });

  it('orders by Logical drawing, maps groups and requirement codes', () => {
    const n = normalizeModel(model(), { requirements });
    assert.deepEqual(n.components.map((c) => [c.ref, c.name, c.inLogical, c.group, c.groupRef]), [
      ['c1', 'Web App', true, null, null],
      ['c2', 'Reports "API"', true, 'Backend', 'g1'],
      ['c3', 'Reports DB', true, 'Data', 'g2'],
      ['c4', 'Archive', false, null, null],
    ]);
    assert.deepEqual(n.groups, [{ ref: 'g1', label: 'Backend', parent: null }, { ref: 'g2', label: 'Data', parent: 'g1' }]);
    assert.deepEqual(n.components[1].requirementCodes, ['NFR-001']);   // 대소문자 무시, 모르는 ID는 제외
    assert.equal(n.components[0].summary, '사용자 화면');
    assert.deepEqual(n.relations[1].requirementCodes, ['NFR-002']);
    assert.deepEqual(n.techStack, ['Next.js', 'Node 24', 'Node.js', 'PostgreSQL']);
    assert.deepEqual(n.requirements.nfr.map((r) => r.code), ['NFR-001', 'NFR-002']);
    assert.deepEqual(n.requirements.fr, []);   // deprecated 제외
  });

  it('handles an empty model', () => {
    const n = normalizeModel({ schemaVersion: 1, components: {}, relations: {}, views: [{ id: 'view_logical', kind: 'logical', nodes: [], edges: [] }] });
    assert.deepEqual(n, { components: [], relations: [], groups: [], techStack: [], requirements: { fr: [], nfr: [] } });
  });
});

describe('toMermaidFlowchart', () => {
  it('writes nested subgraphs, shapes, escaped labels and edge styles for Logical only', () => {
    const text = toMermaidFlowchart(normalizeModel(model(), { requirements }));
    assert.equal(text, [
      'flowchart LR',
      '  subgraph g1 ["Backend"]',
      '    subgraph g2 ["Data"]',
      '      c3[("Reports DB")]',
      '    end',
      '    c2["Reports #quot;API#quot;"]',
      '  end',
      '  c1["Web App"]',
      '  c1 -->|HTTPS| c2',
      '  c2 -->|JDBC| c3',
      '  c2 -.->|audit / log| c3',
      '',
    ].join('\n'));
    assert.ok(!text.includes('Archive'), 'components not drawn in Logical are left out');
  });
});

describe('scan store', () => {
  const binding = { userId: 'u1', projectId: 'p1', revision: 3, sections: { overview: true, nfr: false }, contentHash: contentHash('body') };

  it('verifies only the exact binding', () => {
    const store = createScanStore();
    const id = store.issue(binding);
    assert.match(id, /^scn_[0-9a-f]{24}$/);
    assert.equal(store.verify(id, { ...binding, sections: { nfr: false, overview: true } }), true);   // 키 순서 무관
    for (const changed of [{ userId: 'u2' }, { projectId: 'p2' }, { revision: 4 }, { sections: { overview: false, nfr: false } }, { contentHash: contentHash('body2') }]) {
      assert.equal(store.verify(id, { ...binding, ...changed }), false, JSON.stringify(changed));
    }
    assert.equal(store.verify('scn_unknown', binding), false);
    assert.equal(store.verify(undefined, binding), false);
  });

  it('expires after the TTL and caps the number of entries', () => {
    let t = 1000;
    const store = createScanStore({ ttlMs: 600000, max: 3, now: () => t });
    const first = store.issue(binding);
    t += 599999;
    assert.equal(store.verify(first, binding), true);
    t += 1;
    assert.equal(store.verify(first, binding), false);
    const ids = [1, 2, 3, 4].map((revision) => store.issue({ ...binding, revision }));
    assert.equal(store.size(), 3);
    assert.equal(store.verify(ids[0], { ...binding, revision: 1 }), false);   // 가장 오래된 것부터 제거
    assert.equal(store.verify(ids[3], { ...binding, revision: 4 }), true);
  });

  it('hashes content deterministically', () => {
    assert.equal(contentHash('a'), contentHash('a'));
    assert.notEqual(contentHash('a'), contentHash('b'));
  });
});
