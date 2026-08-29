'use strict';

/**
 * Per-request structured logging.
 *
 * Assigns each request a short id (echoed as the X-Request-Id header and
 * available as req.id for error correlation), then logs one line on completion
 * with method, path, status and duration. Sensitive headers and bodies are
 * never logged.
 *
 * Unlike the legacy logger this does not write request bodies to the database
 * and does not stringify multi-kilobyte payloads on the hot path.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const id = req.headers['x-request-id'] || crypto.randomBytes(8).toString('hex');
  req.id = id;
  res.setHeader('X-Request-Id', id);

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('request', {
      requestId: id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      ip: req.ip,
    });
  });

  next();
};

module.exports = requestLogger;
