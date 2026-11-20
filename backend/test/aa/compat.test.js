// Sprint 2 Step 1: 타입 레지스트리 단일 원본 + V6 API 동작 + Sprint 1 저장본 호환 (S2-6, S2-8)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, getTokens, deleteProjects, aaDb, USER_A, api, createProject, canonical } = require('../helpers/aa-api');

// Sprint 1 Studio가 실제로 저장하던 모양: 속성 없음(properties: {}), group·note 없음, 관계는 HTTP/sync
function sprint1SavedModel() {
  const comp = (id, type, name) => ({ id, type, layer: 'logical', name, properties: {}, requirementIds: [], decisionIds: [] });
  return {
    schemaVersion: 1,
    components: {
      cmp_3fdc7e3114: comp('cmp_3fdc7e3114', 'client', 'Client 1'),
      cmp_18c3c82c86: comp('cmp_18c3c82c86', 'service', 'Service 1'),
      cmp_2cb8724c13: comp('cmp_2cb8724c13', 'database', 'Database 1'),
    },
    relations: {
      rel_aaaaaaaaaa: { id: 'rel_aaaaaaaaaa', type: 'calls', from: 'cmp_3fdc7e3114', to: 'cmp_18c3c82c86', protocol: 'HTTP', mode: 'sync', requirementIds: [] },
      rel_bbbbbbbbbb: { id: 'rel_bbbbbbbbbb', type: 'calls', from: 'cmp_18c3c82c86', to: 'cmp_2cb8724c13', protocol: 'HTTP', mode: 'sync', requirementIds: [] },
    },
    views: [{
      id: 'view_logical', kind: 'logical', name: 'Logical',
      nodes: [
        { id: 'nd_3fdc7e3114', kind: 'component', componentId: 'cmp_3fdc7e3114', position: { x: 112, y: 176 } },
        { id: 'nd_7675cd3301', kind: 'component', componentId: 'cmp_18c3c82c86', position: { x: 128, y: 144 } },
        { id: 'nd_2cb8724c13', kind: 'component', componentId: 'cmp_2cb8724c13', position: { x: 224, y: 224 } },
      ],
      edges: [
        { id: 'ed_1111111111', relationId: 'rel_aaaaaaaaaa', sourceHandle: undefined, targetHandle: undefined },
        { id: 'ed_2222222222', relationId: 'rel_bbbbbbbbbb' },
      ],
    }],
    flows: {},
  };
}

describe('type registry single source', { skip: dbSkipReason }, () => {
  let A;
  before(async () => { A = (await getTokens()).A; });

  it('GET /api/aa/meta/types는 저장 검증(V6)이 쓰는 레지스트리와 같다', async () => {
    const { REGISTRY } = require('../../lib/aa/architecture-validator');
    const json = require('../../lib/aa/type-registry.json');
    assert.equal(REGISTRY, json);   // 같은 모듈 객체 (정의가 한 곳)
    const res = await api(A).get('/api/aa/meta/types');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, json);
  });

  it('레지스트리는 캐시하되 매번 재검증한다 (ETag → 304)', async () => {
    const res = await api(A).get('/api/aa/meta/types');
    assert.match(res.headers['cache-control'], /no-cache/);
    assert.ok(res.headers.etag);
    const again = await api(A).get('/api/aa/meta/types').set('If-None-Match', res.headers.etag);
    assert.equal(again.status, 304);
  });
});

describe('Sprint 1 draft compatibility & V6 over the API', { skip: dbSkipReason }, () => {
  const created = [];
  let A, project, url;
  before(async () => {
    A = (await getTokens()).A;
    project = await createProject(A, created, 'compat');
    url = `/api/aa/projects/${project.id}/architecture`;
    // V6 이전에 저장된 데이터처럼: API 검증을 거치지 않고 RPC로 직접 기록 (rev 1 → 2)
    const { data, error } = await aaDb().rpc('aa_save_draft', {
      p_project: project.id, p_user: USER_A, p_base_revision: 1,
      p_model: JSON.parse(JSON.stringify(sprint1SavedModel())),
    });
    if (error || data.conflict) throw new Error('seed failed ' + JSON.stringify(error || data));
  });
  after(async () => { await deleteProjects(created); });

  it('Sprint 1 저장본을 열면 값이 그대로다 (기본값 자동 추가 없음)', async () => {
    const g = await api(A).get(url);
    assert.equal(g.status, 200);
    assert.equal(g.body.data.revision, 2);
    const expected = JSON.parse(JSON.stringify(sprint1SavedModel()));
    assert.deepEqual(canonical(g.body.data.model), canonical(expected));
    assert.deepEqual(g.body.data.model.components.cmp_18c3c82c86.properties, {});   // stateless 기본값이 생기지 않음
  });

  it('그대로 다시 저장하면 200, 다시 열어도 동일', async () => {
    const g = await api(A).get(url);
    const s = await api(A).put(`${url}/draft`, { baseRevision: g.body.data.revision, model: g.body.data.model });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.data.revision, 3);
    assert.deepEqual(s.body.warnings, []);
    const g2 = await api(A).get(url);
    assert.deepEqual(canonical(g2.body.data.model), canonical(g.body.data.model));
  });

  it('스키마에 맞는 속성을 넣으면 200', async () => {
    const g = await api(A).get(url);
    const m = g.body.data.model;
    m.components.cmp_18c3c82c86.properties = { runtime: 'Node 22', port: 4000, stateless: true };
    m.components.cmp_2cb8724c13.properties = { engine: 'postgres', ha: 'none' };
    const s = await api(A).put(`${url}/draft`, { baseRevision: g.body.data.revision, model: m });
    assert.equal(s.status, 200, JSON.stringify(s.body));
  });

  it('미등록 타입·속성, 잘못된 값 → 400 VALIDATION_FAILED, details에 V6', async () => {
    const g = await api(A).get(url);
    const cases = [
      (m) => { m.components.cmp_18c3c82c86.type = 'mainframe'; },
      (m) => { m.components.cmp_18c3c82c86.properties = { framework: 'Express' }; },
      (m) => { m.components.cmp_18c3c82c86.properties = { port: 'abc' }; },
      (m) => { m.components.cmp_2cb8724c13.properties = { engine: 'oracle' }; },
      (m) => { m.components.cmp_18c3c82c86.type = 'note'; },
    ];
    for (const mutate of cases) {
      const m = structuredClone(g.body.data.model);
      mutate(m);
      const s = await api(A).put(`${url}/draft`, { baseRevision: g.body.data.revision, model: m });
      assert.equal(s.status, 400);
      assert.equal(s.body.code, 'VALIDATION_FAILED');
      assert.ok(s.body.details.some((e) => e.rule === 'V6'), JSON.stringify(s.body.details));
    }
    const after = await api(A).get(url);
    assert.equal(after.body.data.revision, g.body.data.revision);   // 거부된 저장은 반영되지 않음
  });

  it('group·note 노드는 컴포넌트 없이 저장된다', async () => {
    const g = await api(A).get(url);
    const m = g.body.data.model;
    m.views[0].nodes.push(
      { id: 'nd_group0001', kind: 'group', label: 'Platform', position: { x: 80, y: 120 }, width: 360, height: 220 },
      { id: 'nd_note00001', kind: 'note', text: '조회는 캐시 우선', position: { x: 480, y: 120 } },
    );
    const s = await api(A).put(`${url}/draft`, { baseRevision: g.body.data.revision, model: m });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    const g2 = await api(A).get(url);
    const kinds = g2.body.data.model.views[0].nodes.map((n) => n.kind).sort();
    assert.deepEqual(kinds, ['component', 'component', 'component', 'group', 'note']);
    assert.equal(Object.keys(g2.body.data.model.components).length, 3);   // 컴포넌트는 늘지 않음
  });
});
