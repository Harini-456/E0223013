function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, url } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[Request] ${method} ${url} ${res.statusCode} - ${duration}ms`);
  });

  if (typeof next === 'function') {
    next();
  }
}

function errorLogger(err, req, res, next) {
  console.error('[Error]', err.message || err);
  if (res && !res.headersSent) {
    res.statusCode = err.status || 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
  if (typeof next === 'function') {
    next(err);
  }
}

module.exports = {
  requestLogger,
  errorLogger,
};
