'use strict';

/**
 * European Patent Office Open Patent Services.
 *
 * Three things differ from the legacy helper:
 *
 * The token cache was inverted — when it found a still-valid cached token it
 * set `createNewToken = false` and then `token = ''`, returning an empty
 * string. Every caller guards on `token != ''`, so a warm cache meant no EPO
 * request was ever made. The cache is in memory here and returns the token.
 *
 * It disabled TLS certificate verification on every call. It does not here.
 *
 * It wrote tokens to /var/www/html/trash/tmp. Nothing is written to disk.
 */

const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');
const logger = require('../../utils/logger');

// Refresh a little before expiry so a request in flight cannot age out.
const EXPIRY_MARGIN_MS = 120 * 1000;

let cached = null; // { token, expiresAt }

const requestToken = async () => {
  const { key, secret } = env.epo;
  if (!key || !secret) throw ApiError.internal('The EPO credentials are not configured');

  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch('https://ops.epo.org/3.2/auth/accesstoken', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(env.external.timeoutMs),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.access_token) {
    throw ApiError.internal('Could not obtain an EPO access token');
  }

  const lifetimeMs = (Number(data.expires_in) || 1200) * 1000;
  cached = { token: data.access_token, expiresAt: Date.now() + lifetimeMs - EXPIRY_MARGIN_MS };
  return cached.token;
};

/** A valid access token, reusing the cached one while it lasts. */
const accessToken = async () => {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  return requestToken();
};

/**
 * Fetch from an OPS service.
 * @param {string} service e.g. 'family'
 * @param {string} referenceType 'publication' or 'application'
 * @param {string} format 'docdb' or 'epodoc'
 * @param {string} reference e.g. 'US9446259/legal'
 * @returns {Promise<string>} the XML body, or '' when OPS has no record
 */
const fetchXml = async (service, referenceType, format, reference) => {
  const token = await accessToken();
  const url = `${env.epo.baseUrl}/rest-services/${service}/${referenceType}/${format}/${reference}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' },
    signal: AbortSignal.timeout(env.external.timeoutMs),
  });

  if (res.status === 404) return '';
  if (res.status === 401) {
    // The token was rejected: drop it so the next call fetches a fresh one.
    cached = null;
    throw ApiError.internal('The EPO rejected our access token');
  }
  if (!res.ok) {
    logger.warn('EPO request failed', { service, reference, status: res.status });
    return '';
  }
  return res.text();
};

/**
 * Family data for a publication, trying the DOCDB format first and falling
 * back to EPODOC. Returns '' when neither knows the reference.
 */
const familyXml = async ({ reference, referenceType = 'publication' }) => {
  let xml = await fetchXml('family', referenceType, 'docdb', `${reference}/legal`);
  if (!xml || xml.includes('EntityNotFound')) {
    xml = await fetchXml('family', referenceType, 'epodoc', `${reference}/legal`);
  }
  return xml && !xml.includes('EntityNotFound') ? xml : '';
};

/** Test seam: forget the cached token. */
const resetToken = () => {
  cached = null;
};

module.exports = { accessToken, fetchXml, familyXml, resetToken };
