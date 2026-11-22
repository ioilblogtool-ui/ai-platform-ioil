// 외부 AI 수동 리뷰 (Sprint 5 Step 3 · 05 §5 · REV-M1~M3·M7·REV-13 · Q4·Q7·Q11·Q13).
// Workbench는 AI API를 호출하지 않는다. 사용자가 외부 AI에서 받은 답변을 기준(번들 또는 현재 Draft)과 함께 저장한다.
// 저장되는 값은 외부로 나가지 않으므로 차단 규칙(V12, 키·토큰·PEM)만 적용한다. 걸리면 400, 아무것도 저장하지 않는다.
const express = require('express');
const supabase = require('../../lib/supabase');
const { sendError, wrap, UUID_RE } = require('../../lib/aa/errors');
const { scanForSecrets } = require('../../lib/aa/sensitive-scan');
const { TEMPLATES } = require('../../lib/aa/export-builder');

const router = express.Router({ mergeParams: true });

const LIMITS = { answerBytes: 256 * 1024, bundleBytes: 512 * 1024, question: 2000, followUp: 2000, scopeLabel: 200, scopeJson: 4096 };
const BUNDLE_ID_RE = /^bx_[A-Za-z0-9]{10}$/;
const BUNDLE_FORMATS = new Set(['ai-md', 'ai-json']);
const bytes = (s) => Buffer.byteLength(String(s), 'utf8');
const invalid = (res, field, message) => sendError(res, 400, 'VALIDATION_FAILED', message, [{ field }]);
const notFound = (res) => sendError(res, 404, 'NOT_FOUND', '리뷰를 찾을 수 없습니다.');

function checkAnswer(body, prefix = '') {
  const tool = typeof body.tool === 'string' ? body.tool.trim() : '';
  if (!tool || tool.length > 60) return { field: `${prefix}tool`, message: '도구 이름은 1~60자여야 합니다.' };
  if (typeof body.answerMd !== 'string' || !body.answerMd.trim()) return { field: `${prefix}answerMd`, message: '답변이 비어 있습니다.' };
  if (bytes(body.answerMd) > LIMITS.answerBytes) return { field: `${prefix}answerMd`, message: '답변은 UTF-8 기준 256KiB 이하여야 합니다.' };
  return null;
}

function checkClientRequestId(value) {
  return value === undefined || value === null || (typeof value === 'string' && UUID_RE.test(value));
}

// 차단 규칙 검사. 원문은 돌려주지 않고 위치·마스킹 샘플만
function blocked(res, values) {
  const hits = scanForSecrets(values);
  if (!hits.length) return false;
  sendError(res, 400, 'SENSITIVE_DATA_DETECTED', '키·토큰으로 보이는 값이 있어 저장하지 않았습니다. 해당 값을 지운 뒤 다시 저장하세요.', hits);
  return true;
}

async function currentRevision(req) {
  const { data, error } = await supabase.from('aa_architecture_drafts').select('revision')
    .eq('project_id', req.project.id).eq('user_id', req.user.id).maybeSingle();
  if (error) throw error;
  return data?.revision ?? null;
}

async function findReview(req, id) {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase.from('aa_reviews').select('*')
    .eq('id', id).eq('project_id', req.project.id).eq('user_id', req.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

function serializeAnswer(a) {
  return { id: a.id, tool: a.tool, answerMd: a.answer_md, followUpOf: a.follow_up_of, followUpQuestion: a.follow_up_question, createdAt: a.created_at };
}

function serializeReview(r, answers) {
  const scope = r.bundle_scope ?? {};
  const tools = [...new Set(answers.map((a) => a.tool))];
  return {
    id: r.id,
    mode: r.mode,
    source: r.mode === 'api' ? 'api' : `external_ai:${tools[0] ?? ''}`,
    tools,
    target: r.version_id ? { type: 'version', versionId: r.version_id } : { type: 'draft', revision: r.draft_revision },
    bundleLinked: Boolean(r.bundle_id),
    bundleId: r.bundle_id,
    format: scope.format ?? null,
    scopeLabel: scope.scopeLabel ?? null,
    template: scope.template ?? null,
    question: scope.question ?? null,
    status: r.status,
    answerCount: answers.length,
    staleBasis: false,            // 버전 비교는 Sprint 6 (REV-M6)
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  };
}

// ── 수동 리뷰 저장 (리뷰 + 첫 답변, RPC 한 번) ────────────────────
router.post('/manual', wrap(async (req, res) => {
  const body = req.body || {};
  const { bundle, answer, clientRequestId } = body;
  if (!checkClientRequestId(clientRequestId)) return invalid(res, 'clientRequestId', 'clientRequestId는 UUID여야 합니다.');
  if (!answer || typeof answer !== 'object') return invalid(res, 'answer', '답변이 필요합니다.');
  const answerProblem = checkAnswer(answer, 'answer.');
  if (answerProblem) return invalid(res, answerProblem.field, answerProblem.message);

  const revisionNow = await currentRevision(req);
  if (revisionNow === null) return sendError(res, 404, 'NOT_FOUND', 'Draft를 찾을 수 없습니다.');

  let draftRevision = revisionNow;       // 번들 미연결이면 저장 시점의 현재 Draft (Q13)
  let bundleScope = null, bundleMd = null, bundleId = null;
  if (bundle !== null && bundle !== undefined) {
    if (typeof bundle !== 'object') return invalid(res, 'bundle', 'bundle 형식이 올바르지 않습니다.');
    if (!BUNDLE_ID_RE.test(String(bundle.bundleId ?? ''))) return invalid(res, 'bundle.bundleId', 'bundleId 형식이 올바르지 않습니다.');
    if (!BUNDLE_FORMATS.has(bundle.format)) return invalid(res, 'bundle.format', '번들 형식은 ai-md 또는 ai-json이어야 합니다.');
    if (typeof bundle.bundleMd !== 'string' || !bundle.bundleMd.trim()) return invalid(res, 'bundle.bundleMd', '번들 원문이 비어 있습니다.');
    if (bytes(bundle.bundleMd) > LIMITS.bundleBytes) return invalid(res, 'bundle.bundleMd', '번들 원문은 UTF-8 기준 512KiB 이하여야 합니다.');
    const rev = bundle.basis?.revision;
    if (!Number.isInteger(rev) || rev < 1 || rev > revisionNow) return invalid(res, 'bundle.basis.revision', '번들 기준 revision이 올바르지 않습니다.');
    if (bundle.template !== undefined && !(typeof bundle.template === 'string' && Object.hasOwn(TEMPLATES, bundle.template))) {
      return invalid(res, 'bundle.template', '지원하지 않는 템플릿입니다.');
    }
    if (bundle.question !== undefined && bundle.question !== null && (typeof bundle.question !== 'string' || bundle.question.length > LIMITS.question)) {
      return invalid(res, 'bundle.question', '질문은 2,000자 이하여야 합니다.');
    }
    if (bundle.scopeLabel !== undefined && (typeof bundle.scopeLabel !== 'string' || bundle.scopeLabel.length > LIMITS.scopeLabel)) {
      return invalid(res, 'bundle.scopeLabel', '범위 설명은 200자 이하여야 합니다.');
    }
    if (bundle.scope !== undefined && (typeof bundle.scope !== 'object' || bundle.scope === null || JSON.stringify(bundle.scope).length > LIMITS.scopeJson)) {
      return invalid(res, 'bundle.scope', '범위 정보가 올바르지 않습니다.');
    }
    draftRevision = rev;
    bundleId = bundle.bundleId;
    bundleMd = bundle.bundleMd;
    bundleScope = {
      format: bundle.format,
      scopeLabel: bundle.scopeLabel ?? null,
      scope: bundle.scope ?? null,
      template: bundle.template ?? null,
      question: bundle.question ?? null,
    };
  }

  // 저장되는 모든 문자열에 차단 규칙 (Q7: 질문·범위 설명 같은 메타데이터 포함)
  if (blocked(res, { answer: { tool: answer.tool, answerMd: answer.answerMd }, bundle: bundleScope ? { ...bundleScope, bundleMd } : null })) return;

  const { data, error } = await supabase.rpc('aa_create_manual_review', {
    p_project: req.project.id, p_user: req.user.id, p_draft_revision: draftRevision,
    p_bundle_id: bundleId, p_bundle_scope: bundleScope, p_bundle_md: bundleMd,
    p_tool: answer.tool.trim(), p_answer_md: answer.answerMd, p_client_request_id: clientRequestId ?? null,
  });
  if (error) throw error;
  res.status(data.existing ? 200 : 201).json({ data: { id: data.review_id, answerId: data.answer_id, existing: Boolean(data.existing) } });
}));

// ── 같은 리뷰에 답변 추가 (REV-M7) ─────────────────────────────
router.post('/:reviewId/answers', wrap(async (req, res) => {
  const body = req.body || {};
  if (!checkClientRequestId(body.clientRequestId)) return invalid(res, 'clientRequestId', 'clientRequestId는 UUID여야 합니다.');
  const review = await findReview(req, req.params.reviewId);
  if (!review) return notFound(res);
  if (review.mode !== 'manual') return sendError(res, 409, 'NOT_MANUAL_REVIEW', '외부 AI 수동 리뷰에만 답변을 추가할 수 있습니다.');
  const problem = checkAnswer(body);
  if (problem) return invalid(res, problem.field, problem.message);
  const followUpOf = body.followUpOf ?? null;
  const followUpQuestion = body.followUpQuestion ?? null;
  if (followUpQuestion !== null && (typeof followUpQuestion !== 'string' || followUpQuestion.length > LIMITS.followUp)) {
    return invalid(res, 'followUpQuestion', '추가 질문은 2,000자 이하여야 합니다.');
  }
  if (followUpOf !== null) {
    if (typeof followUpOf !== 'string' || !UUID_RE.test(followUpOf)) return invalid(res, 'followUpOf', 'followUpOf는 이 리뷰의 답변 ID여야 합니다.');
    const { data, error } = await supabase.from('aa_review_answers').select('id')
      .eq('id', followUpOf).eq('review_id', review.id).eq('project_id', req.project.id).maybeSingle();
    if (error) throw error;
    if (!data) return invalid(res, 'followUpOf', 'followUpOf는 이 리뷰의 답변 ID여야 합니다.');
  }
  if (blocked(res, { tool: body.tool, answerMd: body.answerMd, followUpQuestion })) return;

  const findExisting = async () => {
    const { data, error } = await supabase.from('aa_review_answers').select('id')
      .eq('project_id', req.project.id).eq('user_id', req.user.id).eq('client_request_id', body.clientRequestId).maybeSingle();
    if (error) throw error;
    return data;
  };
  if (body.clientRequestId) {
    const existing = await findExisting();
    if (existing) return res.status(200).json({ data: { id: existing.id, existing: true } });
  }
  const { data, error } = await supabase.from('aa_review_answers').insert({
    review_id: review.id, project_id: req.project.id, user_id: req.user.id,
    tool: body.tool.trim(), answer_md: body.answerMd, follow_up_of: followUpOf, follow_up_question: followUpQuestion,
    client_request_id: body.clientRequestId ?? null,
  }).select('id').single();
  if (error) {
    if (error.code === '23505' && body.clientRequestId) {
      const existing = await findExisting();
      if (existing) return res.status(200).json({ data: { id: existing.id, existing: true } });
    }
    throw error;
  }
  res.status(201).json({ data: { id: data.id, existing: false } });
}));

// ── 목록 (수동·자동 한 목록, REV-13) ───────────────────────────
router.get('/', wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const { data: reviews, count, error } = await supabase.from('aa_reviews')
    .select('id, mode, version_id, draft_revision, bundle_id, bundle_scope, status, created_at, finished_at', { count: 'exact' })
    .eq('project_id', req.project.id).eq('user_id', req.user.id)
    .order('created_at', { ascending: false }).order('id').range(offset, offset + limit - 1);
  if (error) throw error;
  const ids = reviews.map((r) => r.id);
  let answers = [];
  if (ids.length) {
    const r = await supabase.from('aa_review_answers').select('review_id, tool, created_at')
      .eq('project_id', req.project.id).in('review_id', ids).order('created_at');
    if (r.error) throw r.error;
    answers = r.data;
  }
  res.json({ data: reviews.map((rv) => serializeReview(rv, answers.filter((a) => a.review_id === rv.id))), total: count ?? reviews.length });
}));

// ── 상세 (번들 원문·답변 포함) ─────────────────────────────────
router.get('/:reviewId', wrap(async (req, res) => {
  const review = await findReview(req, req.params.reviewId);
  if (!review) return notFound(res);
  const { data: answers, error } = await supabase.from('aa_review_answers')
    .select('id, tool, answer_md, follow_up_of, follow_up_question, created_at')
    .eq('project_id', req.project.id).eq('review_id', review.id).order('created_at').order('id');
  if (error) throw error;
  res.json({
    data: {
      ...serializeReview(review, answers),
      bundleMd: review.bundle_md,
      scope: review.bundle_scope?.scope ?? null,
      summary: review.summary,
      answers: answers.map(serializeAnswer),
      findings: [],                 // Phase 3 (REV-M4)
    },
  });
}));

module.exports = router;
