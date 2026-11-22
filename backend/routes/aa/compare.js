// AA Workbench — 버전 비교 (Sprint 7 Step 4 · 05 §4 · 03 §4)
// GET /api/aa/projects/:projectId/architecture/compare?from=<versionId>&to=<versionId|draft>&includeLayout=true
// 응답에는 모델을 담지 않는다. 화면은 버전 상세·Draft에서 모델을 따로 읽는다.
const express = require('express');
const supabase = require('../../lib/supabase');
const { sendError, wrap, UUID_RE } = require('../../lib/aa/errors');
const { diffModels } = require('../../lib/aa/graph-diff');
const { buildSnapshot } = require('../../lib/aa/requirements-snapshot');
const { loadDraft, loadRequirements } = require('./versions');

const router = express.Router({ mergeParams: true });

async function loadVersion(req, id) {
  const { data, error } = await supabase.from('aa_architecture_versions')
    .select('id, version_no, label, created_at, source_revision, model, requirements_snapshot')
    .eq('project_id', req.project.id).eq('user_id', req.user.id).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

const viewMeta = (model) => (model?.views ?? []).map((v) => ({ id: v.id, kind: v.kind, name: v.name, variant: v.variant ?? null }));

router.get('/', wrap(async (req, res) => {
  const { from, to } = req.query;
  const includeLayout = req.query.includeLayout === 'true' || req.query.includeLayout === '1';
  if (typeof from !== 'string' || !UUID_RE.test(from)) return sendError(res, 400, 'VALIDATION_FAILED', 'from은 버전 id여야 합니다.');
  if (typeof to !== 'string' || !(to === 'draft' || UUID_RE.test(to))) return sendError(res, 400, 'VALIDATION_FAILED', "to는 버전 id 또는 'draft'여야 합니다.");
  if (from === to) return sendError(res, 400, 'VALIDATION_FAILED', '같은 대상끼리는 비교할 수 없습니다.');

  const a = await loadVersion(req, from);
  if (!a) return sendError(res, 404, 'NOT_FOUND', '비교할 버전을 찾을 수 없습니다.');
  let next, toInfo;
  if (to === 'draft') {
    const [draft, requirements] = await Promise.all([loadDraft(req), loadRequirements(req)]);
    if (!draft) return sendError(res, 404, 'NOT_FOUND', 'Draft를 찾을 수 없습니다.');
    next = { model: draft.model, snapshot: buildSnapshot(draft.model, requirements) };
    toInfo = { type: 'draft', revision: draft.revision, updatedAt: draft.updated_at };
  } else {
    const b = await loadVersion(req, to);
    if (!b) return sendError(res, 404, 'NOT_FOUND', '비교할 버전을 찾을 수 없습니다.');
    next = { model: b.model, snapshot: b.requirements_snapshot ?? {} };
    toInfo = { type: 'version', id: b.id, label: b.label, versionNo: b.version_no, createdAt: b.created_at };
  }
  const { summary, changes } = diffModels({ model: a.model, snapshot: a.requirements_snapshot ?? {} }, next, { includeLayout });
  res.json({
    data: {
      from: { type: 'version', id: a.id, label: a.label, versionNo: a.version_no, createdAt: a.created_at },
      to: toInfo,
      includeLayout,
      summary,
      changes,
      views: { from: viewMeta(a.model), to: viewMeta(next.model) },
    },
  });
}));

module.exports = router;
