// AA Workbench — 프로젝트 & Draft API (05 API §2, §4)
// 모든 경로: requireAuth → (:projectId 있으면) loadProject 소유권 확인.
// user_id·project_id는 항상 req.user.id·req.project.id에서 채운다 (요청 본문 값은 쓰지 않음).
const express = require('express');
const supabase = require('../../lib/supabase');
const { requireAuth } = require('../../middleware/auth');
const { loadProject } = require('../../middleware/aa-project');
const { sendError, wrap } = require('../../lib/aa/errors');
const { validateModel } = require('../../lib/aa/architecture-validator');
const { scanForSecrets } = require('../../lib/aa/sensitive-scan');
const { emptyModel, README_TEMPLATE } = require('../../lib/aa/empty-model');

const { reconcile } = require('../../lib/aa/requirement-refs');
const sampleReports = require('../../lib/aa/templates/sample-reports');
const { createSampleProject, SampleSeedError } = require('../../lib/aa/sample-project');

// 새 프로젝트 템플릿 (empty는 기본). 샘플 모델은 SQL 변경 없이 aa_create_project의 p_model로 넘긴다
const TEMPLATES = { [sampleReports.key]: sampleReports };

const router = express.Router();
router.use(requireAuth);
router.param('projectId', loadProject);
router.use('/:projectId/requirements', require('./requirements'));
router.use('/:projectId/export', require('./export'));
router.use('/:projectId/reviews', require('./reviews'));

const README_MAX_BYTES = 64 * 1024;
const DESCRIPTION_MAX = 2000;
const STATUSES = new Set(['active', 'archived']);

function toProject(row, extra = {}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    readmeMd: row.readme_md,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

// 입력 검증: 실패하면 { field, message } 반환
function checkName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) return { field: 'name', message: '이름은 1~120자여야 합니다.' };
  return null;
}
function checkDescription(d) {
  if (d === undefined || d === null) return null;
  if (typeof d !== 'string' || d.length > DESCRIPTION_MAX) return { field: 'description', message: `설명은 ${DESCRIPTION_MAX}자 이하 문자열이어야 합니다.` };
  return null;
}
function checkReadme(md) {
  if (md === undefined) return null;
  if (typeof md !== 'string' || Buffer.byteLength(md, 'utf8') > README_MAX_BYTES) return { field: 'readmeMd', message: '개요는 64KB 이하 문자열이어야 합니다.' };
  const hits = scanForSecrets(md, 'readmeMd');
  if (hits.length) return { field: 'readmeMd', message: `민감정보로 보이는 값이 있어 저장할 수 없습니다 (${hits[0].rule}: ${hits[0].sample}).` };
  return null;
}

// ── 프로젝트 목록 ────────────────────────────────────────────
// GET /api/aa/projects?status=active&q=…&limit=50&offset=0
router.get('/', wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  let query = supabase
    .from('aa_projects')
    .select('id, name, description, status, readme_md, created_at, updated_at', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (req.query.status !== undefined) {
    if (!STATUSES.has(req.query.status)) return sendError(res, 400, 'VALIDATION_FAILED', 'status는 active 또는 archived여야 합니다.');
    query = query.eq('status', req.query.status);
  }
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const escaped = req.query.q.trim().slice(0, 100).replace(/[\\%_]/g, (c) => '\\' + c);
    query = query.ilike('name', `%${escaped}%`);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  // Draft 수정 시각 (프로젝트당 1행)
  const ids = data.map((p) => p.id);
  const drafts = new Map();
  if (ids.length) {
    const { data: rows, error: dErr } = await supabase
      .from('aa_architecture_drafts')
      .select('project_id, revision, updated_at')
      .eq('user_id', req.user.id)
      .in('project_id', ids);
    if (dErr) throw dErr;
    rows.forEach((r) => drafts.set(r.project_id, r));
  }

  res.json({
    data: data.map((p) => toProject(p, {
      latestVersion: null,                          // Phase 2 (버전)
      draftRevision: drafts.get(p.id)?.revision ?? null,
      draftUpdatedAt: drafts.get(p.id)?.updated_at ?? null,
      openFindings: { high: 0, medium: 0, low: 0 }, // Phase 3
    })),
    total: count ?? data.length,
  });
}));

// ── 프로젝트 생성 (+ 빈 Draft, RPC 한 트랜잭션) ─────────────────
// POST /api/aa/projects  { name, description?, readmeMd?, template? }
router.post('/', wrap(async (req, res) => {
  const { name, description, readmeMd, template = 'empty' } = req.body || {};
  const problem = checkName(name) || checkDescription(description) || checkReadme(readmeMd);
  if (problem) return sendError(res, 400, 'VALIDATION_FAILED', problem.message, [problem]);
  const sample = typeof template === 'string' && Object.hasOwn(TEMPLATES, template) ? TEMPLATES[template] : null;
  if (template !== 'empty' && !sample) {
    return sendError(res, 400, 'VALIDATION_FAILED', `지원하지 않는 템플릿입니다. (${['empty', ...Object.keys(TEMPLATES)].join(', ')})`);
  }

  if (sample) {
    // 샘플: 프로젝트 + Draft + 요구사항 시드. 시드가 실패하면 만든 프로젝트를 지우고 500 (Q10)
    try {
      const { project } = await createSampleProject(supabase, {
        userId: req.user.id, name: name.trim(), description: description ?? null, readmeMd: readmeMd ?? sample.readmeMd, sample,
      });
      return res.status(201).json({ data: toProject(project, { draftRevision: 1 }) });
    } catch (err) {
      if (!(err instanceof SampleSeedError)) throw err;
      return sendError(res, 500, 'SAMPLE_SEED_FAILED', err.compensated
        ? '샘플 요구사항을 만들지 못했습니다. 프로젝트는 만들지 않았습니다. 잠시 후 다시 시도하세요.'
        : '샘플 요구사항을 만들지 못했습니다. 목록에 "[샘플 생성 실패]" 프로젝트가 남았다면 삭제해 주세요.');
    }
  }

  const { data, error } = await supabase.rpc('aa_create_project', {
    p_user: req.user.id,
    p_name: name.trim(),
    p_description: description ?? null,
    p_readme_md: readmeMd ?? README_TEMPLATE,
    p_model: emptyModel(),
  });
  if (error) throw error;
  res.status(201).json({ data: toProject(data, { draftRevision: 1 }) });
}));

// ── 프로젝트 조회 ───────────────────────────────────────────
router.get('/:projectId', wrap(async (req, res) => {
  const countReq = (kind) => supabase
    .from('aa_requirements')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', req.project.id)
    .eq('kind', kind);
  const [fr, nfr] = await Promise.all([countReq('fr'), countReq('nfr')]);
  if (fr.error) throw fr.error;
  if (nfr.error) throw nfr.error;

  res.json({
    data: toProject(req.project, {
      counts: {
        fr: fr.count ?? 0, nfr: nfr.count ?? 0,
        versions: 0, openFindings: 0, validations: { total: 0, passed: 0 }, decisions: 0, // Phase 2~3
      },
    }),
  });
}));

// ── 프로젝트 수정 ───────────────────────────────────────────
// PATCH /api/aa/projects/:projectId  { name?, description?, status?, readmeMd? }
router.patch('/:projectId', wrap(async (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (body.name !== undefined) {
    const p = checkName(body.name); if (p) return sendError(res, 400, 'VALIDATION_FAILED', p.message, [p]);
    patch.name = body.name.trim();
  }
  if (body.description !== undefined) {
    const p = checkDescription(body.description); if (p) return sendError(res, 400, 'VALIDATION_FAILED', p.message, [p]);
    patch.description = body.description;
  }
  if (body.status !== undefined) {
    if (!STATUSES.has(body.status)) return sendError(res, 400, 'VALIDATION_FAILED', 'status는 active 또는 archived여야 합니다.');
    patch.status = body.status;
  }
  if (body.readmeMd !== undefined) {
    const p = checkReadme(body.readmeMd); if (p) return sendError(res, 400, 'VALIDATION_FAILED', p.message, [p]);
    patch.readme_md = body.readmeMd;
  }
  if (!Object.keys(patch).length) return sendError(res, 400, 'VALIDATION_FAILED', '수정할 항목이 없습니다.');

  const { data, error } = await supabase
    .from('aa_projects')
    .update(patch)
    .eq('id', req.project.id)
    .eq('user_id', req.user.id)
    .select('*')
    .single();
  if (error) throw error;
  res.json({ data: toProject(data) });
}));

// ── 프로젝트 삭제 (하위 Draft·요구사항 cascade) ─────────────────
// DELETE /api/aa/projects/:projectId?confirm=<프로젝트 이름>
router.delete('/:projectId', wrap(async (req, res) => {
  if (req.query.confirm !== req.project.name) {
    return sendError(res, 400, 'CONFIRM_MISMATCH', '삭제하려면 confirm에 프로젝트 이름을 정확히 입력해야 합니다.');
  }
  const { error } = await supabase
    .from('aa_projects')
    .delete()
    .eq('id', req.project.id)
    .eq('user_id', req.user.id);
  if (error) throw error;
  res.status(204).end();
}));

// ── Draft 조회 ──────────────────────────────────────────────
router.get('/:projectId/architecture', wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('aa_architecture_drafts')
    .select('model, revision, base_version_id, updated_at')
    .eq('project_id', req.project.id)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return sendError(res, 404, 'NOT_FOUND', 'Draft를 찾을 수 없습니다.');
  const { model, warnings } = await reconcile(supabase, req.project.id, req.user.id, data.model);
  res.json({ data: { model, revision: data.revision, baseVersion: null, updatedAt: data.updated_at }, ...(warnings.length ? { warnings } : {}) });
}));

// ── Draft 저장 (낙관적 잠금) ──────────────────────────────────
// PUT /api/aa/projects/:projectId/architecture/draft  { baseRevision, model }
// - revision이 다르면 409 REVISION_CONFLICT { currentRevision }. 강제 저장(force)은 없다 (D-20).
// - "내 변경으로 덮어쓰기" = 409로 받은 currentRevision을 baseRevision으로 다시 보내는 일반 저장.
router.put('/:projectId/architecture/draft', wrap(async (req, res) => {
  const { baseRevision, model } = req.body || {};
  if (!Number.isInteger(baseRevision) || baseRevision < 1) {
    return sendError(res, 400, 'VALIDATION_FAILED', 'baseRevision은 1 이상의 정수여야 합니다.');
  }

  const { errors, warnings, tooLarge } = validateModel(model);
  if (tooLarge) {
    return sendError(res, 413, 'MODEL_TOO_LARGE', '설계 모델이 너무 큽니다. (최대 1MB, 컴포넌트 500개)', tooLarge);
  }
  if (errors.length) {
    return sendError(res, 400, 'VALIDATION_FAILED', '설계 모델 검증에 실패했습니다.', errors);
  }

  const reconciled = await reconcile(supabase, req.project.id, req.user.id, model);
  const { data, error } = await supabase.rpc('aa_save_draft', {
    p_project: req.project.id,
    p_user: req.user.id,
    p_base_revision: baseRevision,
    p_model: reconciled.model,
  });
  if (error) throw error;
  if (data?.not_found) return sendError(res, 404, 'NOT_FOUND', 'Draft를 찾을 수 없습니다.');
  if (data?.conflict) {
    return sendError(res, 409, 'REVISION_CONFLICT', '다른 곳에서 더 최근에 저장되었습니다.', {
      currentRevision: data.revision,
      updatedAt: data.updated_at,
    });
  }
  res.json({ data: { revision: data.revision, updatedAt: data.updated_at }, warnings: [...warnings, ...reconciled.warnings] });
}));

module.exports = router;
