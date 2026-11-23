const express = require('express');
const db = require('../../lib/supabase');
const { sendError, wrap, UUID_RE } = require('../../lib/aa/errors');
const { scanForSecrets } = require('../../lib/aa/sensitive-scan');

const router = express.Router({ mergeParams: true });
const fields = 'id, target_type, target_ref, target_version_id, kind, status, title, body_md, source, pinned, created_at, updated_at';
const stages = ['requirements', 'design', 'review', 'validation', 'retro'];
const modelKeys = { component: 'components', relation: 'relations', flow: 'flows', view: 'views' };
const kinds = ['memo', 'question', 'todo', 'decision', 'ai_answer'];
const targetTypes = ['project', 'stage', ...Object.keys(modelKeys), 'requirement', 'version', 'finding', 'validation'];
const scope = (query, req) => query.eq('project_id', req.project.id).eq('user_id', req.user.id);
const invalid = (res, field) => sendError(res, 400, 'VALIDATION_FAILED', '노트 입력값을 확인해 주세요.', [{ field }]);
const missing = (res) => sendError(res, 404, 'NOT_FOUND', '노트를 찾을 수 없습니다.');

async function read(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

function modelTarget(model, type, ref) {
  const items = model?.[modelKeys[type]];
  return Array.isArray(items) ? items.find((item) => item.id === ref) : items && Object.hasOwn(items, ref) ? items[ref] : undefined;
}

function parse(body, previous) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { field: 'body' };
  const row = {};
  const kind = previous?.kind ?? body.kind ?? 'memo';
  if ((!previous && !kinds.includes(kind)) || (previous && body.kind !== undefined)) return { field: 'kind' };
  const hasStatus = kind === 'question' || kind === 'todo';
  if (body.status !== undefined && (!hasStatus || !['open', 'done'].includes(body.status))) return { field: 'status' };
  if (!previous) Object.assign(row, { kind, status: hasStatus ? 'open' : null });
  if (previous && body.status !== undefined) row.status = body.status;

  for (const [key, column, limit] of [['title', 'title', 120], ['source', 'source', 200], ['bodyMd', 'body_md', 65536]]) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null && key !== 'bodyMd') { row[column] = null; continue; }
    if (typeof value !== 'string' || (key === 'bodyMd' ? Buffer.byteLength(value, 'utf8') : [...value].length) > limit) return { field: key };
    row[column] = value;
  }
  if (body.pinned !== undefined) {
    if (typeof body.pinned !== 'boolean') return { field: 'pinned' };
    row.pinned = body.pinned;
  }
  const hits = scanForSecrets({ title: row.title, source: row.source, bodyMd: row.body_md });
  if (hits.length) return { sensitive: true };

  const targetChanged = !previous || ['targetType', 'targetRef', 'targetVersionId'].some((key) => Object.hasOwn(body, key));
  if (targetChanged) {
    row.target_type = Object.hasOwn(body, 'targetType') ? body.targetType : previous?.target_type;
    row.target_ref = Object.hasOwn(body, 'targetRef') ? body.targetRef : previous?.target_ref ?? null;
    row.target_version_id = Object.hasOwn(body, 'targetVersionId') ? body.targetVersionId : previous?.target_version_id ?? null;
  }
  return { row, targetChanged };
}

const draftModel = async (req) => (await read(scope(db.from('aa_architecture_drafts').select('model'), req).maybeSingle()))?.model;
const version = (req, id) => read(scope(db.from('aa_architecture_versions').select('id, label, model'), req).eq('id', id).maybeSingle());
const requirement = (req, id) => read(scope(db.from('aa_requirements').select('id, title'), req).eq('id', id).maybeSingle());

async function validateTarget(req, res, row) {
  const { target_type: type, target_ref: ref, target_version_id: versionId } = row;
  let field;
  if (!targetTypes.includes(type)) field = 'targetType';
  else if (type === 'finding' || type === 'validation') {
    sendError(res, 400, 'NOT_AVAILABLE', '아직 사용할 수 없는 노트 대상입니다.');
    return false;
  } else if (ref !== null && (typeof ref !== 'string' || ref.length > 100)) field = 'targetRef';
  else if (versionId !== null && (typeof versionId !== 'string' || !UUID_RE.test(versionId) || !Object.hasOwn(modelKeys, type))) field = 'targetVersionId';
  else if (type === 'project' && ref !== null) field = 'targetRef';
  else if (type === 'stage' && !stages.includes(ref)) field = 'targetRef';
  else if (type === 'version' || type === 'requirement') {
    if (typeof ref !== 'string' || !UUID_RE.test(ref) || !(await (type === 'version' ? version : requirement)(req, ref))) field = 'targetRef';
  } else if (Object.hasOwn(modelKeys, type)) {
    const snapshot = versionId ? await version(req, versionId) : null;
    if (versionId && !snapshot) field = 'targetVersionId';
    else if (!ref || !modelTarget(versionId ? snapshot.model : await draftModel(req), type, ref)) field = 'targetRef';
  }
  if (field) invalid(res, field);
  return !field;
}

async function present(req, rows) {
  const model = rows.some((row) => Object.hasOwn(modelKeys, row.target_type)) ? await draftModel(req) : null;
  const idsFor = (type) => [...new Set(rows.filter((row) => row.target_type === type).map((row) => row.target_ref).filter((id) => id && UUID_RE.test(id)))];
  const versions = idsFor('version');
  const requirements = idsFor('requirement');
  const [versionRows, requirementRows] = await Promise.all([
    versions.length ? read(scope(db.from('aa_architecture_versions').select('id, label'), req).in('id', versions)) : [],
    requirements.length ? read(scope(db.from('aa_requirements').select('id, title'), req).in('id', requirements)) : [],
  ]);
  const labels = new Map([...versionRows, ...requirementRows].map((row) => [row.id, row.label ?? row.title]));
  return rows.map(({ target_type: targetType, target_ref: targetRef, target_version_id: targetVersionId, body_md: bodyMd, created_at: createdAt, updated_at: updatedAt, ...rest }) => {
    let targetLabel = targetRef;
    let targetMissing = false;
    if (targetType === 'project') targetLabel = req.project.name ?? null;
    else if (targetType === 'version' || targetType === 'requirement') {
      targetLabel = labels.get(targetRef) ?? null;
      targetMissing = !labels.has(targetRef);
    } else if (Object.hasOwn(modelKeys, targetType)) {
      const target = modelTarget(model, targetType, targetRef);
      targetMissing = !target;
      targetLabel = target?.name || target?.label || target?.variant || (target ? targetRef : null);
    }
    return { ...rest, targetType, targetRef, targetVersionId, targetMissing, targetLabel, bodyMd, createdAt, updatedAt };
  });
}

router.get('/', wrap(async (req, res) => {
  const { targetType, targetRef, targetVersionId, kind, status, q } = req.query;
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  let query = scope(db.from('aa_notes').select(fields, { count: 'exact' }), req);
  for (const [value, column, allowed] of [[targetType, 'target_type', targetTypes], [kind, 'kind', kinds], [status, 'status', ['open', 'done']]]) {
    if (value === undefined) continue;
    if (!allowed.includes(value)) return invalid(res, column);
    query = query.eq(column, value);
  }
  if (targetRef !== undefined) {
    if (typeof targetRef !== 'string' || targetRef.length > 100) return invalid(res, 'targetRef');
    query = query.eq('target_ref', targetRef);
  }
  if (targetVersionId !== undefined) {
    if (typeof targetVersionId !== 'string' || !UUID_RE.test(targetVersionId)) return invalid(res, 'targetVersionId');
    query = query.eq('target_version_id', targetVersionId);
  }
  if (q !== undefined) {
    if (typeof q !== 'string' || q.length > 200) return invalid(res, 'q');
    query = query.ilike('body_md', '%' + q.replace(/[\\%_]/g, '\\$&') + '%');
  }
  const { data, error, count } = await query.order('pinned', { ascending: false }).order('updated_at', { ascending: false }).order('id').range(offset, offset + limit - 1);
  if (error) throw error;
  res.json({ data: await present(req, data), total: count });
}));

router.get('/summary', wrap(async (req, res) => {
  const counts = () => ({ total: 0, openQuestions: 0, openTodos: 0 });
  const targets = new Map();
  const byStage = Object.fromEntries(stages.map((stage) => [stage, counts()]));
  const project = counts();
  function record(bucket, row) {
    bucket.total++;
    if (row.status === 'open' && row.kind === 'question') bucket.openQuestions++;
    if (row.status === 'open' && row.kind === 'todo') bucket.openTodos++;
  }
  let after;
  for (;;) {
    let query = scope(db.from('aa_notes').select('id, target_type, target_ref, kind, status'), req).order('id').limit(200);
    if (after) query = query.gt('id', after);
    const rows = await read(query);
    for (const row of rows) {
      const key = JSON.stringify([row.target_type, row.target_ref]);
      if (!targets.has(key)) targets.set(key, { targetType: row.target_type, targetRef: row.target_ref, ...counts() });
      record(targets.get(key), row);
      if (row.target_type === 'project') record(project, row);
      if (row.target_type === 'stage' && Object.hasOwn(byStage, row.target_ref)) record(byStage[row.target_ref], row);
    }
    if (rows.length < 200) break;
    after = rows.at(-1).id;
  }
  res.json({ data: { byTarget: [...targets.values()], byStage, project } });
}));

async function save(req, res, previous) {
  const result = parse(req.body, previous);
  if (result.field) return invalid(res, result.field);
  if (result.sensitive) return sendError(res, 400, 'SENSITIVE_DATA_DETECTED', '노트에 키·토큰으로 보이는 값이 있습니다.');
  const { row, targetChanged } = result;
  if (targetChanged && !(await validateTarget(req, res, row))) return;
  const table = db.from('aa_notes');
  const saved = previous
    ? Object.keys(row).length ? await read(scope(table.update(row), req).eq('id', previous.id).select(fields).maybeSingle()) : previous
    : await read(table.insert({ ...row, project_id: req.project.id, user_id: req.user.id }).select(fields).single());
  if (!saved) return missing(res);
  const [data] = await present(req, [saved]);
  res.status(previous ? 200 : 201).json({ data });
}

router.post('/', wrap((req, res) => save(req, res)));
router.patch('/:noteId', wrap(async (req, res) => {
  if (!UUID_RE.test(req.params.noteId)) return missing(res);
  const previous = await read(scope(db.from('aa_notes').select(fields), req).eq('id', req.params.noteId).maybeSingle());
  if (!previous) return missing(res);
  return save(req, res, previous);
}));
router.delete('/:noteId', wrap(async (req, res) => {
  if (!UUID_RE.test(req.params.noteId)) return missing(res);
  const row = await read(scope(db.from('aa_notes').delete(), req).eq('id', req.params.noteId).select('id').maybeSingle());
  if (!row) return missing(res);
  res.status(204).end();
}));

module.exports = router;
