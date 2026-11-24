const express = require('express');
const db = require('../../lib/supabase');
const { sendError, wrap, UUID_RE } = require('../../lib/aa/errors');
const { scanForSecrets } = require('../../lib/aa/sensitive-scan');
const { inUse, references } = require('../../lib/aa/requirement-refs');

const router = express.Router({ mergeParams: true });
const kinds = new Set(['fr', 'nfr']);
const categories = new Set(['availability', 'performance', 'scalability', 'security', 'operability', 'cost', 'other']);
const priorities = new Set(['must', 'should', 'could']);
const statuses = new Set(['active', 'deprecated']);
const fields = 'id, code, kind, category, title, description, target, metric, priority, status, sort_order, measurement';
const scope = (query, req) => query.eq('project_id', req.project.id).eq('user_id', req.user.id);
const serialize = ({ sort_order: sortOrder, measurement, ...row }) => ({ ...row, sortOrder, measurement: measurement ?? {} });

// Sprint 8 (REQ-06): NFR 측정 기준. 각 문자열 1~200자, 빈 값은 그 키 없음, {}·null = 없음 (05 §3)
const MEASUREMENT_KEYS = ['flowId', 'endpoint', 'environment', 'load', 'method'];
const MEASUREMENT_MAX = 200;
const FLOW_ID_RE = /^flw_[A-Za-z0-9]{10}$/;
function parseMeasurement(value) {
  if (value === null) return { value: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'measurement' };
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!MEASUREMENT_KEYS.includes(k)) return { error: `measurement.${k}` };
    if (v === null || v === undefined) continue;
    if (typeof v !== 'string') return { error: `measurement.${k}` };
    const t = v.trim();
    if (!t) continue;
    if (t.length > MEASUREMENT_MAX) return { error: `measurement.${k}` };
    if (k === 'flowId' && !FLOW_ID_RE.test(t)) return { error: 'measurement.flowId' };
    out[k] = t;
  }
  return { value: out };
}

/** 측정 기준 확인: NFR만, 키·토큰 금지, flowId는 새로 지정·변경할 때만 지금 Draft에 있는지 */
async function checkMeasurement(res, req, kind, measurement, previous) {
  if (!Object.keys(measurement).length) return true;
  if (kind !== 'nfr') { invalid(res, 'measurement'); return false; }
  const hits = scanForSecrets(measurement, 'measurement');
  if (hits.length) { sendError(res, 400, 'SENSITIVE_DATA_DETECTED', '측정 기준에 키·토큰으로 보이는 값이 있습니다.', hits); return false; }
  if (measurement.flowId && measurement.flowId !== previous?.flowId) {
    const { data: draft, error } = await scope(db.from('aa_architecture_drafts').select('model'), req).maybeSingle();
    if (error) throw error;
    if (!draft?.model?.flows?.[measurement.flowId]) { invalid(res, 'measurement.flowId'); return false; }
  }
  return true;
}
const invalid = (res, field) => sendError(res, 400, 'VALIDATION_FAILED', '요구사항 입력값을 확인해 주세요.', [{ field }]);
const missing = (res) => sendError(res, 404, 'NOT_FOUND', '요구사항을 찾을 수 없습니다.');

function parse(body, creating) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { field: 'body' };
  if (body.code !== undefined) return { field: 'code' };
  if (creating ? !kinds.has(body.kind) : body.kind !== undefined) return { field: 'kind' };
  const row = {};
  if (creating) row.kind = body.kind;
  for (const [field, allowed] of [['category', categories], ['priority', priorities], ['status', statuses]]) {
    if (body[field] === undefined) continue;
    if (!(field === 'category' && body[field] === null) && !allowed.has(body[field])) return { field };
    row[field] = body[field];
  }
  if (creating || body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120) return { field: 'title' };
    row.title = body.title.trim();
  }
  for (const [field, limit] of [['description', 5000], ['target', 500], ['metric', 500]]) {
    const value = body[field];
    if (value === undefined) continue;
    if (value !== null && (typeof value !== 'string' || value.length > limit)) return { field };
    row[field] = value;
  }
  if (body.measurement !== undefined) {
    const m = parseMeasurement(body.measurement);
    if (m.error) return { field: m.error };
    row.measurement = m.value;
  }
  const order = body.sortOrder;
  if (order !== undefined) {
    if (!Number.isInteger(order) || order < -2147483648 || order > 2147483647) return { field: 'sortOrder' };
    row.sort_order = order;
  }
  const { measurement: _m, ...plain } = row;   // eslint-disable-line no-unused-vars
  const hit = scanForSecrets(plain)[0];
  if (hit) return { field: hit.path };
  return Object.keys(row).length ? { row } : { field: 'body' };
}

router.get('/', wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  let query = scope(db.from('aa_requirements').select(fields, { count: 'exact' }), req);
  for (const [field, allowed] of [['kind', kinds], ['category', categories], ['status', statuses]]) {
    if (req.query[field] === undefined) continue;
    if (!allowed.has(req.query[field])) return invalid(res, field);
    query = query.eq(field, req.query[field]);
  }
  const { data, count, error } = await query.order('sort_order').order('code').order('id').range(offset, offset + limit - 1);
  if (error) throw error;
  res.json({ data: data.map(serialize), total: count ?? data.length });
}));

// 후속 수정(Trace): 요구사항 하나. 목록 200건 한도와 무관하게 상세를 연다. 없거나 다른 사용자·프로젝트면 404
router.get('/:reqId', wrap(async (req, res) => {
  const id = req.params.reqId;
  if (!UUID_RE.test(id)) return missing(res);
  const { data, error } = await scope(db.from('aa_requirements').select(fields).eq('id', id), req).maybeSingle();
  if (error) throw error;
  if (!data) return missing(res);
  res.json({ data: serialize(data) });
}));

router.post('/', wrap(async (req, res) => {
  const { row, field } = parse(req.body, true);
  if (field) return invalid(res, field);
  if (row.measurement && !(await checkMeasurement(res, req, row.kind, row.measurement, null))) return;
  const { data: code, error: codeError } = await db.rpc('aa_next_code', {
    p_project: req.project.id, p_prefix: row.kind.toUpperCase(),
  });
  if (codeError) throw codeError;
  const { data, error } = await db.from('aa_requirements')
    .insert({ ...row, code, project_id: req.project.id, user_id: req.user.id }).select(fields).single();
  if (error) throw error;
  res.status(201).json({ data: serialize(data) });
}));

router.patch('/:reqId', wrap(async (req, res) => {
  const id = req.params.reqId;
  if (!UUID_RE.test(id)) return missing(res);
  const { row, field } = parse(req.body, false);
  if (field) return invalid(res, field);
  if (row.measurement) {
    const { data: current, error: lookupError } = await scope(db.from('aa_requirements').select('kind, measurement').eq('id', id), req).maybeSingle();
    if (lookupError) throw lookupError;
    if (!current) return missing(res);
    if (!(await checkMeasurement(res, req, current.kind, row.measurement, current.measurement))) return;
  }
  const { data, error } = await scope(db.from('aa_requirements').update(row).eq('id', id), req)
    .select(fields).maybeSingle();
  if (error) throw error;
  if (!data) return missing(res);
  res.json({ data: serialize(data) });
}));

router.delete('/:reqId', wrap(async (req, res) => {
  const id = req.params.reqId;
  if (!UUID_RE.test(id)) return missing(res);
  const { data: requirement, error: lookupError } = await scope(
    db.from('aa_requirements').select('id').eq('id', id), req,
  ).maybeSingle();
  if (lookupError) throw lookupError;
  if (!requirement) return missing(res);
  const { data: draft, error: draftError } = await scope(db.from('aa_architecture_drafts').select('model'), req).maybeSingle();
  if (draftError) throw draftError;
  const details = references(draft?.model, requirement.id);
  if (inUse(details)) {
    return sendError(res, 409, 'IN_USE', '설계에서 사용 중인 요구사항입니다.', details);
  }
  const { data, error } = await scope(db.from('aa_requirements').delete().eq('id', id), req).select('id').maybeSingle();
  if (error) throw error;
  if (!data) return missing(res);
  res.status(204).end();
}));

module.exports = router;
