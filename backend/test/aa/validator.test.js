// architecture-validator 단위 테스트 — DB 불필요, 항상 실행
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateModel, MODEL_MAX_BYTES } = require('../../lib/aa/architecture-validator');
const { scanForSecrets } = require('../../lib/aa/sensitive-scan');
const { sampleModel, largeModel } = require('../helpers/aa-api');

const rules = (r) => r.errors.map((e) => e.rule);

describe('validateModel', () => {
  it('정상 샘플(3노드)과 100노드 모델을 통과시킨다', () => {
    for (const m of [sampleModel(), largeModel(100)]) {
      const r = validateModel(m);
      assert.deepEqual(r.errors, []);
      assert.equal(r.tooLarge, null);
    }
  });

  it('객체가 아니거나 구조가 틀리면 STRUCTURE', () => {
    assert.deepEqual(rules(validateModel(null)), ['STRUCTURE']);
    assert.ok(rules(validateModel({ schemaVersion: 1, components: [], relations: {}, views: [] })).includes('STRUCTURE'));
  });

  it('V1: 접두사·키 불일치·중복 id', () => {
    const m = sampleModel();
    m.components.api = { ...m.components.cmp_api00001, id: 'api' };
    assert.ok(rules(validateModel(m)).includes('V1'));
    const m2 = sampleModel();
    m2.views[0].nodes[1].id = 'nd_1';
    assert.ok(validateModel(m2).errors.some((e) => e.rule === 'V1' && /중복/.test(e.message)));
  });

  it('V2: 관계 끝점이 없는 컴포넌트', () => {
    const m = sampleModel();
    m.relations.rel_x = { id: 'rel_x', type: 'calls', from: 'cmp_api00001', to: 'cmp_missing', requirementIds: [] };
    assert.ok(rules(validateModel(m)).includes('V2'));
  });

  it('V3: 노드가 없는 컴포넌트를 가리키거나, 한 View에 같은 컴포넌트 노드가 둘', () => {
    const m = sampleModel();
    m.views[0].nodes.push({ id: 'nd_9', kind: 'component', componentId: 'cmp_ghost', position: { x: 0, y: 0 } });
    assert.ok(rules(validateModel(m)).includes('V3'));
    const m2 = sampleModel();
    m2.views[0].nodes.push({ id: 'nd_dup', kind: 'component', componentId: 'cmp_api00001', position: { x: 1, y: 1 } });
    assert.ok(rules(validateModel(m2)).includes('V3'));
  });

  it('V4: 엣지의 관계 끝 노드가 같은 View에 없음', () => {
    const m = sampleModel();
    m.views[0].nodes = m.views[0].nodes.filter((n) => n.componentId !== 'cmp_db000001');
    assert.ok(rules(validateModel(m)).includes('V4'));
  });

  it('V5: parentId가 group이 아니거나 순환', () => {
    const m = sampleModel();
    m.views[0].nodes[0].parentId = 'nd_2';
    assert.ok(rules(validateModel(m)).includes('V5'));
    const m2 = sampleModel();
    m2.views[0].nodes.push(
      { id: 'nd_g1', kind: 'group', position: { x: 0, y: 0 }, parentId: 'nd_g2' },
      { id: 'nd_g2', kind: 'group', position: { x: 0, y: 0 }, parentId: 'nd_g1' },
    );
    assert.ok(validateModel(m2).errors.some((e) => e.rule === 'V5' && /순환/.test(e.message)));
  });

  it('V7: 어느 View에도 없는 컴포넌트는 경고만', () => {
    const m = sampleModel();
    m.components.cmp_orphan = { id: 'cmp_orphan', type: 'service', layer: 'logical', name: 'Orphan', properties: {}, requirementIds: [], decisionIds: [] };
    const r = validateModel(m);
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => w.rule === 'V7'));
  });

  it('V8: 1MB 초과 또는 컴포넌트 500개 초과는 tooLarge', () => {
    const m = sampleModel();
    m.components.cmp_api00001.description = 'x'.repeat(MODEL_MAX_BYTES);
    assert.ok(validateModel(m).tooLarge.bytes > MODEL_MAX_BYTES);
    const m2 = sampleModel();
    for (let i = 0; i < 501; i++) m2.components[`cmp_k${i}`] = { id: `cmp_k${i}`, type: 'service', layer: 'logical', name: 'k', properties: {} };
    assert.equal(validateModel(m2).tooLarge.components, 504);
  });

  it('V12: 키·토큰 패턴은 거부하고 값은 마스킹', () => {
    const m = sampleModel();
    m.components.cmp_api00001.properties.key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const r = validateModel(m);
    const hit = r.errors.find((e) => e.rule === 'V12');
    assert.ok(hit);
    assert.ok(!hit.message.includes('ABCDEFGHIJKLMNOP'));
  });
});

describe('V6: 타입 레지스트리 검증', () => {
  const { REGISTRY } = require('../../lib/aa/architecture-validator');
  const v6 = (m) => validateModel(m).errors.filter((e) => e.rule === 'V6');

  it('레지스트리는 Logical 11 + Deployment 8 + K8s 5 + AWS 7 + Ops 8 = 39개 타입이고 group·note만 컴포넌트가 아니다 (Sprint 11 v5)', () => {
    assert.equal(Object.keys(REGISTRY.types).length, 39);
    assert.equal(REGISTRY.version, 5);
    const dep = Object.entries(REGISTRY.types).filter(([k]) => k.startsWith('dep.'));
    assert.deepEqual(dep.filter(([, d]) => d.container).map(([k]) => k).sort(), ['dep.environment', 'dep.platform', 'dep.vm', 'dep.zone']);
    assert.deepEqual(dep.filter(([, d]) => d.realizes).map(([k]) => k).sort(), ['dep.managed_auth', 'dep.managed_db', 'dep.process']);
    assert.ok(dep.every(([, d]) => d.layer === 'deployment' && d.views.length === 1 && d.views[0] === 'deployment'));
    const nonComponent = Object.entries(REGISTRY.types).filter(([, d]) => d.nodeKind !== 'component').map(([k]) => k).sort();
    assert.deepEqual(nonComponent, ['group', 'note']);
    for (const d of Object.values(REGISTRY.types)) for (const pd of d.properties) assert.ok(REGISTRY.propertyTypes.includes(pd.type), pd.key);
  });

  it('속성이 비어 있거나 일부만 있어도 통과 (모든 속성은 선택)', () => {
    const m = sampleModel();
    m.components.cmp_api00001.properties = {};
    assert.deepEqual(v6(m), []);
    m.components.cmp_api00001.properties = { port: 8080 };
    assert.deepEqual(v6(m), []);
  });

  it('유효한 속성 값은 통과', () => {
    const m = sampleModel();
    m.components.cmp_api00001.properties = { runtime: 'Java 21', port: 8080, stateless: false, replicas: 2 };
    m.components.cmp_db000001.properties = { engine: 'postgres', version: '16', ha: 'replica' };
    m.components.cmp_client01.properties = { channel: 'web' };
    assert.deepEqual(validateModel(m).errors, []);
  });

  it('등록되지 않은 타입 → V6', () => {
    const m = sampleModel();
    m.components.cmp_api00001.type = 'mainframe';
    assert.ok(v6(m).some((e) => e.path.endsWith('.type')));
  });

  it('group·note 타입으로 컴포넌트를 만들면 → V6', () => {
    for (const t of ['group', 'note']) {
      const m = sampleModel();
      m.components.cmp_api00001.type = t;
      assert.ok(v6(m).some((e) => /노드입니다/.test(e.message)), t);
    }
  });

  it('스키마에 없는 속성 키 → V6, 같은 값을 custom에 두면 통과', () => {
    const m = sampleModel();
    m.components.cmp_api00001.properties = { framework: 'Spring' };
    assert.ok(v6(m).some((e) => e.path.endsWith('properties.framework')));
    m.components.cmp_api00001.properties = {};
    m.components.cmp_api00001.custom = { framework: 'Spring' };
    assert.deepEqual(validateModel(m).errors, []);
  });

  it('잘못된 값: 타입·정수·범위·enum·null → 각각 V6', () => {
    const bad = [
      { port: '8080' }, { port: 80.5 }, { port: 0 }, { port: 70000 },
      { stateless: 'yes' }, { replicas: -1 }, { runtime: 21 }, { runtime: null },
    ];
    for (const props of bad) {
      const m = sampleModel();
      m.components.cmp_api00001.properties = props;
      assert.equal(v6(m).length, 1, JSON.stringify(props));
    }
    const m = sampleModel();
    m.components.cmp_db000001.properties = { engine: 'oracle' };
    assert.ok(v6(m).some((e) => /다음 중 하나/.test(e.message)));
  });

  it('layer가 레지스트리와 다르면 → V6', () => {
    const m = sampleModel();
    m.components.cmp_api00001.layer = 'kubernetes';
    assert.ok(v6(m).some((e) => e.path.endsWith('.layer')));
  });

  it('custom 값은 문자열만', () => {
    const m = sampleModel();
    m.components.cmp_api00001.custom = { n: 1 };
    assert.ok(validateModel(m).errors.some((e) => e.path.endsWith('.custom')));
  });
});

describe('group·note 노드 규칙', () => {
  const withNodes = (...nodes) => { const m = sampleModel(); m.views[0].nodes.push(...nodes); return m; };

  it('componentId 없는 group(크기 있음)·note(글 있음)는 통과', () => {
    const m = withNodes(
      { id: 'nd_g1', kind: 'group', label: 'Platform', position: { x: 0, y: 0 }, width: 400, height: 240 },
      { id: 'nd_note1', kind: 'note', text: '조회는 캐시 우선', position: { x: 10, y: 300 } },
    );
    m.views[0].nodes[1].parentId = 'nd_g1';   // API 노드를 그룹 안에
    assert.deepEqual(validateModel(m).errors, []);
  });

  it('group 크기 누락·80 미만 → V3', () => {
    for (const size of [{}, { width: 400 }, { width: 40, height: 200 }]) {
      const m = withNodes({ id: 'nd_g1', kind: 'group', position: { x: 0, y: 0 }, ...size });
      assert.ok(validateModel(m).errors.some((e) => e.rule === 'V3'), JSON.stringify(size));
    }
  });

  it('note 글 없음·너무 김·componentId 있음 → V3', () => {
    for (const extra of [{ text: '' }, { text: 'x'.repeat(2001) }, { text: 'ok', componentId: 'cmp_api00001' }]) {
      const m = withNodes({ id: 'nd_note1', kind: 'note', position: { x: 0, y: 0 }, ...extra });
      assert.ok(validateModel(m).errors.some((e) => e.rule === 'V3'), JSON.stringify(extra).slice(0, 40));
    }
  });

  it('note 글의 키·토큰도 V12로 막는다', () => {
    const m = withNodes({ id: 'nd_note1', kind: 'note', position: { x: 0, y: 0 }, text: 'key=AKIA' + 'ABCDEFGHIJKLMNOP' });
    assert.ok(validateModel(m).errors.some((e) => e.rule === 'V12'));
  });
});

describe('scanForSecrets', () => {
  it('키·JWT·PEM을 찾고 일반 문자열은 통과', () => {
    const fakeJwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghijklmnop'].join('.');
    const hits = scanForSecrets({ a: 'sk-' + 'a'.repeat(24), b: [fakeJwt], c: '-----BEGIN RSA PRIVATE KEY-----', d: 'Spring Boot on port 8080' });
    assert.deepEqual(hits.map((h) => h.rule).sort(), ['generic_secret', 'jwt', 'pem']);
    assert.ok(hits.every((h) => h.sample.endsWith('****')));
  });
});
