// Sprint 8 후속 수정 회귀 (2026-11-23 사용자 요청 3건)
// 1. Flow 내보내기: create participant·@{ } 메타데이터가 있어도 README·Ask AI에 내부 componentId가 남지 않는다
// 2. Version Compare: 이름이 같은 두 컴포넌트 사이 토큰 검증 역할 이동, 실패 원인만 변경 → 상세 Diff에 실제 차이
// 3. Requirement Trace: 요구사항 200건을 넘어도 뒤쪽 항목을 GET /requirements/:reqId로 연다
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const sample = require('../../lib/aa/templates/sample-reports');
const { buildReadme } = require('../../lib/aa/readme-export');
const { buildAskAi } = require('../../lib/aa/export-builder');
const { flowSequence } = require('../../lib/aa/flow-export');
const { diffModels, summarize } = require('../../lib/aa/graph-diff');
const { dbSkipReason, getTokens, deleteProjects, api, aaDb, USER_A, TEST_PREFIX } = require('../helpers/aa-api');

const FID = 'flw_reportlist';
const INTERNAL = /\b(?:cmp|flw|out)_[A-Za-z0-9_-]+\b/;

describe('1. Flow 내보내기에 내부 id가 남지 않는다', () => {
  const withNewSyntax = () => {
    const m = sample.model();
    m.flows[FID].mermaid += [
      '',
      '  create participant cmp_reports_db',
      '  cmp_reports_api->>cmp_reports_db: 캐시 생성',
      '  participant cmp_auth@{ "type": "boundary" }',
      '  create actor cmp_ghost01',
      '  cmp_ghost01->>cmp_web_app: 알 수 없는 참여자',
      '  destroy cmp_ghost01',
    ].join('\n');
    return m;
  };

  it('README apiFlows', () => {
    const body = buildReadme({ project: { name: 'X' }, model: withNewSyntax(), revision: 1, sections: { apiFlows: [FID] } }).body;
    assert.ok(!INTERNAL.test(body), body.match(INTERNAL)?.[0]);
    assert.ok(body.includes('create participant P4 as Reports DB') === false, 'already declared → create line deduplicated');
    assert.ok(body.includes('create actor X1 as (알 수 없는 참여자)') && body.includes('destroy X1'), 'unknown via create actor → X1');
  });

  it('Ask AI flow scope (ai-md·ai-json)', () => {
    for (const format of ['ai-md', 'ai-json']) {
      const b = buildAskAi({ project: { name: 'X' }, model: withNewSyntax(), revision: 1, format, scope: { type: 'flow', flowId: FID }, bundleId: 'bx_aaaaaaaaaa', readAt: 't' });
      assert.ok(!INTERNAL.test(b.content), `${format}: ${b.content.match(INTERNAL)?.[0]}`);
    }
  });

  it('create participant of a new participant is kept as a declaration; metadata is dropped', () => {
    const m = sample.model();
    const flow = structuredClone(m.flows[FID]);
    flow.participantIds = ['cmp_web_app', 'cmp_reports_api', 'cmp_reports_db'];
    flow.auth = {};
    flow.mermaid = 'sequenceDiagram\n  participant cmp_web_app\n  cmp_web_app->>cmp_reports_api: 요청\n  create participant cmp_reports_db@{ "type": "database" }\n  cmp_reports_api->>cmp_reports_db: 생성';
    const { source } = flowSequence(flow, m, { idFor: (_c, i) => `P${i + 1}` });
    assert.ok(source.includes('create participant P3 as Reports DB'), source);
    assert.ok(!source.includes('@{'), 'metadata dropped');
    assert.ok(!INTERNAL.test(source));
  });
});

describe('2. Compare 상세 Diff', () => {
  const twins = () => {
    const m = sample.model();
    m.components.cmp_auth.name = 'Reports API';   // 이름이 같은 두 컴포넌트
    return m;
  };
  const diff = (a, b) => diffModels({ model: a, snapshot: {} }, { model: b, snapshot: {} }).changes;

  it('moving the token verifier between same-named components is listed with a distinguishable value', () => {
    const a = twins();
    const b = structuredClone(a);
    b.flows[FID].auth.tokenVerifier = 'cmp_auth';
    const changes = diff(a, b);
    assert.equal(changes.length, 1);
    const f = changes[0].fields.find((x) => x.path === 'auth');
    assert.notEqual(f.before.tokenVerifier, f.after.tokenVerifier);
    assert.equal(f.before.tokenVerifier, 'Reports API (Node.js / Express)');
    assert.equal(f.after.tokenVerifier, 'Reports API (Supabase Auth)');
    assert.equal(summarize({ model: a, snapshot: {} }, { model: b, snapshot: {} }).flowsModified, 1);
  });

  it('falls back to the id when name and technology are also the same', () => {
    const a = twins();
    a.components.cmp_auth.technology = 'Node.js / Express';
    const b = structuredClone(a);
    b.flows[FID].auth.tokenVerifier = 'cmp_auth';
    const f = diff(a, b)[0].fields.find((x) => x.path === 'auth');
    assert.notEqual(f.before.tokenVerifier, f.after.tokenVerifier);
  });

  it('reordering same-named participants is visible', () => {
    const a = twins();
    const b = structuredClone(a);
    b.flows[FID].participantIds = ['cmp_web_app', 'cmp_reports_api', 'cmp_auth', 'cmp_reports_db'];
    const f = diff(a, b)[0].fields.find((x) => x.path === 'participants');
    assert.notDeepEqual(f.before, f.after);
  });

  it('changing only the failure cause (인증 → 타임아웃) shows both causes', () => {
    const a = sample.model();
    const b = structuredClone(a);
    b.flows[FID].outcomes[1].cause = 'timeout';
    const f = diff(a, b)[0].fields.find((x) => x.path === 'outcomes');
    assert.deepEqual(f.before, ['✓ 200 OK', '✕ 401 Unauthorized (인증)']);
    assert.deepEqual(f.after, ['✓ 200 OK', '✕ 401 Unauthorized (타임아웃)']);
  });
});

describe('3. 요구사항 200건 초과 (DB)', { skip: dbSkipReason }, () => {
  const created = [];
  let A, B, id, last;
  const P = () => `/api/aa/projects/${id}`;
  before(async () => {
    ({ A, B } = await getTokens());
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} 200+ requirements ${Date.now()}` });
    assert.equal(res.status, 201);
    id = res.body.data.id;
    created.push(id);
    // 205건을 한 번에 넣는다 (테스트 사용자 A의 테스트 프로젝트)
    const rows = Array.from({ length: 205 }, (_, i) => ({
      project_id: id, user_id: USER_A, code: `NFR-${String(i + 1).padStart(3, '0')}`, kind: 'nfr', title: `대량 요구사항 ${i + 1}`,
      priority: 'should', status: 'active', sort_order: i, measurement: {},
    }));
    const { data, error } = await aaDb().from('aa_requirements').insert(rows).select('id, code');
    assert.ifError(error);
    last = data.find((r) => r.code === 'NFR-205');
  });
  after(async () => { await deleteProjects(created); });

  it('the 205th requirement is beyond the first list page (max 200) but opens by id', async () => {
    const page1 = (await api(A).get(`${P()}/requirements?limit=200`)).body;
    assert.equal(page1.total, 205);
    assert.equal(page1.data.length, 200);
    assert.ok(!page1.data.some((r) => r.id === last.id), 'not on the first page');
    const one = await api(A).get(`${P()}/requirements/${last.id}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.data.code, 'NFR-205');
    assert.deepEqual(one.body.data.measurement, {});
  });

  it('404 for a missing id, a bad id, and another user', async () => {
    assert.equal((await api(A).get(`${P()}/requirements/99999999-9999-4999-8999-999999999999`)).status, 404);
    assert.equal((await api(A).get(`${P()}/requirements/not-a-uuid`)).status, 404);
    assert.equal((await api(B).get(`${P()}/requirements/${last.id}`)).status, 404);
  });
});
