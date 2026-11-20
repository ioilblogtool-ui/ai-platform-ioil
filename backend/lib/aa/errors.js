// AA Workbench 공통 에러 응답: { error, code, details? } (05 API §1.2~1.3)
function sendError(res, status, code, error, details) {
  const body = { error, code };
  if (details !== undefined) body.details = details;
  return res.status(status).json(body);
}

// Express 4는 async 핸들러의 예외를 에러 핸들러로 넘기지 않으므로 직접 잡는다.
function wrap(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (err) {
      console.error('[aa]', req.method, req.originalUrl, err);
      if (!res.headersSent) sendError(res, 500, 'INTERNAL', '서버 오류가 발생했습니다.');
    }
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = { sendError, wrap, UUID_RE };
