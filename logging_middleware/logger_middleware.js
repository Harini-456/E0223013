// Simple logging middleware for Express-like frameworks

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

  // Log the error server-side for debugging
  console.error('[Error]', err.message || err);

  // Send a minimal JSON error response if possible
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
