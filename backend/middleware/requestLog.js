const { performance } = require('node:perf_hooks');

function requestLog(req, res, next) {
  if (req.path === '/health' || req.method === 'OPTIONS') return next();

  const startedAt = performance.now();
  res.once('close', () => {
    const completed = res.writableFinished;
    const route = req.route?.path;

    console.log(JSON.stringify({
      event: 'http_request',
      method: req.method,
      route: typeof route === 'string' ? `${req.baseUrl}${route === '/' && req.baseUrl ? '' : route}` : null,
      status: completed || res.headersSent ? res.statusCode : null,
      durationMs: Math.round(performance.now() - startedAt),
      ...(completed ? {} : { aborted: true }),
    }));
  });
  next();
}

module.exports = requestLog;
