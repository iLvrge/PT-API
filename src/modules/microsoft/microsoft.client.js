'use strict';

/**
 * Microsoft Graph access.
 *
 * The access token expires while a user is working, so every call goes through
 * `withRefresh`, which retries once on InvalidAuthenticationToken with a token
 * refreshed from the caller's refresh token. The legacy code duplicated that
 * retry inline in each helper, and one copy assigned `newTokens.accessToken`
 * where the token endpoint actually returns `access_token`, so the retry always
 * built a client with an undefined token.
 */

const { Client } = require('@microsoft/microsoft-graph-client');
const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');
const logger = require('../../utils/logger');

const clientFor = (accessToken) =>
  Client.init({ authProvider: (done) => done(null, accessToken) });

const SCOPES = 'openid profile offline_access';

/** Exchange a refresh token for a new access token. */
const refreshAccessToken = async (refreshToken) => {
  const { tenantId, clientId, clientSecret } = env.microsoft;
  if (!tenantId || !clientId || !clientSecret) {
    throw ApiError.internal('Microsoft integration is not configured');
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
    signal: AbortSignal.timeout(env.external.timeoutMs),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw ApiError.unauthorized('Could not refresh the Microsoft token');
  }
  return data.access_token;
};

const isExpiredToken = (err) =>
  err && (err.code === 'InvalidAuthenticationToken' || err.statusCode === 401);

/**
 * Run a Graph call, retrying once with a refreshed token if the current one
 * has expired.
 * @param {{accessToken: string, refreshToken: string}} tokens
 * @param {(client: object) => Promise<any>} work
 */
const withRefresh = async (tokens, work) => {
  try {
    return await work(clientFor(tokens.accessToken));
  } catch (err) {
    if (!isExpiredToken(err)) throw err;
    logger.info('refreshing the Microsoft access token');
    const accessToken = await refreshAccessToken(tokens.refreshToken);
    // `tokens` is the per-request object built by the middleware, so there is
    // no concurrent writer; keeping the refreshed token on it means the rest of
    // the request reuses it instead of refreshing again.
    // eslint-disable-next-line require-atomic-updates
    tokens.accessToken = accessToken;
    return work(clientFor(accessToken));
  }
};

module.exports = { clientFor, refreshAccessToken, withRefresh, isExpiredToken, SCOPES };
