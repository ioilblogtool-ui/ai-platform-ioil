// 5xx 응답의 error 문구(DB/외부 API 내부 메시지)를 클라이언트에 노출하지 않는다.
// 원래 문구는 서버 로그에만 남긴다.
function hideServerErrors(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === 'object' && 'error' in body) {
      console.error(`[${req.method} ${req.originalUrl}] ${res.statusCode}:`, body.error);
      return originalJson({ ...body, error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
    }
    return originalJson(body);
  };
  next();
}

module.exports = hideServerErrors;
