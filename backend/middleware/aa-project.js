// AA Workbench 프로젝트 소유권 확인 (05 API §1.1)
// 본인 프로젝트가 아니거나 없으면 404 (403이 아니라 404 — 존재 여부를 노출하지 않음).
const supabase = require('../lib/supabase');
const { sendError, UUID_RE } = require('../lib/aa/errors');

async function loadProject(req, res, next, projectId) {
  try {
    if (!UUID_RE.test(String(projectId))) {
      return sendError(res, 404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
    }
    const { data, error } = await supabase
      .from('aa_projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return sendError(res, 404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
    req.project = data;
    next();
  } catch (err) {
    console.error('[aa] loadProject', err);
    sendError(res, 500, 'INTERNAL', '서버 오류가 발생했습니다.');
  }
}

module.exports = { loadProject };
