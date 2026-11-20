// Supertest 래퍼 + 테스트용 모델 빌더
const env = require('./aa-env');   // 반드시 app보다 먼저
const request = require('supertest');
const app = require('../../app');

function api(token) {
  const withAuth = (req) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
  return {
    get: (url) => withAuth(request(app).get(url)),
    post: (url, body) => withAuth(request(app).post(url)).send(body),
    patch: (url, body) => withAuth(request(app).patch(url)).send(body),
    put: (url, body) => withAuth(request(app).put(url)).send(body),
    del: (url) => withAuth(request(app).delete(url)),
    raw: (method, url) => withAuth(request(app)[method](url)),
  };
}

// 프로젝트를 만들고 id를 created 배열에 기록 (after()에서 삭제)
async function createProject(token, created, suffix = '') {
  const name = `${env.TEST_PREFIX} ${suffix || 'project'} ${Date.now()}`;
  const res = await api(token).post('/api/aa/projects', { name });
  if (res.status !== 201) throw new Error(`프로젝트 생성 실패 ${res.status} ${JSON.stringify(res.body)}`);
  created.push(res.body.data.id);
  return res.body.data;
}

function emptyModel() {
  return { schemaVersion: 1, components: {}, relations: {}, views: [{ id: 'view_logical', kind: 'logical', name: 'Logical', nodes: [], edges: [] }], flows: {} };
}

// Client → API → DB 3노드 샘플
function sampleModel() {
  const m = emptyModel();
  const comp = (id, type, name, extra = {}) => ({ id, type, layer: 'logical', name, properties: {}, requirementIds: [], decisionIds: [], ...extra });
  m.components.cmp_client01 = comp('cmp_client01', 'client', 'Web App');
  m.components.cmp_api00001 = comp('cmp_api00001', 'service', 'Reports API', { technology: 'Express', properties: { port: 4000 } });
  m.components.cmp_db000001 = comp('cmp_db000001', 'database', 'Reports DB');
  m.relations.rel_a = { id: 'rel_a', type: 'calls', from: 'cmp_client01', to: 'cmp_api00001', protocol: 'HTTPS', mode: 'sync', requirementIds: [] };
  m.relations.rel_b = { id: 'rel_b', type: 'calls', from: 'cmp_api00001', to: 'cmp_db000001', protocol: 'Other', mode: 'sync', requirementIds: [] };
  m.views[0].nodes = [
    { id: 'nd_1', kind: 'component', componentId: 'cmp_client01', position: { x: 0, y: 96 } },
    { id: 'nd_2', kind: 'component', componentId: 'cmp_api00001', position: { x: 320.5, y: 96 } },
    { id: 'nd_3', kind: 'component', componentId: 'cmp_db000001', position: { x: 640, y: 96 } },
  ];
  m.views[0].edges = [{ id: 'ed_1', relationId: 'rel_a' }, { id: 'ed_2', relationId: 'rel_b' }];
  return m;
}

// 노드 100개·관계 99개 (본문 100KB 이상)
function largeModel(n = 100) {
  const m = sampleModel();
  for (let i = 0; i < n; i++) {
    const id = `cmp_n${i}`;
    m.components[id] = { id, type: 'service', layer: 'logical', name: `Service ${i}`, technology: 'Spring Boot', description: `Handles domain requests for module ${i}. `.repeat(30), properties: { runtime: 'Java 21', port: 8000 + i }, requirementIds: [], decisionIds: [] };
    m.views[0].nodes.push({ id: `nd_n${i}`, kind: 'component', componentId: id, position: { x: (i % 10) * 220, y: 300 + Math.floor(i / 10) * 120 } });
  }
  for (let i = 0; i < n - 1; i++) {
    const rid = `rel_n${i}`;
    m.relations[rid] = { id: rid, type: 'calls', from: `cmp_n${i}`, to: `cmp_n${i + 1}`, protocol: 'HTTP', mode: 'sync', requirementIds: [] };
    m.views[0].edges.push({ id: `ed_n${i}`, relationId: rid });
  }
  return m;
}

// 키 순서와 무관한 비교용
function canonical(o) {
  if (Array.isArray(o)) return o.map(canonical);
  if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).sort().map((k) => [k, canonical(o[k])]));
  return o;
}

module.exports = { ...env, api, app, createProject, emptyModel, sampleModel, largeModel, canonical };
