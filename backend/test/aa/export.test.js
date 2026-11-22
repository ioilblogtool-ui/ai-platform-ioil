// Sprint 4 Step 5 — README.md 내보내기 (S4-7, S4-8)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { buildReadme, readmeFooter, normalizeSections, slugify } = require('../../lib/aa/readme-export');
const sample = require('../../lib/aa/templates/sample-reports');
const { dbSkipReason, getTokens, deleteProjects, api, aaDb, TEST_PREFIX } = require('../helpers/aa-api');

const NFR = { id: '11111111-1111-4111-8111-111111111111', code: 'NFR-001', kind: 'nfr', title: '조회 p95 | 300ms', category: 'performance', target: '300ms', metric: 'p95', status: 'active' };

function sampleWithNfr() {
  const model = sample.model();
  model.components.cmp_reports_api.requirementIds = [NFR.id];
  model.components.cmp_reports_api.custom = { region: 'seoul', DB_PASSWORD: 'x', note: 'API_KEY=abc' };
  return model;
}

describe('buildReadme (offline)', () => {
  const project = { name: 'AI Platform Reports (샘플)', readmeMd: sample.readmeMd };

  it('writes the fixed order with every optional section on by default', () => {
    const { body, filename, sections } = buildReadme({ project, model: sampleWithNfr(), revision: 7, requirements: [NFR] });
    assert.deepEqual(sections, { overview: true, logicalDiagram: true, nfr: true });
    assert.equal(filename, 'README_ai-platform-reports-샘플_draft-rev7.md');
    const headings = body.split('\n').filter((l) => /^#{1,2} /.test(l));
    assert.deepEqual(headings, ['# AI Platform Reports (샘플)', '## 프로젝트 개요', '## 아키텍처 요약', '## 구성도 (Logical)', '## 비기능 요구사항 (NFR)']);
    assert.match(body, /> 기준: Draft rev 7 \(발행 버전 없음\)/);
    assert.match(body, /^### 목적$/m, 'overview headings are moved one level down');
    assert.match(body, /\| Reports API \| Service \| Node\.js \/ Express \| Backend \| Runtime: Node\.js 24, Stateless: true, region: seoul \| NFR-001 \|/);
    assert.match(body, /```mermaid\nflowchart LR\n/);
    assert.match(body, /\| NFR-001 \| 조회 p95 \\\| 300ms \| 성능 \| 300ms \| p95 \|/);
    for (const forbidden of ['cmp_', 'rel_', 'nd_', 'DB_PASSWORD', 'API_KEY', 'position']) assert.ok(!body.includes(forbidden), forbidden);
    assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(body), 'no timestamp in the hashed body');
  });

  it('omits switched-off sections from the output and keeps the fixed ones', () => {
    const { body } = buildReadme({ project, model: sample.model(), revision: 1, sections: { overview: false, logicalDiagram: false, nfr: false, deployment: true } });
    const headings = body.split('\n').filter((l) => /^#{1,2} /.test(l));
    assert.deepEqual(headings, ['# AI Platform Reports (샘플)', '## 아키텍처 요약']);
    assert.ok(!body.includes('```mermaid'));
  });

  it('handles an empty project and odd names', () => {
    const { body, filename } = buildReadme({
      project: { name: '!!!', readmeMd: '' },
      model: { schemaVersion: 1, components: {}, relations: {}, views: [{ id: 'view_logical', kind: 'logical', nodes: [], edges: [] }] },
      revision: 1,
    });
    assert.equal(filename, 'README_project_draft-rev1.md');
    assert.match(body, /_개요가 비어 있습니다\._/);
    assert.match(body, /_아직 컴포넌트가 없습니다\._/);
    assert.match(body, /_Logical View에 그려진 컴포넌트가 없습니다\._/);
    assert.match(body, /_등록된 NFR이 없습니다\._/);
  });

  it('normalizes section flags and slugs', () => {
    assert.deepEqual(normalizeSections({ overview: 'yes', nfr: false, x: true }), { overview: false, logicalDiagram: true, nfr: false });
    assert.deepEqual(normalizeSections(null), { overview: true, logicalDiagram: true, nfr: true });
    assert.equal(slugify('  Hello  World!!  '), 'hello-world');
    assert.match(readmeFooter(new Date('2026-11-22T00:00:00Z')), /2026-11-22T00:00:00\.000Z/);
  });
});

describe('POST /projects/:id/export', { skip: dbSkipReason }, () => {
  const created = [];
  let A, B;
  const url = (id) => `/api/aa/projects/${id}/export`;
  const body = (extra = {}) => ({ format: 'readme-md', source: { type: 'latest' }, ...extra });
  const createSample = async (suffix, readmeMd) => {
    const res = await api(A).post('/api/aa/projects', { name: `${TEST_PREFIX} export ${suffix} ${Date.now()}`, template: 'sample-reports', ...(readmeMd ? { readmeMd } : {}) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(res.body.data.id);
    return res.body.data;
  };

  before(async () => { ({ A, B } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  it('returns the README with basis, hash and footer', async () => {
    const p = await createSample('ok');
    const res = await api(A).post(url(p.id), body());
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    assert.equal(d.basis.source, 'draft');
    assert.equal(d.basis.revision, 1);
    assert.match(d.filename, /^README_.+_draft-rev1\.md$/);
    assert.match(d.contentHash, /^[0-9a-f]{64}$/);
    assert.match(d.content, /\n---\n_AA Workbench에서 생성 · \d{4}-/);
    const again = await api(A).post(url(p.id), body());
    assert.equal(again.body.data.contentHash, d.contentHash, 'same input → same hash even though the footer time differs');
  });

  it('applies sections and rejects unsupported formats and sources', async () => {
    const p = await createSample('sections');
    const off = await api(A).post(url(p.id), body({ sections: { overview: false, logicalDiagram: false, nfr: false } }));
    assert.equal(off.status, 200);
    assert.ok(!off.body.data.content.includes('## 프로젝트 개요'));
    assert.deepEqual(off.body.data.sections, { overview: false, logicalDiagram: false, nfr: false });
    for (const format of ['model-json', 'pdf', undefined]) {   // ai-md·ai-json·mermaid는 Sprint 5에서 지원
      const r = await api(A).post(url(p.id), { format });
      assert.equal(r.status, 400);
      assert.equal(r.body.code, 'UNSUPPORTED_EXPORT_FORMAT');
    }
    const version = await api(A).post(url(p.id), body({ source: { type: 'version', versionId: 'x' } }));
    assert.equal(version.status, 400);
  });

  it('hides other users\' projects', async () => {
    const p = await createSample('owner');
    assert.equal((await api(B).post(url(p.id), body())).status, 404);
  });

  it('warns on emails and passes only with a matching confirmation', async () => {
    const p = await createSample('warn', '## 목적\n문의: ops@example.com\n');
    const first = await api(A).post(url(p.id), body());
    assert.equal(first.status, 422);
    assert.equal(first.body.code, 'SENSITIVE_DATA_DETECTED');
    assert.equal(first.body.details.confirmable, true);
    assert.equal(first.body.content, undefined);
    assert.ok(!JSON.stringify(first.body).includes('ops@example.com'), 'masked only');
    assert.deepEqual(first.body.details.issues.map((i) => i.rule), ['email']);
    const scanId = first.body.details.scanId;

    const ok = await api(A).post(url(p.id), body({ acknowledgedScan: scanId }));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.acknowledgedWarnings, 1);

    // 구역이 바뀌면(NFR 끄기, 개요는 그대로라 이메일 경고는 남음) 확인 무효
    const otherSections = await api(A).post(url(p.id), body({ acknowledgedScan: scanId, sections: { nfr: false } }));
    assert.equal(otherSections.status, 422);

    // 개요를 고치면(revision은 그대로) 출력 해시가 바뀌어 확인 무효
    await api(A).patch(`/api/aa/projects/${p.id}`, { readmeMd: '## 목적\n문의: ops@example.com, dev@example.com\n' });
    const afterEdit = await api(A).post(url(p.id), body({ acknowledgedScan: scanId }));
    assert.equal(afterEdit.status, 422);
    assert.notEqual(afterEdit.body.details.scanId, scanId);

    // Draft revision이 바뀌어도 확인 무효
    const scan2 = afterEdit.body.details.scanId;
    const draft = await api(A).get(`/api/aa/projects/${p.id}/architecture`);
    await api(A).put(`/api/aa/projects/${p.id}/architecture/draft`, { baseRevision: draft.body.data.revision, model: draft.body.data.model });
    assert.equal((await api(A).post(url(p.id), body({ acknowledgedScan: scan2 }))).status, 422);

    // 다른 프로젝트에서 받은 확인 ID는 쓸 수 없다
    const q = await createSample('warn-other', '## 목적\n문의: ops@example.com\n');
    const qScan = (await api(A).post(url(q.id), body())).body.details.scanId;
    assert.equal((await api(A).post(url(p.id), body({ acknowledgedScan: qScan }))).status, 422);
  });

  it('blocks keys and tokens regardless of confirmation', async () => {
    const p = await createSample('block');
    // 저장 API는 키를 막으므로, 예전 데이터를 흉내 내 DB에 직접 넣는다
    const secret = `sk-${'a'.repeat(24)}`;
    const { error } = await aaDb().from('aa_projects').update({ readme_md: `## 목적\n키 ${secret}\n문의 ops@example.com` }).eq('id', p.id);
    assert.ifError(error);
    const res = await api(A).post(url(p.id), body());
    assert.equal(res.status, 422);
    assert.equal(res.body.details.confirmable, false);
    assert.equal(res.body.details.scanId, null);
    assert.ok(!JSON.stringify(res.body).includes(secret));
    const forced = await api(A).post(url(p.id), body({ acknowledgedScan: 'scn_000000000000000000000000' }));
    assert.equal(forced.status, 422);
    assert.equal(forced.body.details.confirmable, false);
  });
});
