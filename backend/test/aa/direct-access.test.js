// A5: 브라우저 세션(anon 키 + 로그인 JWT)으로 aa_* 테이블·RPC 직접 접근은 모두 거부 — Express API 전용 경계
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dbSkipReason, getTokens, deleteProjects, aaDb, USER_A, api, createProject, emptyModel } = require('../helpers/aa-api');

describe('AA direct browser access is blocked', { skip: dbSkipReason }, () => {
  const created = [];
  let browser, project;
  before(async () => {
    const t = await getTokens();
    browser = t.clients.A;            // anon 키 + 사용자 A 세션
    project = await createProject(t.A, created, 'direct-access');
  });
  after(async () => { await deleteProjects(created); });

  const denied = (r) => r.error && r.error.code === '42501';

  for (const table of ['aa_projects', 'aa_architecture_drafts', 'aa_requirements', 'aa_reviews', 'aa_review_answers', 'aa_architecture_versions']) {
    it(`${table} 읽기 거부`, async () => {
      assert.ok(denied(await browser.from(table).select('*').limit(1)));
    });
  }

  it('aa_projects 쓰기·수정·삭제 거부', async () => {
    assert.ok(denied(await browser.from('aa_projects').insert({ user_id: USER_A, name: '[aa-test] direct' })));
    assert.ok(denied(await browser.from('aa_projects').update({ name: 'x' }).eq('id', project.id)));
    assert.ok(denied(await browser.from('aa_projects').delete().eq('id', project.id)));
  });

  it('RPC aa_save_draft·aa_create_project·aa_next_code 호출 거부', async () => {
    assert.ok(denied(await browser.rpc('aa_save_draft', { p_project: project.id, p_user: USER_A, p_base_revision: 1, p_model: emptyModel() })));
    assert.ok(denied(await browser.rpc('aa_create_project', { p_user: USER_A, p_name: '[aa-test] direct', p_description: null, p_readme_md: '', p_model: emptyModel() })));
    assert.ok(denied(await browser.rpc('aa_next_code', { p_project: project.id, p_prefix: 'NFR' })));
  });

  it('P2a: aa_reviews 쓰기와 RPC aa_create_manual_review 호출 거부 (Sprint 5)', async () => {
    assert.ok(denied(await browser.from('aa_reviews').insert({ project_id: project.id, user_id: USER_A, draft_revision: 1 })));
    assert.ok(denied(await browser.rpc('aa_create_manual_review', {
      p_project: project.id, p_user: USER_A, p_draft_revision: 1, p_bundle_id: null, p_bundle_scope: null,
      p_bundle_md: null, p_tool: 'Claude', p_answer_md: 'x', p_client_request_id: null,
    })));
    const { count } = await aaDb().from('aa_reviews').select('id', { count: 'exact', head: true }).eq('project_id', project.id);
    assert.equal(count, 0);
  });

  it('P2b: 버전 쓰기와 RPC aa_publish_version·aa_restore_version·aa_create_manual_review_at 호출 거부 (Sprint 6)', async () => {
    assert.ok(denied(await browser.from('aa_architecture_versions').insert({
      project_id: project.id, user_id: USER_A, version_no: 1, label: 'v1.0', model: emptyModel(), model_hash: 'h', source_revision: 1,
    })));
    assert.ok(denied(await browser.rpc('aa_publish_version', {
      p_project: project.id, p_user: USER_A, p_base_revision: 1, p_expected_latest: null, p_label: 'v1.0', p_note: null,
      p_model_hash: 'h', p_requirements_snapshot: {}, p_diff_summary: null,
    })));
    assert.ok(denied(await browser.rpc('aa_restore_version', {
      p_project: project.id, p_user: USER_A, p_version: project.id, p_base_revision: 1, p_model: emptyModel(),
    })));
    assert.ok(denied(await browser.rpc('aa_create_manual_review_at', {
      p_project: project.id, p_user: USER_A, p_draft_revision: 1, p_version: null, p_bundle_id: null, p_bundle_scope: null,
      p_bundle_md: null, p_tool: 'Claude', p_answer_md: 'x', p_client_request_id: null,
    })));
    const { count } = await aaDb().from('aa_architecture_versions').select('id', { count: 'exact', head: true }).eq('project_id', project.id);
    assert.equal(count, 0);
  });

  it('거부된 시도 뒤에도 프로젝트와 Draft는 그대로', async () => {
    const { data } = await aaDb().from('aa_architecture_drafts').select('revision').eq('project_id', project.id).single();
    assert.equal(data.revision, 1);
    const p = await api((await getTokens()).A).get(`/api/aa/projects/${project.id}`);
    assert.equal(p.body.data.name, project.name);
  });
});
