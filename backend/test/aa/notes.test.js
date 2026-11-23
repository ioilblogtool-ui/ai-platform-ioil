const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { dbSkipReason, getTokens, deleteProjects, aaDb, api, createProject, sampleModel, emptyModel } = require('../helpers/aa-api');

describe('AA notes P2c', { skip: dbSkipReason }, () => {
  const created = [];
  let A;
  let B;
  const project = (id) => '/api/aa/projects/' + id;
  before(async () => { ({ A, B } = await getTokens()); });
  after(async () => { await deleteProjects(created); });

  it('preserves missing-target notes, validates moves, and scopes access', async () => {
    const client = api(A);
    const { id } = await createProject(A, created, 's9-notes');
    const root = project(id);
    const notes = root + '/notes';
    const draft = root + '/architecture/draft';
    assert.equal((await client.put(draft, { baseRevision: 1, model: sampleModel() })).status, 200);
    const result = await client.post(notes, { targetType: 'component', targetRef: 'cmp_api00001', kind: 'question', bodyMd: 'Check latency' });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const note = result.body.data;
    const url = notes + '/' + note.id;
    assert.equal(note.targetLabel, 'Reports API');
    assert.equal(note.status, 'open');
    assert.equal((await api(B).get(notes)).status, 404);
    assert.equal((await api(B).patch(url, { title: 'Wrong owner' })).status, 404);
    assert.equal((await client.patch(url, { targetVersionId: randomUUID() })).status, 400);
    assert.equal((await client.put(draft, { baseRevision: 2, model: emptyModel() })).status, 200);
    assert.equal((await client.get(notes)).body.data[0].targetMissing, true);
    const edited = await client.patch(url, { bodyMd: 'Check p95', status: 'done', pinned: true });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.targetMissing, true);
    const moved = await client.patch(url, { targetType: 'project', targetRef: null });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.targetMissing, false);
    assert.equal(moved.body.data.bodyMd, 'Check p95');
    assert.equal(moved.body.data.pinned, true);
    assert.equal((await client.del(url)).status, 204);
    assert.equal((await client.del(url)).status, 404);
  });

  it('validates note fields, summarizes beyond one page, and cascades project deletion', async () => {
    const client = api(A);
    const { id, name } = await createProject(A, created, 's9-notes-summary');
    const notes = project(id) + '/notes';
    const base = { targetType: 'project' };
    for (const payload of [
      { ...base, status: 'open' },
      { ...base, title: 'a'.repeat(121) },
      { ...base, source: 'a'.repeat(201) },
      { ...base, bodyMd: '가'.repeat(21846) },
      { targetType: 'stage', targetRef: 'wrong' },
      { targetType: 'requirement', targetRef: randomUUID() },
    ]) assert.equal((await client.post(notes, payload)).status, 400);
    assert.equal((await client.post(notes, { targetType: 'validation' })).body.code, 'NOT_AVAILABLE');
    assert.equal((await client.post(notes, { ...base, bodyMd: '-----BEGIN PRIVATE KEY-----' })).body.code, 'SENSITIVE_DATA_DETECTED');
    const owner = await aaDb().from('aa_projects').select('user_id').eq('id', id).single();
    assert.ifError(owner.error);
    const { error } = await aaDb().from('aa_notes').insert(Array.from({ length: 205 }, () => ({
      project_id: id, user_id: owner.data.user_id, target_type: 'stage', target_ref: 'design', kind: 'todo', status: 'open',
    })));
    assert.ifError(error);
    const list = await client.get(notes + '?limit=200');
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 200);
    assert.equal(list.body.total, 205);
    const summary = await client.get(notes + '/summary');
    assert.equal(summary.status, 200);
    assert.deepEqual(summary.body.data.byStage.design, { total: 205, openQuestions: 0, openTodos: 205 });
    assert.equal((await client.del(project(id) + '?confirm=' + encodeURIComponent(name))).status, 204);
    const remaining = await aaDb().from('aa_notes').select('id', { head: true, count: 'exact' }).eq('project_id', id);
    assert.ifError(remaining.error);
    assert.equal(remaining.count, 0);
  });
  it('exports only selected notes and requires a new acknowledgement when a note changes', async () => {
    const client = api(A);
    const { id } = await createProject(A, created, 's9-notes-export');
    const root = project(id);
    const notes = root + '/notes';
    const url = root + '/export';
    const base = { format: 'ai-json', source: { type: 'draft' } };
    const createNote = async (kind, title, bodyMd) => {
      const createdNote = await client.post(notes, { targetType: 'project', kind, title, bodyMd });
      assert.equal(createdNote.status, 201);
      return createdNote.body.data.id;
    };
    const selected = await createNote('question', 'Selected note', 'Test endpoint 10.0.0.12');
    const ignored = await createNote('memo', 'Ignored note', 'Unselected');
    const answer = await createNote('ai_answer', 'AI answer memo', 'Excluded');
    const plain = await client.post(url, base);
    assert.equal(plain.status, 200);
    assert.equal(Object.hasOwn(JSON.parse(plain.body.data.content), 'notes'), false);
    assert.equal((await client.post(url, { ...base, noteIds: [answer] })).status, 400);
    assert.equal((await client.post(url, { ...base, noteIds: [randomUUID()] })).status, 404);
    assert.equal((await client.post(url, { ...base, noteIds: Array.from({ length: 21 }, () => ignored) })).status, 400);
    const selection = { ...base, noteIds: [selected] };
    const warning = await client.post(url, selection);
    assert.equal(warning.status, 422);
    assert.equal(warning.body.details.confirmable, true);
    const approved = { ...selection, acknowledgedScan: warning.body.details.scanId };
    const result = await client.post(url, approved);
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body.data.content).notes, [{ kind: 'question', target: '프로젝트', title: 'Selected note', bodyMd: 'Test endpoint 10.0.0.12' }]);
    assert.equal(result.body.data.content.includes(selected), false);
    assert.equal((await client.patch(notes + '/' + selected, { bodyMd: 'Changed test endpoint 10.0.0.12' })).status, 200);
    const rescanned = await client.post(url, approved);
    assert.equal(rescanned.status, 422);
    assert.notEqual(rescanned.body.details.scanId, warning.body.details.scanId);
    const markdown = await client.post(url, { ...base, format: 'ai-md', noteIds: [ignored] });
    assert.equal(markdown.status, 200);
    assert.match(markdown.body.data.content, /# 노트[\s\S]*Ignored note/);
    assert.equal(markdown.body.data.content.includes('Selected note'), false);
  });

});
