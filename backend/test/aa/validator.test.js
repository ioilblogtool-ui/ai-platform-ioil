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

describe('scanForSecrets', () => {
  it('키·JWT·PEM을 찾고 일반 문자열은 통과', () => {
    const fakeJwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abcdefghijklmnop'].join('.');
    const hits = scanForSecrets({ a: 'sk-' + 'a'.repeat(24), b: [fakeJwt], c: '-----BEGIN RSA PRIVATE KEY-----', d: 'Spring Boot on port 8080' });
    assert.deepEqual(hits.map((h) => h.rule).sort(), ['generic_secret', 'jwt', 'pem']);
    assert.ok(hits.every((h) => h.sample.endsWith('****')));
  });
});
