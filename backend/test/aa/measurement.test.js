// Sprint 8 Step 4 — NFR 측정 기준 (REQ-06, S8-5)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, getTokens, deleteProjects, api, TEST_PREFIX } = require('../helpers/aa-api');

describe('측정 기준 API (DB)', { skip: dbSkipReason }, () => {
  const created = [];
  let A, B, id, nfr, fr, otherFlow;
  const P = () => `/api/aa/projects/${id}`;
  before(async () => {
    ({ A, B } = await getTokens());
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} measurement ${Date.now()}`, template: 'sample-reports' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    id = res.body.data.id;
    created.push(id);
    const reqs = (await api(A).get(`${P()}/requirements`)).body.data;
    nfr = reqs.find((r) => r.code === 'NFR-001');
    fr = reqs.find((r) => r.kind === 'fr');
    // 다른 프로젝트의 흐름 id
    const other = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} measurement-other ${Date.now()}`, template: 'sample-reports' });
    created.push(other.body.data.id);
    const d = (await api(A).get(`/api/aa/projects/${other.body.data.id}/architecture`)).body.data;
    d.model.flows.flw_otherflow1 = { ...d.model.flows.flw_reportlist, id: 'flw_otherflow1', requirementIds: [] };
    assert.equal((await api(A).put(`/api/aa/projects/${other.body.data.id}/architecture/draft`, { baseRevision: d.revision, model: d.model })).status, 200);
    otherFlow = 'flw_otherflow1';
  });
  after(async () => { await deleteProjects(created); });
  const patch = (reqId, body, token = A) => api(token).patch(`${P()}/requirements/${reqId}`, body);

  it('sample NFR-001 comes with its measurement; others are {}', () => {
    assert.deepEqual(nfr.measurement, { flowId: 'flw_reportlist', endpoint: 'GET /api/my-ai/reports', environment: 'staging', load: '동시 20명 · 5분', method: 'k6 http_req_duration p95' });
    assert.deepEqual(fr.measurement, {});
  });

  it('validates shape, length, NFR-only and secrets', async () => {
    assert.equal((await patch(fr.id, { measurement: { environment: 'staging' } })).status, 400, 'FR');
    assert.equal((await patch(nfr.id, { measurement: { environment: 'x'.repeat(201) } })).status, 400);
    assert.equal((await patch(nfr.id, { measurement: { unknown: 'x' } })).status, 400);
    assert.equal((await patch(nfr.id, { measurement: { flowId: 'flw_bad' } })).status, 400);
    assert.equal((await patch(nfr.id, { measurement: 'staging' })).status, 400);
    const secret = await patch(nfr.id, { measurement: { method: `k6 with sk-${'a'.repeat(32)}` } });
    assert.equal(secret.status, 400);
    assert.equal(secret.body.code, 'SENSITIVE_DATA_DETECTED');
    assert.equal((await patch(fr.id, { measurement: {} })).status, 200, 'empty is allowed for FR');
    assert.equal((await patch(nfr.id, { measurement: { environment: 'prod' } }, B)).status, 404, 'other user');
  });

  it('checks a new flowId against this Draft only; keeps a dangling one that did not change', async () => {
    assert.equal((await patch(nfr.id, { measurement: { flowId: otherFlow } })).status, 400, 'flow of another project');
    // 흐름을 지워 끊긴 연결을 만든다
    const d = (await api(A).get(`${P()}/architecture`)).body.data;
    delete d.model.flows.flw_reportlist;
    assert.equal((await api(A).put(`${P()}/architecture/draft`, { baseRevision: d.revision, model: d.model })).status, 200);
    const kept = await patch(nfr.id, { measurement: { ...nfr.measurement, environment: 'prod' } });
    assert.equal(kept.status, 200, 'unchanged dangling flowId is kept');
    assert.equal(kept.body.data.measurement.flowId, 'flw_reportlist');
    assert.equal(kept.body.data.measurement.environment, 'prod');
    const cleared = await patch(nfr.id, { measurement: { endpoint: ' GET /api/my-ai/reports ', environment: '' } });
    assert.deepEqual(cleared.body.data.measurement, { endpoint: 'GET /api/my-ai/reports' }, 'trimmed, empty keys dropped, flow unlinked');
    assert.deepEqual((await patch(nfr.id, { measurement: null })).body.data.measurement, {});
  });

  it('create accepts measurement for NFR', async () => {
    const r = await api(A).post(`${P()}/requirements`, { kind: 'nfr', title: '측정 있는 NFR', priority: 'should', measurement: { environment: 'staging' } });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.data.measurement, { environment: 'staging' });
    assert.equal((await api(A).post(`${P()}/requirements`, { kind: 'fr', title: 'FR', measurement: { environment: 'x' } })).status, 400);
  });
});
