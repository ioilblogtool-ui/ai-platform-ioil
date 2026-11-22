// Sprint 7 Step 3 — 배치안과 내보내기 (S7-3·S7-5, Q6·Q8)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const sample = require('../../lib/aa/templates/sample-reports');
const { buildReadme } = require('../../lib/aa/readme-export');
const { buildAskAi } = require('../../lib/aa/export-builder');
const { normalizeModel } = require('../../lib/aa/normalize');
const { toMermaidFlowchart } = require('../../lib/aa/mermaid-export');
const { validateModel } = require('../../lib/aa/architecture-validator');
const { dbSkipReason, getTokens, deleteProjects, api, TEST_PREFIX } = require('../helpers/aa-api');

const project = { name: 'AI Platform Reports (샘플)', readmeMd: sample.readmeMd };
/** 같은 모델에서 배치안만 뺀 것 (Sprint 6까지의 샘플과 같은 Logical) */
function withoutDeployment(model) {
  const m = structuredClone(model);
  m.views = m.views.filter((v) => v.kind !== 'deployment');
  for (const [id, c] of Object.entries(m.components)) if (c.layer === 'deployment') delete m.components[id];
  for (const [id, r] of Object.entries(m.relations)) if (!m.components[r.from] || !m.components[r.to]) delete m.relations[id];
  return m;
}

describe('샘플 배치안 (Q8)', () => {
  it('ships two valid deployment views with realizes, LB call lines and strategies', () => {
    const m = sample.model();
    assert.deepEqual(validateModel(m).errors, []);
    const deps = m.views.filter((v) => v.kind === 'deployment');
    assert.deepEqual(deps.map((v) => v.variant), ['현재 · PaaS', '대안 · VM×2 + LB']);
    const realizes = Object.values(m.relations).filter((r) => r.type === 'realizes');
    assert.equal(realizes.filter((r) => r.to === 'cmp_reports_api').length, 3, 'backend + api×2');
    const vm = deps[1];
    assert.equal(vm.edges.length, 2, 'LB → two api processes');
    const parentName = (nid) => m.components[vm.nodes.find((n) => n.id === vm.nodes.find((x) => x.id === nid).parentId).componentId].name;
    assert.equal(parentName('nd_vm_api_1'), 'vm-api-1');
    assert.equal(parentName('nd_vm_api_2'), 'vm-api-2');
    for (const v of deps) for (const must of ['운영 배포 승인', '확인 항목', '롤백 범위']) assert.ok(v.strategyMd.includes(must), `${v.variant}: ${must}`);
  });
});

describe('Logical 출력은 배치안과 무관 (S7-5)', () => {
  const full = sample.model();
  const logical = withoutDeployment(full);

  it('README (default sections), Ask AI (project·view·components·requirement) and Mermaid are identical', () => {
    const r1 = buildReadme({ project, model: full, revision: 3 });
    const r2 = buildReadme({ project, model: logical, revision: 3 });
    assert.equal(r1.body, r2.body);
    const ask = (model, scope) => buildAskAi({ project, model, revision: 3, format: 'ai-md', scope, template: 'design-review', bundleId: 'bx_aaaaaaaaaa', readAt: 't' });
    for (const scope of [undefined, { type: 'project' }, { type: 'view', viewId: 'view_logical' }, { type: 'components', componentIds: ['cmp_reports_api'] }]) {
      assert.equal(ask(full, scope).hashBody, ask(logical, scope).hashBody, JSON.stringify(scope));
    }
    assert.equal(ask(full).scopeLabel, '프로젝트 전체 (Logical)');
    assert.equal(toMermaidFlowchart(normalizeModel(full)), toMermaidFlowchart(normalizeModel(logical)));
    const n = normalizeModel(full);
    assert.equal(n.components.length, 4);
    assert.ok(n.relations.every((r) => r.type === 'calls'), 'no realizes in Logical output');
  });

  it('adds deployment and strategy sections only when asked', () => {
    const on = buildReadme({ project, model: full, revision: 3, sections: { deployment: true, deployStrategy: true } }).body;
    assert.ok(on.includes('## 배포 구성 (배치안)') && on.includes('### 현재 · PaaS') && on.includes('### 대안 · VM×2 + LB'));
    assert.match(on, /\| backend \(node\) ×1 \| internal \/ Railway \| Reports API \|/);
    assert.ok(on.includes('## 배포 전략'));
    assert.ok(on.includes('#### 환경과 승인'), 'strategy headings demoted two levels');
    for (const forbidden of ['cmp_', 'nd_', 'rel_', 'view_dep']) assert.ok(!on.includes(forbidden), forbidden);
    const off = buildReadme({ project, model: full, revision: 3, sections: { deployStrategy: true } }).body;
    assert.ok(!off.includes('## 배포 구성') && off.includes('## 배포 전략'));
    const none = buildReadme({ project, model: logical, revision: 3, sections: { deployment: true, deployStrategy: true } }).body;
    assert.equal(none, buildReadme({ project, model: logical, revision: 3 }).body, 'no deployment views → no sections');
  });
});

describe('배치안 내보내기·발행 (DB)', { skip: dbSkipReason }, () => {
  const created = [];
  let A;
  const P = (id) => `/api/aa/projects/${id}`;
  before(async () => { ({ A } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  async function sampleProject(suffix) {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} deploy-export ${suffix} ${Date.now()}`, template: 'sample-reports' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(res.body.data.id);
    return res.body.data.id;
  }
  async function publish(id, label) {
    const p = (await api(A).get(`${P(id)}/architecture/versions/preview`)).body.data;
    return api(A).post(`${P(id)}/architecture/versions`, { label, baseRevision: p.revision, expectedLatestVersionId: p.latestVersion?.id ?? null, snapshotHash: p.snapshotHash });
  }
  async function editStrategy(id, fn) {
    const d = (await api(A).get(`${P(id)}/architecture`)).body.data;
    const v = d.model.views.find((x) => x.id === 'view_dep_paas');
    v.strategyMd = fn(v.strategyMd);
    return api(A).put(`${P(id)}/architecture/draft`, { baseRevision: d.revision, model: d.model });
  }

  it('README via API: sections on/off match, strategy-only change publishes, old version keeps its strategy', async () => {
    const id = await sampleProject('readme');
    const on = (await api(A).post(`${P(id)}/export`, { format: 'readme-md', source: { type: 'draft' }, sections: { deployment: true, deployStrategy: true } })).body.data;
    assert.equal(on.sections.deployStrategy, true);
    assert.ok(on.content.includes('## 배포 전략') && on.content.includes('운영 배포 승인'));
    const off = (await api(A).post(`${P(id)}/export`, { format: 'readme-md', source: { type: 'draft' } })).body.data;
    assert.ok(!off.content.includes('## 배포'));

    const v1 = await publish(id, 'v1.0');
    assert.equal(v1.status, 201, JSON.stringify(v1.body));
    assert.equal((await editStrategy(id, (s) => `${s}\n- 추가: 배포 후 30분 모니터링`)).status, 200);
    const preview = (await api(A).get(`${P(id)}/architecture/versions/preview`)).body.data;
    assert.equal(preview.noChanges, false);
    assert.equal(preview.summary.strategiesChanged, 1);
    const v2 = await publish(id, 'v1.1');
    assert.equal(v2.status, 201, 'strategy-only change publishes');
    assert.equal((await editStrategy(id, () => '')).status, 200);
    const oldReadme = (await api(A).post(`${P(id)}/export`, { format: 'readme-md', source: { type: 'version', versionId: v1.body.data.id }, sections: { deployStrategy: true } })).body.data;
    assert.ok(oldReadme.content.includes('운영 배포 승인') && !oldReadme.content.includes('30분 모니터링'), 'v1.0 keeps its own strategy');
  });

  it('blocks keys in the strategy on save and warns about IPs in the README strategy section', async () => {
    const id = await sampleProject('scan');
    const blocked = await editStrategy(id, (s) => `${s}\n- 토큰 sk-${'d'.repeat(24)}`);
    assert.equal(blocked.status, 400);
    assert.ok(blocked.body.details.some((e) => e.rule === 'V12'));
    assert.equal((await editStrategy(id, (s) => `${s}\n- 운영 서버 10.1.2.3`)).status, 200, 'IP is a warning, not a block');
    const plain = await api(A).post(`${P(id)}/export`, { format: 'readme-md', source: { type: 'draft' } });
    assert.equal(plain.status, 200, 'strategy not included → no warning');
    const withStrategy = await api(A).post(`${P(id)}/export`, { format: 'readme-md', source: { type: 'draft' }, sections: { deployStrategy: true } });
    assert.equal(withStrategy.status, 422);
    assert.equal(withStrategy.body.details.confirmable, true);
  });
});
