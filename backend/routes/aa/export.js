// POST /api/aa/projects/:projectId/export (Sprint 4 Step 5 · Sprint 5 Step 1 · 05 §7.6).
// 형식: readme-md (Sprint 4), ai-md · ai-json · mermaid (Sprint 5).
// 원본(Sprint 6): draft | version(versionId) | latest(README 전용: 최신 발행본, 없으면 Draft). 버전 기준은 그 버전의 모델·요구사항 스냅샷·개요 스냅샷.
// 최종 출력 전체를 검사한다:
//   차단(키·토큰·PEM) → 422, 본문·확인 ID 없음.  경고(IP·내부 도메인·이메일) → 422 + scanId, 본문 없음.
//   사용자가 확인하고 acknowledgedScan을 보내면 출력을 새로 만들어 다시 검사하고, binding이 같을 때만 200.
// binding의 해시는 가변 메타데이터(README 꼬리말, Ask AI bundleId·읽은 시각)를 뺀 본문으로 계산한다.
const crypto = require('node:crypto');
const express = require('express');
const supabase = require('../../lib/supabase');
const { sendError, wrap, UUID_RE } = require('../../lib/aa/errors');
const { scanForExport } = require('../../lib/aa/sensitive-scan');
const { buildReadme, readmeFooter, slugify } = require('../../lib/aa/readme-export');
const { buildAskAi, TEMPLATES } = require('../../lib/aa/export-builder');
const { normalizeModel } = require('../../lib/aa/normalize');
const { toMermaidFlowchart } = require('../../lib/aa/mermaid-export');
const { createScanStore, contentHash } = require('../../lib/aa/scan-store');
const { basisFileTag, snapshotRequirements } = require('../../lib/aa/export-basis');

const router = express.Router({ mergeParams: true });
const scans = createScanStore();
const FORMATS = new Set(['readme-md', 'ai-md', 'ai-json', 'mermaid']);
const LATER = new Set(['model-json', 'png']);
const SCOPE_TYPES = new Set(['project', 'view', 'components', 'requirement', 'flow']);

const SCOPE_ERRORS = {
  scope_flow: '선택한 API Flow를 이 원본(Draft 또는 버전)에서 찾을 수 없습니다.',
  scope_view: '지금은 Logical View(view_logical)만 범위로 고를 수 있습니다.',
  scope_components: '선택한 컴포넌트를 이 프로젝트의 Draft에서 찾을 수 없습니다.',
  scope_requirement: '선택한 요구사항을 이 프로젝트에서 찾을 수 없습니다.',
  scope_scope: '지원하지 않는 범위입니다.',
  template: '지원하지 않는 템플릿입니다.',
  question: '질문은 2,000자 이하여야 하고, 직접 입력 템플릿은 질문이 필요합니다.',
};

// 줄 단위로 검사해 위치를 "line N"으로 알려준다 (원문은 돌려주지 않는다)
function scanOutput(body) {
  const byLine = Object.fromEntries(body.split('\n').map((text, i) => [`line ${i + 1}`, text]));
  return scanForExport(byLine);
}

// binding에 넣을 범위: 요청 값 중 의미 있는 것만, 정렬해서
function scopeKey(scope) {
  if (!scope || typeof scope !== 'object') return { type: 'project' };
  const type = scope.type ?? 'project';
  if (type === 'view') return { type, viewId: scope.viewId };
  if (type === 'components') return { type, componentIds: [...(scope.componentIds ?? [])].sort() };
  if (type === 'requirement') return { type, requirementId: String(scope.requirementId ?? '').toLowerCase() };
  if (type === 'flow') return { type, flowId: scope.flowId };
  return { type };
}

function validateAskAi(body) {
  const { scope, template, question, noteIds } = body;
  if (noteIds !== undefined && (!Array.isArray(noteIds) || noteIds.length > 20 ||
    noteIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id)))) {
    return { status: 400, code: 'VALIDATION_FAILED', message: 'noteIds는 노트 UUID를 최대 20개까지 담을 수 있습니다.' };
  }
  if (scope !== undefined && (typeof scope !== 'object' || scope === null || !SCOPE_TYPES.has(scope.type ?? 'project'))) {
    return { status: 400, code: 'VALIDATION_FAILED', message: SCOPE_ERRORS.scope_scope };
  }
  if (scope?.type === 'components') {
    const ids = scope.componentIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every((id) => typeof id === 'string' && /^cmp_[A-Za-z0-9_-]{1,64}$/.test(id))) {
      return { status: 400, code: 'VALIDATION_FAILED', message: 'componentIds는 컴포넌트 ID 1~200개여야 합니다.' };
    }
  }
  if (scope?.type === 'requirement' && !(typeof scope.requirementId === 'string' && UUID_RE.test(scope.requirementId))) {
    return { status: 400, code: 'VALIDATION_FAILED', message: 'requirementId는 UUID여야 합니다.' };
  }
  if (scope?.type === 'flow' && !(typeof scope.flowId === 'string' && /^flw_[A-Za-z0-9]{10}$/.test(scope.flowId))) {
    return { status: 400, code: 'VALIDATION_FAILED', message: 'flowId는 흐름 ID(flw_…)여야 합니다.' };
  }
  if (template !== undefined && !(typeof template === 'string' && Object.hasOwn(TEMPLATES, template))) {
    return { status: 400, code: 'VALIDATION_FAILED', message: SCOPE_ERRORS.template };
  }
  if (question !== undefined && question !== null && typeof question !== 'string') {
    return { status: 400, code: 'VALIDATION_FAILED', message: SCOPE_ERRORS.question };
  }
  return null;
}

router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  const { format, source, sections, acknowledgedScan } = body;
  if (!FORMATS.has(format)) {
    const later = LATER.has(format) ? ' (이후 Sprint에서 지원)' : '';
    return sendError(res, 400, 'UNSUPPORTED_EXPORT_FORMAT', `지원하지 않는 내보내기 형식입니다${later}. 지원: readme-md, ai-md, ai-json, mermaid.`);
  }
  const sourceOk = source === undefined || (source && typeof source === 'object' && (
    source.type === 'draft' || source.type === 'latest' || (source.type === 'version' && typeof source.versionId === 'string' && UUID_RE.test(source.versionId))));
  if (!sourceOk) {
    return sendError(res, 400, 'VALIDATION_FAILED', 'source는 { type: "draft" }, { type: "version", versionId } 또는 (README만) { type: "latest" }여야 합니다.');
  }
  if (source?.type === 'latest' && format !== 'readme-md') {
    return sendError(res, 400, 'VALIDATION_FAILED', '"latest"는 README 전용입니다. Ask AI·Mermaid는 draft 또는 version을 고르세요.');
  }
  // 기본: README는 최신 발행본(RDM-02), 나머지는 Draft
  const sourceType = source?.type ?? (format === 'readme-md' ? 'latest' : 'draft');
  if (acknowledgedScan !== undefined && acknowledgedScan !== null && typeof acknowledgedScan !== 'string') {
    return sendError(res, 400, 'VALIDATION_FAILED', 'acknowledgedScan은 문자열이어야 합니다.');
  }
  const isAsk = format === 'ai-md' || format === 'ai-json';
  if (isAsk) {
    const problem = validateAskAi(body);
    if (problem) return sendError(res, problem.status, problem.code, problem.message);
  }

  const versionCols = 'id, label, version_no, created_at';
  const [project, draft, reqs, latestV] = await Promise.all([
    supabase.from('aa_projects').select('name, readme_md').eq('id', req.project.id).eq('user_id', req.user.id).maybeSingle(),
    supabase.from('aa_architecture_drafts').select('model, revision').eq('project_id', req.project.id).eq('user_id', req.user.id).maybeSingle(),
    supabase.from('aa_requirements').select('id, code, kind, title, category, target, metric, status, measurement')
      .eq('project_id', req.project.id).eq('user_id', req.user.id).range(0, 999),
    supabase.from('aa_architecture_versions').select(versionCols)
      .eq('project_id', req.project.id).eq('user_id', req.user.id).order('version_no', { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [project, draft, reqs, latestV]) if (r.error) throw r.error;
  if (!project.data || !draft.data) return sendError(res, 404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.');

  // 원본 결정: 버전이면 그 버전의 모델·요구사항 스냅샷·개요 스냅샷 (Sprint 6 Q12·Q15)
  const versionId = sourceType === 'version' ? source.versionId : sourceType === 'latest' ? latestV.data?.id ?? null : null;
  let version = null;
  if (versionId) {
    const v = await supabase.from('aa_architecture_versions')
      .select(`${versionCols}, model, readme_md, requirements_snapshot`)
      .eq('project_id', req.project.id).eq('user_id', req.user.id).eq('id', versionId).maybeSingle();
    if (v.error) throw v.error;
    if (!v.data) return sendError(res, 404, 'NOT_FOUND', '버전을 찾을 수 없습니다.');
    version = v.data;
  }

  const readAt = new Date();
  const revision = draft.data.revision;
  const basis = version
    ? { source: 'version', label: version.label, publishedAt: version.created_at }
    : { source: 'draft', revision, latestLabel: latestV.data?.label ?? null };
  const model = version ? version.model : draft.data.model;
  const requirementList = version ? snapshotRequirements(version.requirements_snapshot) : (reqs.data ?? []);
  const projectInfo = { name: project.data.name, readmeMd: version ? version.readme_md : project.data.readme_md };
  const tag = basisFileTag(basis);
  const slug = slugify(project.data.name);
  let out;            // { content, hashBody, filename, contentType, extra, bindingExtra }

  if (format === 'readme-md') {
    // Sprint 8: sections.apiFlows — 원본 모델에 없는 흐름 id는 400
    const flowIds = Array.isArray(sections?.apiFlows) ? sections.apiFlows : [];
    if (sections?.apiFlows !== undefined && (!Array.isArray(sections.apiFlows) || flowIds.some((fid) => typeof fid !== 'string' || !model?.flows?.[fid]))) {
      return sendError(res, 400, 'VALIDATION_FAILED', 'apiFlows에는 이 원본(Draft 또는 버전)에 있는 흐름 ID만 넣을 수 있습니다.');
    }
    const built = buildReadme({ project: projectInfo, model, revision, basis, requirements: requirementList, sections });
    out = {
      content: built.body + readmeFooter(readAt), hashBody: built.body, filename: built.filename, contentType: 'text/markdown',
      extra: { sections: built.sections }, bindingExtra: { sections: built.sections },
    };
  } else if (format === 'mermaid') {
    // Logical 전체 전용 (Q5). 별칭 없이 이름. 리뷰 연결 대상이 아니다
    const text = toMermaidFlowchart(normalizeModel(model, { requirements: requirementList }));
    out = {
      content: text, hashBody: text, filename: `${slug}_logical_${tag}.mmd`, contentType: 'text/plain',
      extra: { scopeLabel: 'Logical View 전체' }, bindingExtra: { format },
    };
  } else {
    let notes = [];
    const noteIds = [...new Set((body.noteIds ?? []).map((id) => id.toLowerCase()))];
    if (noteIds.length) {
      const { data, error } = await supabase.from('aa_notes')
        .select('id, kind, title, body_md, target_type, target_ref')
        .eq('project_id', req.project.id).eq('user_id', req.user.id).in('id', noteIds);
      if (error) throw error;
      const byId = new Map(data.map((note) => [note.id, note]));
      if (noteIds.some((id) => !byId.has(id))) return sendError(res, 404, 'NOT_FOUND', '노트를 찾을 수 없습니다.');
      notes = noteIds.map((id) => byId.get(id));
      if (notes.some((note) => note.kind === 'ai_answer')) {
        return sendError(res, 400, 'VALIDATION_FAILED', '외부 AI 답변 노트는 포함할 수 없습니다.');
      }
      const versionTargets = notes.filter((note) => note.target_type === 'version').map((note) => note.target_ref).filter((id) => UUID_RE.test(id));
      if (versionTargets.length) {
        const labels = await supabase.from('aa_architecture_versions').select('id, label')
          .eq('project_id', req.project.id).eq('user_id', req.user.id).in('id', versionTargets);
        if (labels.error) throw labels.error;
        const byVersionId = new Map(labels.data.map((entry) => [entry.id, entry.label]));
        notes = notes.map((note) => note.target_type === 'version' ? { ...note, versionLabel: byVersionId.get(note.target_ref) } : note);
      }
    }
    const bundleId = `bx_${crypto.randomBytes(8).toString('base64url').replace(/[-_]/g, 'x').slice(0, 10)}`;
    const built = buildAskAi({
      project: projectInfo, model, revision, basis, requirements: requirementList, format,
      scope: body.scope, notes, template: body.template ?? 'design-review', question: body.question ?? '', bundleId, readAt: readAt.toISOString(),
    });
    if (built.error) {
      const status = built.error === 'scope_components' || built.error === 'scope_requirement' || built.error === 'scope_flow' ? 404 : 400;
      return sendError(res, status, status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', SCOPE_ERRORS[built.error] ?? '요청을 확인해 주세요.');
    }
    const scopeSlug = slugify((body.scope?.type ?? 'project'));
    const date = readAt.toISOString().slice(0, 10);
    out = {
      content: built.content, hashBody: built.hashBody,
      filename: `${slug}_${scopeSlug}_${version ? tag : `rev${revision}`}_${date}.${format === 'ai-json' ? 'json' : 'md'}`,
      contentType: format === 'ai-json' ? 'application/json' : 'text/markdown',
      extra: { bundleId, scopeLabel: built.scopeLabel, omitted: built.omitted, counts: built.counts, template: body.template ?? 'design-review' },
      bindingExtra: { format, scope: scopeKey(body.scope), template: body.template ?? 'design-review', question: String(body.question ?? '').trim() },
    };
  }

  const hash = contentHash(out.hashBody);
  const scan = scanOutput(out.content);
  if (scan.blocks.length) {
    return sendError(res, 422, 'SENSITIVE_DATA_DETECTED',
      '내보낼 내용에 키·토큰으로 보이는 값이 있어 내보낼 수 없습니다. 해당 값을 지운 뒤 다시 시도하세요.',
      { issues: scan.blocks, confirmable: false, scanId: null });
  }
  const binding = { userId: req.user.id, projectId: req.project.id, revision: version ? `version:${version.id}` : `draft:${revision}`, sections: out.bindingExtra, contentHash: hash };
  if (scan.warnings.length && !(acknowledgedScan && scans.verify(acknowledgedScan, binding))) {
    return sendError(res, 422, 'SENSITIVE_DATA_DETECTED',
      '내보낼 내용에 IP·내부 도메인·이메일로 보이는 값이 있습니다. 확인한 뒤 계속할 수 있습니다.',
      { issues: scan.warnings, confirmable: true, scanId: scans.issue(binding) });
  }

  res.json({
    data: {
      filename: out.filename,
      contentType: out.contentType,
      content: out.content,
      contentHash: hash,
      basis: version
        ? { source: 'version', versionId: version.id, label: version.label, versionNo: version.version_no, publishedAt: version.created_at, readAt: readAt.toISOString() }
        : { source: 'draft', revision, readAt: readAt.toISOString() },
      approxTokens: Math.ceil(out.content.length / 4),
      ...out.extra,
      ...(scan.warnings.length ? { acknowledgedWarnings: scan.warnings.length } : {}),
    },
  });
}));

module.exports = router;
