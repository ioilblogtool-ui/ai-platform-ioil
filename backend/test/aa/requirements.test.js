const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { dbSkipReason, getTokens, deleteProjects, aaDb, api, createProject, sampleModel } = require('../helpers/aa-api');
const { reconcile } = require('../../lib/aa/requirement-refs');
const { validateModel } = require('../../lib/aa/architecture-validator');

it('V9 flags malformed component and relation reference IDs', () => {
  const model = sampleModel();
  model.components.cmp_client01.requirementIds = ['invalid'];
  model.relations.rel_a.requirementIds = null;
  assert.deepEqual(validateModel(model).errors.filter(({ rule }) => rule === 'V9').map(({ path }) => path), [
    'components.cmp_client01.requirementIds[0]', 'relations.rel_a.requirementIds',
  ]);
});

it('V9 propagates requirement lookup failures', async () => {
  const model = sampleModel();
  model.relations.rel_a.requirementIds = [randomUUID()];
  const error = new Error('lookup unavailable');
  const query = { select: () => query, eq: () => query, in: async () => ({ error }) };
  await assert.rejects(reconcile({ from: () => query }, 'project', 'user', model), error);
});

describe('AA requirements and V9', { skip: dbSkipReason }, () => {
  const created = [];
  const path = (id) => `/api/aa/projects/${id}`;
  const requirements = (id) => `${path(id)}/requirements`;
  const draft = (id) => `${path(id)}/architecture/draft`;
  let A;
  let B;

  before(async () => { ({ A, B } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  it('allocates concurrent codes by project and kind, filters, updates, and deletes', async () => {
    const { id } = await createProject(A, created, 'requirements-crud');
    const url = requirements(id);
    const results = await Promise.all([
      api(A).post(url, { title: 'List reports', kind: 'fr' }),
      api(A).post(url, { title: 'Filter reports', kind: 'fr' }),
      api(A).post(url, { title: 'Latency', kind: 'nfr', category: 'performance', priority: 'must', sortOrder: 2 }),
    ]);
    results.forEach(({ status, body }) => assert.equal(status, 201, JSON.stringify(body)));
    assert.deepEqual(results.map(({ body }) => body.data.code).sort(), ['FR-001', 'FR-002', 'NFR-001']);
    const req = results[2].body.data;
    const list = await api(A).get(`${url}?kind=nfr&category=performance&status=active`);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body, { data: [req], total: 1 });
    const reqUrl = `${url}/${req.id}`;
    assert.equal((await api(A).patch(reqUrl, { kind: 'fr' })).status, 400);
    assert.equal((await api(A).patch(reqUrl, { code: 'NFR-200' })).status, 400);
    const edited = await api(A).patch(reqUrl, { target: '300 ms', status: 'deprecated' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.status, 'deprecated');
    assert.equal(edited.body.data.target, '300 ms');
    assert.equal((await api(A).del(reqUrl)).status, 204);
    assert.equal((await api(A).del(reqUrl)).status, 404);
  });

  it('scopes rows and V9 to the current project, protects referenced items, and recovers a stale reference', async () => {
    const a = await createProject(A, created, 'requirements-scope-a');
    const b = await createProject(B, created, 'requirements-scope-b');
    const own = await api(A).post(requirements(a.id), { title: 'Mine', kind: 'fr' });
    const foreign = await api(B).post(requirements(b.id), { title: 'Theirs', kind: 'fr' });
    assert.equal(own.status, 201);
    assert.equal(foreign.status, 201);
    const id = own.body.data.id;
    const other = foreign.body.data.id;
    const ownUrl = `${requirements(a.id)}/${id}`;
    assert.equal((await api(A).get(requirements(b.id))).status, 404);
    assert.equal((await api(A).patch(`${requirements(a.id)}/${other}`, { title: 'Wrong' })).status, 404);
    assert.equal((await api(A).del(`${requirements(a.id)}/${other}`)).status, 404);

    const model = sampleModel();
    model.relations.rel_a.requirementIds = ['invalid'];
    assert.equal((await api(A).put(draft(a.id), { baseRevision: 1, model })).status, 400);
    assert.equal((await api(A).get(`${path(a.id)}/architecture`)).body.data.revision, 1);
    const missing = randomUUID();
    model.components.cmp_client01.requirementIds = [id, other, missing];
    model.relations.rel_a.requirementIds = [id];
    const saved = await api(A).put(draft(a.id), { baseRevision: 1, model });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.revision, 2);
    assert.deepEqual(saved.body.warnings.find(({ code }) => code === 'V9').removedIds, [other, missing]);
    const referenced = await api(A).del(`${ownUrl}?force=true`);
    assert.equal(referenced.status, 409);
    assert.equal(referenced.body.code, 'IN_USE');
    assert.deepEqual(referenced.body.details, { componentIds: ['cmp_client01'], relationIds: ['rel_a'] });

    // Simulate a deletion occurring between the reference check and Draft write.
    const { error } = await aaDb().from('aa_requirements').delete().eq('id', id).eq('project_id', a.id);
    assert.ifError(error);
    const loaded = await api(A).get(`${path(a.id)}/architecture`);
    assert.equal(loaded.status, 200);
    assert.deepEqual(loaded.body.data.model.components.cmp_client01.requirementIds, []);
    assert.deepEqual(loaded.body.data.model.relations.rel_a.requirementIds, []);
    assert.ok(loaded.body.warnings.some(({ code }) => code === 'V9'));
    const recovered = await api(A).put(draft(a.id), { baseRevision: 2, model: loaded.body.data.model });
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.data.revision, 3);
  });
});
