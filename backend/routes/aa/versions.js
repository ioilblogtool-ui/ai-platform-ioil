// AA Workbench — 버전 발행·열람·복원 (Sprint 6 Step 2 · 05 §4 · 03 §6.2)
// 경로: /api/aa/projects/:projectId/architecture/versions  (requireAuth·loadProject는 projects.js에서)
// 버전은 불변이다. 발행은 RPC aa_publish_version 1회, 복원은 aa_restore_version 1회.
const express = require('express');
const supabase = require('../../lib/supabase');
const { sendError, wrap, UUID_RE } = require('../../lib/aa/errors');
const { scanForSecrets } = require('../../lib/aa/sensitive-scan');
const { modelHash } = require('../../lib/aa/model-canon');
const { summarize, hasSemanticChanges } = require('../../lib/aa/graph-diff');
const { buildSnapshot, snapshotHash, FIELDS } = require('../../lib/aa/requirements-snapshot');
const { layoutChanges } = require('../../lib/aa/model-canon');
const { reconcile } = require('../../lib/aa/requirement-refs');
const { placementWarnings } = require('../../lib/aa/architecture-validator');

const router = express.Router({ mergeParams: true });

const LABEL_MAX = 40;
const NOTE_MAX = 2000;
const LIST_FIELDS = 'id, version_no, label, note, diff_summary, source_revision, created_at';

const toListItem = (v) => ({
  id: v.id, versionNo: v.version_no, label: v.label, note: v.note,
  diffSummary: v.diff_summary, sourceRevision: v.source_revision, createdAt: v.created_at,
});

async function loadDraft(req) {
  const { data, error } = await supabase.from('aa_architecture_drafts')
    .select('model, revision, base_version_id, updated_at')
    .eq('project_id', req.project.id).eq('user_id', req.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadRequirements(req) {
  const { data, error } = await supabase.from('aa_requirements')
    .select(`id, status, ${FIELDS.join(', ')}`)
    .eq('project_id', req.project.id).eq('user_id', req.user.id)
    .limit(5000);
  if (error) throw error;
  return data;
}

/** 최신 버전 (model 포함 여부 선택) */
async function loadLatest(req, { withModel = false } = {}) {
  const cols = withModel ? `${LIST_FIELDS}, model, model_hash, requirements_snapshot` : LIST_FIELDS;
  const { data, error } = await supabase.from('aa_architecture_versions').select(cols)
    .eq('project_id', req.project.id).eq('user_id', req.user.id)
    .order('version_no', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadLabels(req) {
  const { data, error } = await supabase.from('aa_architecture_versions').select('label')
    .eq('project_id', req.project.id).eq('user_id', req.user.id);
  if (error) throw error;
  return new Set(data.map((r) => r.label));
}

/** 직전 vX.Y → vX.(Y+1), 없으면 v1.0. 겹치면 다음 번호 */
function suggestLabel(latest, taken) {
  let major = 1, minor = 0;
  const m = latest && /^v(\d+)\.(\d+)$/.exec(latest.label);
  if (m) { major = Number(m[1]); minor = Number(m[2]) + 1; } else if (latest) { major = latest.version_no + 1; minor = 0; }
  let label = `v${major}.${minor}`;
  while (taken.has(label)) label = `v${major}.${++minor}`;
  return label;
}

/** 지금 Draft를 발행하면 어떻게 되는지 (저장 없음). 버전 모델은 저장된 Draft 모델 그대로 — RPC가 같은 값을 복사한다 */
async function computePublish(req) {
  const [draft, requirements, latest] = await Promise.all([loadDraft(req), loadRequirements(req), loadLatest(req, { withModel: true })]);
  if (!draft) return null;
  const snapshot = buildSnapshot(draft.model, requirements);
  const hash = modelHash(draft.model);
  const summary = summarize(latest ? { model: latest.model, snapshot: latest.requirements_snapshot } : null, { model: draft.model, snapshot });
  const noChanges = Boolean(latest) && !hasSemanticChanges(summary);
  return {
    draft, latest, snapshot, hash, summary, noChanges,
    layoutOnly: latest ? layoutChanges(latest.model, draft.model) : 0,
    snapshotHash: snapshotHash(snapshot),
  };
}

// ── 목록 ────────────────────────────────────────────────────
router.get('/', wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const { data, count, error } = await supabase.from('aa_architecture_versions')
    .select(LIST_FIELDS, { count: 'exact' })
    .eq('project_id', req.project.id).eq('user_id', req.user.id)
    .order('version_no', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  res.json({ data: data.map(toListItem), total: count ?? data.length });
}));

// ── 발행 미리보기 (SCR-07) ──────────────────────────────────────
router.get('/preview', wrap(async (req, res) => {
  const c = await computePublish(req);
  if (!c) return sendError(res, 404, 'NOT_FOUND', 'Draft를 찾을 수 없습니다.');
  const taken = await loadLabels(req);
  // Sprint 11 (C2): VM 복귀 대상 미지정·실행 요소 없음(V19)은 발행을 막지 않고 미리보기에 경고로 담는다. 없으면 키 생략
  const warnings = placementWarnings(c.draft.model).filter((w) => w.rule === 'V19');
  res.json({
    ...(warnings.length ? { warnings } : {}),
    data: {
      revision: c.draft.revision,
      latestVersion: c.latest ? { id: c.latest.id, label: c.latest.label, versionNo: c.latest.version_no } : null,
      suggestedLabel: suggestLabel(c.latest, taken),
      summary: c.summary,
      noChanges: c.noChanges,
      layoutOnly: c.layoutOnly,
      snapshotHash: c.snapshotHash,
    },
  });
}));

// ── 상세 ────────────────────────────────────────────────────
router.get('/:versionId', wrap(async (req, res) => {
  if (!UUID_RE.test(req.params.versionId)) return sendError(res, 404, 'NOT_FOUND', '버전을 찾을 수 없습니다.');
  const { data: v, error } = await supabase.from('aa_architecture_versions')
    .select(`${LIST_FIELDS}, model, readme_md, requirements_snapshot`)
    .eq('project_id', req.project.id).eq('user_id', req.user.id).eq('id', req.params.versionId).maybeSingle();
  if (error) throw error;
  if (!v) return sendError(res, 404, 'NOT_FOUND', '버전을 찾을 수 없습니다.');

  // 발행 당시 요구사항 + 지금 값과의 차이 (Q6)
  const current = new Map((await loadRequirements(req)).map((r) => [r.id, r]));
  const requirements = Object.entries(v.requirements_snapshot ?? {}).map(([id, snap]) => {
    const now = current.get(id);
    const item = { id, ...snap };
    if (!now) return { ...item, deleted: true };
    const diff = ['title', 'target', 'metric', 'priority'].some((f) => (now[f] ?? null) !== (snap[f] ?? null));
    return diff ? { ...item, current: { title: now.title, target: now.target, metric: now.metric, priority: now.priority } } : item;
  }).sort((a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true }));

  res.json({ data: { ...toListItem(v), model: v.model, readmeMd: v.readme_md, requirements } });
}));

// ── 발행 ────────────────────────────────────────────────────
// { label?, note?, baseRevision, expectedLatestVersionId (uuid|null), snapshotHash }
router.post('/', wrap(async (req, res) => {
  const { label, note, baseRevision, expectedLatestVersionId, snapshotHash: expectedSnapshot } = req.body || {};
  if (!Number.isInteger(baseRevision) || baseRevision < 1) return sendError(res, 400, 'VALIDATION_FAILED', 'baseRevision은 1 이상의 정수여야 합니다.');
  if (!(expectedLatestVersionId === null || (typeof expectedLatestVersionId === 'string' && UUID_RE.test(expectedLatestVersionId)))) {
    return sendError(res, 400, 'VALIDATION_FAILED', 'expectedLatestVersionId는 미리보기의 latestVersion.id(없으면 null)여야 합니다.');
  }
  if (typeof expectedSnapshot !== 'string' || !expectedSnapshot) return sendError(res, 400, 'VALIDATION_FAILED', 'snapshotHash는 미리보기 값이어야 합니다.');
  if (label !== undefined && label !== null && typeof label !== 'string') return sendError(res, 400, 'VALIDATION_FAILED', '라벨은 문자열이어야 합니다.');
  const trimmed = typeof label === 'string' ? label.trim() : '';
  if (trimmed.length > LABEL_MAX) return sendError(res, 400, 'VALIDATION_FAILED', `라벨은 ${LABEL_MAX}자 이하여야 합니다.`);
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > NOTE_MAX)) {
    return sendError(res, 400, 'VALIDATION_FAILED', `메모는 ${NOTE_MAX}자 이하 문자열이어야 합니다.`);
  }
  const hits = [...scanForSecrets(trimmed, 'label'), ...scanForSecrets(note ?? '', 'note')];
  if (hits.length) return sendError(res, 400, 'SENSITIVE_DATA_DETECTED', '키·토큰으로 보이는 값이 있어 발행하지 않았습니다.', hits);

  const c = await computePublish(req);
  if (!c) return sendError(res, 404, 'NOT_FOUND', 'Draft를 찾을 수 없습니다.');
  if (c.draft.revision !== baseRevision) {
    return sendError(res, 409, 'REVISION_CONFLICT', '다른 곳에서 더 최근에 저장되었습니다.', { currentRevision: c.draft.revision, updatedAt: c.draft.updated_at });
  }
  const latestId = c.latest?.id ?? null;
  if (latestId !== (expectedLatestVersionId ?? null)) {
    return sendError(res, 409, 'VERSION_CHANGED', '그 사이 다른 버전이 발행되었습니다. 새로 미리보기를 확인하세요.',
      { latestVersion: c.latest ? { id: c.latest.id, label: c.latest.label } : null });
  }
  if (c.snapshotHash !== expectedSnapshot) {
    return sendError(res, 409, 'PREVIEW_STALE', '미리보기 뒤 요구사항이 바뀌었습니다. 새로 미리보기를 확인하세요.');
  }
  if (c.noChanges) {
    return sendError(res, 409, 'NO_CHANGES', c.layoutOnly ? '배치만 바뀌어 발행할 변경이 없습니다.' : '직전 버전과 달라진 내용이 없습니다.', { layoutOnly: c.layoutOnly });
  }

  const finalLabel = trimmed || suggestLabel(c.latest, await loadLabels(req));
  const { data, error } = await supabase.rpc('aa_publish_version', {
    p_project: req.project.id, p_user: req.user.id, p_base_revision: baseRevision, p_expected_latest: latestId,
    p_label: finalLabel, p_note: note ? note : null, p_model_hash: c.hash,
    p_requirements_snapshot: c.snapshot, p_diff_summary: c.summary,
  });
  if (error) throw error;

  switch (data?.status) {
    case 'ok':
      return res.status(201).json({ data: { id: data.id, versionNo: data.version_no, label: data.label, diffSummary: c.summary, createdAt: data.created_at } });
    case 'conflict':
      return sendError(res, 409, 'REVISION_CONFLICT', '다른 곳에서 더 최근에 저장되었습니다.', { currentRevision: data.revision });
    case 'version_changed':
      // 이 요청의 미리보기 뒤에 다른 발행이 끼어듦 → 사용자가 본 기준이 낡았으므로 재시도하지 않는다 (Step 2 결정)
      return sendError(res, 409, 'VERSION_CHANGED', '그 사이 다른 버전이 발행되었습니다. 새로 미리보기를 확인하세요.',
        { latestVersion: data.latest_id ? { id: data.latest_id, label: data.latest_label } : null });
    case 'no_changes':
      return sendError(res, 409, 'NO_CHANGES', '직전 버전과 달라진 내용이 없습니다.', { layoutOnly: c.layoutOnly });
    case 'label_taken':
      return sendError(res, 409, 'LABEL_TAKEN', `이미 쓰인 라벨입니다: ${finalLabel}`, { label: finalLabel });
    case 'not_found':
      return sendError(res, 404, 'NOT_FOUND', 'Draft를 찾을 수 없습니다.');
    default:
      throw new Error(`unexpected publish status: ${JSON.stringify(data)}`);
  }
}));

// ── 복원 ────────────────────────────────────────────────────
// { baseRevision } → Draft = 버전 모델에서 지금 없는 요구사항 참조만 뺀 것 (같은 저장에서 V9 정리, Q8)
router.post('/:versionId/restore', wrap(async (req, res) => {
  const { baseRevision } = req.body || {};
  if (!UUID_RE.test(req.params.versionId)) return sendError(res, 404, 'NOT_FOUND', '버전을 찾을 수 없습니다.');
  if (!Number.isInteger(baseRevision) || baseRevision < 1) return sendError(res, 400, 'VALIDATION_FAILED', 'baseRevision은 1 이상의 정수여야 합니다.');
  const { data: v, error } = await supabase.from('aa_architecture_versions').select('id, model')
    .eq('project_id', req.project.id).eq('user_id', req.user.id).eq('id', req.params.versionId).maybeSingle();
  if (error) throw error;
  if (!v) return sendError(res, 404, 'NOT_FOUND', '버전을 찾을 수 없습니다.');

  const { model, warnings } = await reconcile(supabase, req.project.id, req.user.id, v.model);
  const { data, error: rpcError } = await supabase.rpc('aa_restore_version', {
    p_project: req.project.id, p_user: req.user.id, p_version: v.id, p_base_revision: baseRevision, p_model: model,
  });
  if (rpcError) throw rpcError;
  switch (data?.status) {
    case 'ok':
      return res.json({ data: { revision: data.revision, updatedAt: data.updated_at }, warnings });
    case 'conflict':
      return sendError(res, 409, 'REVISION_CONFLICT', '다른 곳에서 더 최근에 저장되었습니다.', { currentRevision: data.revision });
    case 'version_not_found':
    case 'not_found':
      return sendError(res, 404, 'NOT_FOUND', '버전을 찾을 수 없습니다.');
    default:
      throw new Error(`unexpected restore status: ${JSON.stringify(data)}`);
  }
}));

module.exports = router;
module.exports.suggestLabel = suggestLabel;
module.exports.loadDraft = loadDraft;
module.exports.loadRequirements = loadRequirements;
