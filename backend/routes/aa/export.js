// POST /api/aa/projects/:projectId/export (Sprint 4 Step 5 · 05 "Export"·"readme-md 규칙" · Q1~Q3·Q9).
// 이번 단계는 format 'readme-md', 원본은 Draft. 최종 출력 전체를 검사한다:
//   차단(키·토큰·PEM) → 422, 본문·확인 ID 없음.  경고(IP·내부 도메인·이메일) → 422 + scanId, 본문 없음.
//   사용자가 확인하고 acknowledgedScan을 보내면 출력을 새로 만들어 다시 검사하고, binding이 같을 때만 200.
const express = require('express');
const supabase = require('../../lib/supabase');
const { sendError, wrap } = require('../../lib/aa/errors');
const { scanForExport } = require('../../lib/aa/sensitive-scan');
const { buildReadme, readmeFooter } = require('../../lib/aa/readme-export');
const { createScanStore, contentHash } = require('../../lib/aa/scan-store');

const router = express.Router({ mergeParams: true });
const scans = createScanStore();
const FORMATS_LATER = new Set(['ai-md', 'ai-json', 'model-json']);

// 줄 단위로 검사해 위치를 "line N"으로 알려준다 (원문은 돌려주지 않는다)
function scanOutput(body) {
  const byLine = Object.fromEntries(body.split('\n').map((text, i) => [`line ${i + 1}`, text]));
  return scanForExport(byLine);
}

router.post('/', wrap(async (req, res) => {
  const { format, source, sections, acknowledgedScan } = req.body || {};
  if (format !== 'readme-md') {
    const later = FORMATS_LATER.has(format) ? ' (이후 Sprint에서 지원)' : '';
    return sendError(res, 400, 'UNSUPPORTED_EXPORT_FORMAT', `지원하지 않는 내보내기 형식입니다${later}. 지금은 readme-md만 지원합니다.`);
  }
  if (source !== undefined && !(source && typeof source === 'object' && (source.type === 'latest' || source.type === 'draft'))) {
    return sendError(res, 400, 'VALIDATION_FAILED', 'source는 { type: "latest" } 또는 { type: "draft" }여야 합니다. (버전 기준은 Sprint 6)');
  }
  if (acknowledgedScan !== undefined && acknowledgedScan !== null && typeof acknowledgedScan !== 'string') {
    return sendError(res, 400, 'VALIDATION_FAILED', 'acknowledgedScan은 문자열이어야 합니다.');
  }

  const [project, draft, reqs] = await Promise.all([
    supabase.from('aa_projects').select('name, readme_md').eq('id', req.project.id).eq('user_id', req.user.id).maybeSingle(),
    supabase.from('aa_architecture_drafts').select('model, revision').eq('project_id', req.project.id).eq('user_id', req.user.id).maybeSingle(),
    supabase.from('aa_requirements').select('id, code, kind, title, category, target, metric, status')
      .eq('project_id', req.project.id).eq('user_id', req.user.id).range(0, 999),
  ]);
  for (const r of [project, draft, reqs]) if (r.error) throw r.error;
  if (!project.data || !draft.data) return sendError(res, 404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.');

  const readAt = new Date();
  const built = buildReadme({
    project: { name: project.data.name, readmeMd: project.data.readme_md },
    model: draft.data.model,
    revision: draft.data.revision,
    requirements: reqs.data ?? [],
    sections,
  });
  const hash = contentHash(built.body);
  const scan = scanOutput(built.body);
  if (scan.blocks.length) {
    return sendError(res, 422, 'SENSITIVE_DATA_DETECTED',
      '내보낼 내용에 키·토큰으로 보이는 값이 있어 내보낼 수 없습니다. 해당 값을 지운 뒤 다시 시도하세요.',
      { issues: scan.blocks, confirmable: false, scanId: null });
  }
  const binding = { userId: req.user.id, projectId: req.project.id, revision: draft.data.revision, sections: built.sections, contentHash: hash };
  if (scan.warnings.length && !(acknowledgedScan && scans.verify(acknowledgedScan, binding))) {
    return sendError(res, 422, 'SENSITIVE_DATA_DETECTED',
      '내보낼 내용에 IP·내부 도메인·이메일로 보이는 값이 있습니다. 확인한 뒤 계속할 수 있습니다.',
      { issues: scan.warnings, confirmable: true, scanId: scans.issue(binding) });
  }

  const content = built.body + readmeFooter(readAt);
  res.json({
    data: {
      filename: built.filename,
      contentType: 'text/markdown',
      content,
      contentHash: hash,
      sections: built.sections,
      basis: { source: 'draft', revision: draft.data.revision, readAt: readAt.toISOString() },
      approxTokens: Math.ceil(content.length / 4),
      ...(scan.warnings.length ? { acknowledgedWarnings: scan.warnings.length } : {}),
    },
  });
}));

module.exports = router;
