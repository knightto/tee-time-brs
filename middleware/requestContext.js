const crypto = require('crypto');
const logger = require('../services/logger');

function requestContext(req, res, next) {
  const reqId = req.headers['x-request-id'] || crypto.randomBytes(8).toString('hex');
  req.reqId = String(reqId);
  res.setHeader('x-request-id', req.reqId);

  const start = Date.now();
  res.on('finish', () => {
    logger.info('http_request', {
      reqId: req.reqId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      ms: Date.now() - start,
    });
  });
  next();
}

module.exports = { requestContext };
