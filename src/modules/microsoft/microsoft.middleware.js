'use strict';

/**
 * Microsoft Teams credentials arrive per request, in headers, because the
 * tokens belong to the signed-in user's Microsoft account rather than to the
 * API. Nothing is stored server-side beyond the team id.
 */

const ApiError = require('../../utils/api-error');

const attachMicrosoftTokens = (req, res, next) => {
  const accessToken = req.headers['x-microsoft-auth-token'];
  const refreshToken = req.headers['x-microsoft-refresh-token'];

  if (!accessToken) return next(ApiError.unauthorized('Microsoft access token missing'));
  if (!refreshToken) return next(ApiError.unauthorized('Microsoft refresh token missing'));

  req.microsoft = { accessToken, refreshToken };
  return next();
};

module.exports = { attachMicrosoftTokens };
