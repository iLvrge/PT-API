'use strict';

/**
 * Resolve the caller's Slack token.
 *
 * The legacy routes took it as a URL path segment, which writes an OAuth
 * credential into access logs, proxy logs, browser history and Referer
 * headers. The header form is preferred here; the path form still works so the
 * front end can migrate without a flag day, but it is documented as deprecated
 * and should be removed once nothing uses it.
 */

const ApiError = require('../../utils/api-error');
const logger = require('../../utils/logger');

const attachSlackToken = (req, res, next) => {
  const header = req.headers['x-slack-token'];
  const token = header || req.params.token;

  if (!token) return next(ApiError.unauthorized('Slack token missing'));
  if (!header) {
    logger.warn('slack token supplied in the URL path', { path: req.route && req.route.path });
  }

  req.slackToken = token;
  return next();
};

module.exports = { attachSlackToken };
