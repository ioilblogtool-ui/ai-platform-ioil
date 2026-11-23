// Sprint 8 Step 3 — API Flow: V10·V14, 요구사항 참조 경로, 의미 해시·요약·Diff (D-25, S8-4·S8-6)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const sample = require('../../lib/aa/templates/sample-reports');
const { validateModel } = require('../../lib/aa/architecture-validator');
const { modelHash } = require('../../lib/aa/model-canon');
const { diffModels, summarize, hasSemanticChanges } = require('../../lib/aa/graph-diff');
const { buildSnapshot } = require('../../lib/aa/requirements-snapshot');
const { references } = require('../../lib/aa/requirement-refs');
const { dbSkipReason, getTokens, deleteProjects, api, TEST_PREFIX } = require('../helpers/aa-api');

const R1 = '11111111-1111-4111-8111-111111111111';
const R3 = '33333333-3333-4333-8333-333333333333';
const R9 = '99999999-9999-4999-8999-999999999999';
const base = () => sample.model({ nfr_latency: R1, fr_monthly_report: R3 });
const flow = (m) => m.flows.flw_reportlist;
const errs = (m) => validateModel(m).errors.map((e) => `${e.rule}:${e.path}`);

describe('V10·V14', () => {
  it('accepts the sample flow', () => assert.deepEqual(validateModel(base()).errors, []));

  for (const [name, change, expected] of [
    ['unknown participant', (m) => { flow(m).participantIds[3] = 'cmp_nope'; }, 'V10:flows.flw_reportlist.participantIds[3]'],
    ['deployment participant', (m) => { flow(m).participantIds[3] = 'cmp_paas_db'; }, 'V10:flows.flw_reportlist.participantIds[3]'],
    ['duplicate participant', (m) => { flow(m).participantIds[3] = 'cmp_web_app'; }, 'V10:flows.flw_reportlist.participantIds'],
    ['auth role outside participants', (m) => { flow(m).participantIds = ['cmp_web_app', 'cmp_reports_api']; flow(m).auth = { tokenIssuer: 'cmp_auth' }; }, 'V10:flows.flw_reportlist.auth.tokenIssuer'],
    ['unknown auth role', (m) => { flow(m).auth.owner = 'cmp_auth'; }, 'V14:flows.flw_reportlist.auth.owner'],
    ['key ≠ id', (m) => { flow(m).id = 'flw_otherother'; }, 'V14:flows.flw_reportlist.id'],
    ['bad flow id', (m) => { m.flows.flw_x = { ...flow(m), id: 'flw_x' }; }, 'V14:flows.flw_x.id'],
    ['one participant', (m) => { flow(m).participantIds = ['cmp_web_app']; flow(m).auth = {}; }, 'V14:flows.flw_reportlist.participantIds'],
    ['no success outcome', (m) => { flow(m).outcomes = [flow(m).outcomes[1]]; }, 'V14:flows.flw_reportlist.outcomes'],
    ['duplicate outcome id', (m) => { flow(m).outcomes[1].id = 'out_ok2000'; }, 'V14:flows.flw_reportlist.outcomes[1].id'],
    ['bad cause', (m) => { flow(m).outcomes[1].cause = 'cosmic'; }, 'V14:flows.flw_reportlist.outcomes[1].cause'],
    ['bad method', (m) => { flow(m).endpoint.method = 'FETCH'; }, 'V14:flows.flw_reportlist.endpoint'],
    ['path without slash', (m) => { flow(m).endpoint.path = 'api/x'; }, 'V14:flows.flw_reportlist.endpoint'],
    ['path with space', (m) => { flow(m).endpoint.path = '/api/a b'; }, 'V14:flows.flw_reportlist.endpoint'],
    ['name too long', (m) => { flow(m).name = 'x'.repeat(81); }, 'V14:flows.flw_reportlist.name'],
    ['mermaid over 32KB (UTF-8)', (m) => { flow(m).mermaid = '가'.repeat(11000); }, 'V14:flows.flw_reportlist.mermaid'],
    ['unknown key', (m) => { flow(m).steps = []; }, 'V14:flows.flw_reportlist.steps'],
    ['bad requirement id', (m) => { flow(m).requirementIds = ['nope']; }, 'V9:flows.flw_reportlist.requirementIds[0]'],
  ]) {
    it(`rejects ${name}`, () => {
      const m = base();
      change(m);
      assert.ok(errs(m).includes(expected), JSON.stringify(validateModel(m).errors));
    });
  }

  it('limits flows to 30 and keeps 10,900 Hangul characters under 32KB', () => {
    const m = base();
    flow(m).mermaid = '가'.repeat(10900);
    assert.deepEqual(validateModel(m).errors, []);
    for (let i = 0; i < 30; i++) {
      const id = `flw_${String(i).padStart(10, 'a')}`;
      m.flows[id] = { ...structuredClone(flow(m)), id, mermaid: 'sequenceDiagram' };
    }
    assert.ok(errs(m).includes('V14:flows'));
  });

  it('keeps apiflow views from older models', () => {
    const m = base();
    m.views.push({ id: 'view_apiflow01', kind: 'apiflow', name: 'API Flow', nodes: [], edges: [] });
    assert.deepEqual(validateModel(m).errors, []);
  });
});

describe('요구사항 참조 경로에 flows', () => {
  it('snapshot collects flow-only NFRs; references reports flowIds', () => {
    const m = base();
    m.components.cmp_reports_api.requirementIds = [];
    m.relations.rel_web_api.requirementIds = [];
    flow(m).requirementIds = [R9];
    const snap = buildSnapshot(m, [{ id: R9, code: 'NFR-009', kind: 'nfr', title: 'flow only' }]);
    assert.deepEqual(Object.keys(snap), [R9]);
    assert.deepEqual(references(m, R9), { componentIds: [], relationIds: [], flowIds: ['flw_reportlist'] });
  });
});

describe('의미 해시·요약·Diff', () => {
  const pair = (fn) => { const a = base(); const b = structuredClone(a); fn(b); return [a, b]; };
  const summary = (a, b) => summarize({ model: a, snapshot: {} }, { model: b, snapshot: {} });
  const changes = (a, b) => diffModels({ model: a, snapshot: buildSnapshot(a, reqs) }, { model: b, snapshot: buildSnapshot(b, reqs) }).changes;
  const reqs = [{ id: R1, code: 'NFR-001', kind: 'nfr' }, { id: R3, code: 'FR-001', kind: 'fr' }];

  it('requirement order inside a flow does not change the hash', () => {
    const [a, b] = pair((m) => { flow(m).requirementIds.reverse(); });
    assert.equal(modelHash(a), modelHash(b));
  });

  it('counts a flow once even if structure, requirements and body all change', () => {
    const [a, b] = pair((m) => { flow(m).name = '리포트 조회'; flow(m).requirementIds = [R1]; flow(m).mermaid += '\n  %% 메모'; });
    const s = summary(a, b);
    assert.deepEqual([s.flowsAdded, s.flowsRemoved, s.flowsModified, s.viewChanges], [0, 0, 1, 0]);
    assert.deepEqual(changes(a, b).map((c) => c.kind).sort(), ['flow.mermaid', 'flow.modified', 'flow.requirements']);
  });

  it('mermaid-only change is publishable and listed as flow.mermaid', () => {
    const [a, b] = pair((m) => { flow(m).mermaid = flow(m).mermaid.replace('JWT 발급', 'JWT 발급(1시간)'); });
    assert.ok(hasSemanticChanges(summary(a, b)));
    assert.deepEqual(changes(a, b), [{ kind: 'flow.mermaid', flowId: 'flw_reportlist', name: '리포트 목록 조회' }]);
  });

  it('describes participants, outcomes and auth by name', () => {
    const [a, b] = pair((m) => {
      flow(m).participantIds = ['cmp_web_app', 'cmp_reports_api', 'cmp_auth', 'cmp_reports_db'];
      flow(m).outcomes.push({ id: 'out_db5030', kind: 'failure', label: '503 DB 장애', cause: 'dependency_down' });
      flow(m).auth.dataAccessor = 'cmp_reports_db';
      flow(m).requirementIds = [R1];
    });
    const mod = changes(a, b).find((c) => c.kind === 'flow.modified');
    const field = (p) => mod.fields.find((f) => f.path === p);
    assert.deepEqual(field('participants').after, ['Web App', 'Reports API', 'Auth', 'Reports DB']);
    assert.deepEqual(field('outcomes').after, ['✓ 200 OK', '✕ 401 Unauthorized (인증)', '✕ 503 DB 장애 (의존 서비스 장애)']);
    assert.equal(field('auth').after.dataAccessor, 'Reports DB');
    assert.deepEqual(changes(a, b).find((c) => c.kind === 'flow.requirements').removed, ['FR-001']);
  });

  it('flow added/removed', () => {
    const [a, b] = pair((m) => { delete m.flows.flw_reportlist; });
    assert.deepEqual(changes(a, b), [{ kind: 'flow.removed', flowId: 'flw_reportlist', name: '리포트 목록 조회', endpoint: 'GET /api/my-ai/reports' }]);
    assert.equal(summary(b, a).flowsAdded, 1);
  });
});

describe('API Flow (DB)', { skip: dbSkipReason }, () => {
  const created = [];
  let A;
  const P = (id) => `/api/aa/projects/${id}`;
  before(async () => { ({ A } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  async function sampleProject(suffix) {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} flows ${suffix} ${Date.now()}`, template: 'sample-reports' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(res.body.data.id);
    return res.body.data.id;
  }
  async function draft(id) { return (await api(A).get(`${P(id)}/architecture`)).body; }
  async function save(id, fn) {
    const d = (await draft(id)).data;
    fn(d.model);
    return api(A).put(`${P(id)}/architecture/draft`, { baseRevision: d.revision, model: d.model });
  }
  async function publish(id, label) {
    const p = (await api(A).get(`${P(id)}/architecture/versions/preview`)).body.data;
    const r = await api(A).post(`${P(id)}/architecture/versions`, { label, baseRevision: p.revision, expectedLatestVersionId: p.latestVersion?.id ?? null, snapshotHash: p.snapshotHash });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.data;
  }

  it('sample has the flow; flow-only NFR: delete protected, in snapshot, dropped with a warning on restore', async () => {
    const id = await sampleProject('refs');
    const d = (await draft(id)).data;
    assert.equal(d.model.flows.flw_reportlist.participantIds.length, 4);
    // 흐름에만 연결된 NFR 하나
    const nfr = (await api(A).post(`${P(id)}/requirements`, { kind: 'nfr', title: '흐름 전용', priority: 'should' })).body.data;
    assert.equal((await save(id, (m) => { m.flows.flw_reportlist.requirementIds.push(nfr.id); })).status, 200);
    const del = await api(A).del(`${P(id)}/requirements/${nfr.id}`);
    assert.equal(del.status, 409);
    assert.deepEqual(del.body.details.flowIds, ['flw_reportlist']);
    const v1 = await publish(id, 'v1.0');
    const version = (await api(A).get(`${P(id)}/architecture/versions/${v1.id}`)).body.data;
    assert.ok(version.requirements.some((r) => r.code === nfr.code), 'flow-only NFR is in the publish snapshot');
    // 흐름에서 빼고 삭제 → 과거 스냅샷에는 남음, 복원하면 Draft 흐름 참조에서 빠지고 경고
    assert.equal((await save(id, (m) => { m.flows.flw_reportlist.requirementIds = m.flows.flw_reportlist.requirementIds.filter((x) => x !== nfr.id); })).status, 200);
    assert.equal((await api(A).del(`${P(id)}/requirements/${nfr.id}`)).status, 204);
    const again = (await api(A).get(`${P(id)}/architecture/versions/${v1.id}`)).body.data;
    assert.ok(again.requirements.find((r) => r.code === nfr.code)?.deleted, 'old snapshot keeps it, marked deleted');
    const cur = (await draft(id)).data;
    const restored = await api(A).post(`${P(id)}/architecture/versions/${v1.id}/restore`, { baseRevision: cur.revision });
    assert.equal(restored.status, 200);
    assert.ok(restored.body.warnings.some((w) => w.code === 'V9' && w.path === 'flows.flw_reportlist.requirementIds' && w.removedIds.includes(nfr.id)));
    const after = (await draft(id)).data;
    assert.ok(!after.model.flows.flw_reportlist.requirementIds.includes(nfr.id));
  });

  it('rejects invalid flows on save and keeps the revision', async () => {
    const id = await sampleProject('invalid');
    const before = (await draft(id)).data.revision;
    const r = await save(id, (m) => { m.flows.flw_reportlist.participantIds.push('cmp_paas_db'); });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.some((e) => e.rule === 'V10'));
    assert.equal((await draft(id)).data.revision, before);
  });

  it('publish summary and compare show flow changes', async () => {
    const id = await sampleProject('compare');
    assert.equal((await save(id, (m) => { delete m.flows.flw_reportlist; })).status, 200);
    const v1 = await publish(id, 'v1.0');
    const sample2 = sample.model();
    assert.equal((await save(id, (m) => { m.flows = { flw_reportlist: { ...sample2.flows.flw_reportlist, requirementIds: [] } }; })).status, 200);
    const v2 = await publish(id, 'v1.1');
    assert.equal(v2.diffSummary.flowsAdded, 1);
    assert.equal(v2.diffSummary.viewChanges, 0);
    const cmp = (await api(A).get(`${P(id)}/architecture/compare?from=${v1.id}&to=${v2.id}`)).body.data;
    assert.deepEqual(cmp.changes.map((c) => c.kind), ['flow.added']);
  });
});
