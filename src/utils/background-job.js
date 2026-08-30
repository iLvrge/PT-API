'use strict';

/**
 * Client for the PHP illustration pipeline that still owns JSON generation.
 *
 * The legacy helper built the URL by string concatenation with unescaped
 * request parameters and passed a callback into an already-async function, so
 * failures resolved as an empty 200 with no record of why. Here the parameters
 * are URL-encoded, the request is bounded by a timeout, and failures are
 * logged before degrading to the same empty response the client expects.
 */

const { env } = require('../config/env');
const logger = require('./logger');

/**
 * Ask the pipeline for an asset's illustration JSON.
 * @returns {Promise<string>} the raw JSON body, or '' when unavailable.
 */
const illustrationJson = async ({ asset, flag = '', orgId = 0, userId = 0 }) => {
  const { backgroundJobUrl, jsonGenerateScript, timeoutMs } = env.external;
  if (!backgroundJobUrl || !jsonGenerateScript) {
    logger.warn('illustration pipeline is not configured');
    return '';
  }

  const query = new URLSearchParams({
    p: String(asset), f: String(flag), o: String(orgId), u: String(userId),
  });
  const url = `${backgroundJobUrl}${jsonGenerateScript}?${query}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`pipeline responded ${res.status}`);
    const body = await res.text();
    // The pipeline returns an error page rather than an error status, so a
    // payload without a box list is treated as "no illustration".
    return body.includes('box') ? body : '';
  } catch (err) {
    logger.warn('illustration pipeline request failed', { asset, error: err.message });
    return '';
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { illustrationJson };
