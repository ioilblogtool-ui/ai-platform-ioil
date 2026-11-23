// Sprint 8 Step 5 — 내보내기: 관계 속성·README apiFlows·Ask AI flow 범위·측정 기준 (S8-7)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const sample = require('../../lib/aa/templates/sample-reports');
const { buildReadme } = require('../../lib/aa/readme-export');
const { buildAskAi } = require('../../lib/aa/export-builder');
const { flowSequence } = require('../../lib/aa/flow-export');
const { dbSkipReason, getTokens, deleteProjects, api, TEST_PREFIX } = require('../helpers/aa-api');

const R1 = '11111111-1111-4111-8111-111111111111';
const R3 = '33333333-3333-4333-8333-333333333333';
const reqs = [
  { id: R1, code: 'NFR-001', kind: 'nfr', title: '리포트 조회 응답 시간', target: 'p95 < 300ms', metric: 'p95', status: 'active', measurement: { flowId: 'flw_reportlist', environment: 'staging', load: '동시 20명 · 5분' } },
  { id: R3, code: 'FR-001', kind: 'fr', title: '월별 리포트 조회', status: 'active' },
];
const project = { name: 'AI Platform Reports (샘플)', readmeMd: sample.readmeMd };
const ATTRS = ['timeoutMs', 'retry', 'onFailure', 'credential', 'dataClass'];
/** Sprint 7 모양: 관계 속성·흐름·측정 기준 없음 */
function sprint7Shape(model) {
  const m = structuredClone(model);
  for (const r of Object.values(m.relations)) for (const k of ATTRS) delete r[k];
  m.flows = {};
  return m;
}
const plainReqs = reqs.map(({ measurement, ...r }) => r);   // eslint-disable-line no-unused-vars
const ask = (model, scope, format = 'ai-md', requirements = reqs) => buildAskAi({ project, model, revision: 3, requirements, format, scope, bundleId: 'bx_aaaaaaaaaa', readAt: 't' });

describe('없는 모델은 Sprint 7과 같다', () => {
  it('README·Ask AI have no new columns or sections without attributes, flows and measurements', () => {
    const m = sprint7Shape(sample.model({ nfr_latency: R1, fr_monthly_report: R3 }));
    const body = buildReadme({ project, model: m, revision: 3, requirements: plainReqs }).body;
    for (const s of ['운영·보안', '측정 기준 |', 'API·외부', 'operations']) assert.ok(!body.includes(s), s);
    const withFlowsOnly = { ...m, flows: sample.model({ nfr_latency: R1 }).flows };
    assert.equal(buildReadme({ project, model: withFlowsOnly, revision: 3, requirements: plainReqs }).body, body, 'flows alone do not change README');
    assert.equal(ask(withFlowsOnly, { type: 'project' }, 'ai-md', plainReqs).hashBody, ask(m, { type: 'project' }, 'ai-md', plainReqs).hashBody);
    assert.ok(!ask(m, { type: 'project' }, 'ai-json', plainReqs).content.includes('"operations"'));
  });
});

describe('README', () => {
  const m = sample.model({ nfr_latency: R1, fr_monthly_report: R3 });

  it('adds an operations column, a measurement column and the chosen flows only', () => {
    const body = buildReadme({ project, model: m, revision: 3, requirements: reqs, sections: { apiFlows: ['flw_reportlist'] } }).body;
    assert.match(body, /\| Reports API \| Reports DB \| JDBC \| 동기 \| — \| timeout 2s · retry 1회 fixed · 실패 시 오류 전파 · 자격증명 service-role · 데이터 personal \|/);
    assert.match(body, /\| NFR-001 \|.*\| 대상 리포트 목록 조회 · staging · 동시 20명 · 5분 \|/);
    assert.ok(body.includes('## API·외부 연동 (API Flow)') && body.includes('### 리포트 목록 조회'));
    assert.ok(body.includes('- 인증·데이터 경계: 🔑 토큰 발급 Auth · 🛡 토큰 검증 Reports API · ⛁ DB 접근 Reports API'));
    assert.ok(body.includes('participant P3 as 🛡⛁ Reports API'));
    for (const forbidden of ['cmp_', 'flw_', 'out_']) assert.ok(!body.includes(forbidden), forbidden);
    const none = buildReadme({ project, model: m, revision: 3, requirements: reqs }).body;
    assert.ok(!none.includes('API·외부'), 'not chosen → no section');
  });

  it('marks identifiers outside the participant list', () => {
    const broken = structuredClone(m);
    broken.flows.flw_reportlist.mermaid += '\n  cmp_ghost->>cmp_web_app: ?';
    const { source, unknown } = flowSequence(broken.flows.flw_reportlist, broken, { idFor: (_c, i) => `P${i + 1}` });
    assert.equal(unknown, 1);
    assert.ok(source.includes('participant X1 as (알 수 없는 참여자)') && source.includes('X1->>P1: ?'));
    const body = buildReadme({ project, model: broken, revision: 3, requirements: reqs, sections: { apiFlows: ['flw_reportlist'] } }).body;
    assert.ok(body.includes('참여 목록 밖 식별자 1개'));
  });
});

describe('Ask AI flow 범위', () => {
  const m = sample.model({ nfr_latency: R1, fr_monthly_report: R3 });
  it('bundles the flow, its participants, calls between them and its requirements, without internal ids', () => {
    for (const format of ['ai-md', 'ai-json']) {
      const b = ask(m, { type: 'flow', flowId: 'flw_reportlist' }, format);
      assert.equal(b.scopeLabel, 'API Flow: 리포트 목록 조회 (GET /api/my-ai/reports)');
      assert.deepEqual(b.counts, { components: 4, relations: 4 });
      assert.ok(!/cmp_|flw_|out_/.test(b.content), format);
    }
    const json = JSON.parse(ask(m, { type: 'flow', flowId: 'flw_reportlist' }, 'ai-json').content);
    assert.deepEqual(json.flow.outcomes.map((o) => o.label), ['200 OK', '401 Unauthorized']);
    assert.deepEqual(json.flow.requirements.sort(), ['FR-001', 'NFR-001']);
    assert.ok(json.relations.find((r) => r.operations?.includes('service-role')));
    assert.equal(ask(m, { type: 'flow', flowId: 'flw_nonexist01' }).error, 'scope_flow');
  });
});

describe('버전 기준 (DB)', { skip: dbSkipReason }, () => {
  const created = [];
  let A;
  const P = (id) => `/api/aa/projects/${id}`;
  before(async () => { ({ A } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  it('version outputs keep that version’s flow and flow-only NFR, without measurement; draft changes do not leak', async () => {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} flow-export ${Date.now()}`, template: 'sample-reports' });
    assert.equal(res.status, 201);
    const id = res.body.data.id;
    created.push(id);
    // 흐름에만 연결된 NFR
    const only = (await api(A).post(`${P(id)}/requirements`, { kind: 'nfr', title: '흐름 전용 NFR', priority: 'should' })).body.data;
    let d = (await api(A).get(`${P(id)}/architecture`)).body.data;
    d.model.flows.flw_reportlist.requirementIds.push(only.id);
    assert.equal((await api(A).put(`${P(id)}/architecture/draft`, { baseRevision: d.revision, model: d.model })).status, 200);
    const pv = (await api(A).get(`${P(id)}/architecture/versions/preview`)).body.data;
    const v1 = (await api(A).post(`${P(id)}/architecture/versions`, { label: 'v1.0', baseRevision: pv.revision, expectedLatestVersionId: null, snapshotHash: pv.snapshotHash })).body.data;
    // Draft를 바꾼다: 흐름 이름·컴포넌트 이름
    d = (await api(A).get(`${P(id)}/architecture`)).body.data;
    d.model.flows.flw_reportlist.name = '바뀐 흐름 이름';
    d.model.components.cmp_reports_api.name = 'Reports Service';
    assert.equal((await api(A).put(`${P(id)}/architecture/draft`, { baseRevision: d.revision, model: d.model })).status, 200);

    const readme = (await api(A).post(`${P(id)}/export`, { format: 'readme-md', source: { type: 'version', versionId: v1.id }, sections: { apiFlows: ['flw_reportlist'] } })).body.data;
    assert.ok(readme.content.includes('### 리포트 목록 조회') && readme.content.includes('Reports API') && !readme.content.includes('Reports Service'));
    assert.ok(readme.content.includes(only.code), 'flow-only NFR from the version snapshot');
    assert.ok(!readme.content.includes('측정 기준 |'), 'no measurement column for a version');
    const draftReadme = (await api(A).post(`${P(id)}/export`, { format: 'readme-md', source: { type: 'draft' } })).body.data;
    assert.ok(draftReadme.content.includes('측정 기준 |'), 'draft README shows measurement');

    const bundle = (await api(A).post(`${P(id)}/export`, { format: 'ai-md', source: { type: 'version', versionId: v1.id }, scope: { type: 'flow', flowId: 'flw_reportlist' } })).body.data;
    assert.ok(bundle.content.includes('# API Flow: 리포트 목록 조회') && bundle.content.includes(only.code));

    assert.equal((await api(A).post(`${P(id)}/export`, { format: 'readme-md', source: { type: 'draft' }, sections: { apiFlows: ['flw_nonexist01'] } })).status, 400);
    assert.equal((await api(A).post(`${P(id)}/export`, { format: 'ai-md', source: { type: 'draft' }, scope: { type: 'flow', flowId: 'flw_nonexist01' } })).status, 404);
    assert.equal((await api(A).post(`${P(id)}/export`, { format: 'ai-md', source: { type: 'draft' }, scope: { type: 'flow', flowId: 'bad' } })).status, 400);
  });
});
