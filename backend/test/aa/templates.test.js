// Sprint 4 Step 4 — 샘플 프로젝트 sample-reports (S4-6)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { validateModel } = require('../../lib/aa/architecture-validator');
const { scanForExport } = require('../../lib/aa/sensitive-scan');
const sample = require('../../lib/aa/templates/sample-reports');
const { dbSkipReason, getTokens, deleteProjects, api, canonical, TEST_PREFIX } = require('../helpers/aa-api');

describe('sample-reports template (offline)', () => {
  it('passes the save validator and has no secrets, IPs, emails or URLs', () => {
    const model = sample.model();
    const result = validateModel(model);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    const scan = scanForExport({ model, readme: sample.readmeMd });
    assert.deepEqual(scan, { blocks: [], warnings: [] });
    assert.ok(!/https?:\/\//.test(JSON.stringify(model) + sample.readmeMd));
  });

  it('has 4 Logical components, 1 group with 2 members and the 4 listed relations (deployment views: deployment-export.test.js)', () => {
    const full = sample.model();
    // Sprint 7: 배치안 컴포넌트·관계를 뺀 Logical 부분만 비교
    const model = { ...full, components: Object.fromEntries(Object.entries(full.components).filter(([, c]) => c.layer === 'logical')) };
    model.relations = Object.fromEntries(Object.entries(full.relations).filter(([, r]) => model.components[r.from] && model.components[r.to]));
    const names = (id) => model.components[id].name;
    assert.deepEqual(Object.values(model.components).map((c) => `${c.name}:${c.type}`).sort(),
      ['Auth:external', 'Reports API:service', 'Reports DB:database', 'Web App:client']);
    const nodes = model.views[0].nodes;
    const group = nodes.filter((n) => n.kind === 'group');
    assert.equal(group.length, 1);
    assert.equal(group[0].label, 'Backend');
    assert.deepEqual(nodes.filter((n) => n.parentId === group[0].id).map((n) => names(n.componentId)).sort(), ['Reports API', 'Reports DB']);
    assert.deepEqual(Object.values(model.relations).map((r) => `${names(r.from)}>${names(r.to)}:${r.protocol}`).sort(), [
      'Reports API>Auth:HTTPS', 'Reports API>Reports DB:JDBC', 'Web App>Auth:HTTPS', 'Web App>Reports API:HTTPS',
    ]);
    assert.equal(model.views[0].edges.length, 4);
    assert.notEqual(sample.model(), sample.model(), 'a fresh model object each time');
  });
});

describe('POST /projects with template', { skip: dbSkipReason }, () => {
  const created = [];
  let A;
  before(async () => { A = (await getTokens()).A; });
  after(async () => { await deleteProjects(created); });

  it('creates the sample with its model and overview at revision 1', async () => {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} sample ${Date.now()}`, template: 'sample-reports' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(res.body.data.id);
    assert.equal(res.body.data.readmeMd, sample.readmeMd);
    const d = await api(A).get(`/api/aa/projects/${res.body.data.id}/architecture`);
    assert.equal(d.body.data.revision, 1);
    // Sprint 5: 시드 요구사항 UUID로 연결된 모델 (sample-seed.test.js에서 코드·연결 상세 검증)
    const reqs = (await api(A).get(`/api/aa/projects/${res.body.data.id}/requirements`)).body.data;
    const links = Object.fromEntries(sample.requirements.map((r, i) => [r.key, reqs[i].id]));
    assert.deepEqual(canonical(d.body.data.model), canonical(sample.model(links)));
  });

  it('keeps the explicit overview when one is given', async () => {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} sample-own ${Date.now()}`, template: 'sample-reports', readmeMd: '## 내 개요' });
    assert.equal(res.status, 201);
    created.push(res.body.data.id);
    assert.equal(res.body.data.readmeMd, '## 내 개요');
  });

  it('rejects unknown templates, including inherited object keys', async () => {
    for (const template of ['sample-airline', 'constructor', '__proto__', 42]) {
      const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} bad ${Date.now()}`, template });
      assert.equal(res.status, 400, `${template}: ${JSON.stringify(res.body)}`);
      if (res.body?.data?.id) created.push(res.body.data.id);
    }
  });
});
