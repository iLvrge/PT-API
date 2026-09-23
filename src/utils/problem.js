'use strict';

/**
 * RFC 7807 problem documents.
 *
 * Every error the API returns is one of these. The `type` is the part a client
 * matches on: it is a stable identifier for a failure mode, and it does not
 * change when the wording of `detail` does. `detail` is written for a person
 * reading a log or a toast, and may change at any time.
 *
 * One `type` per failure mode, not per status code — "the share code is
 * unknown" and "that asset id does not exist" are both 404s, but a caller may
 * want to treat them differently. Where a call site has not named a type, the
 * status decides, which is why every status here has a fallback.
 */

const { env } = require('../config/env');

/**
 * Where the type URIs live.
 *
 * They must resolve to something that explains the failure; a stable string
 * that 404s is worse than no identifier at all. Point this at the docs host
 * once a page exists for each one.
 */
const BASE = (process.env.ERROR_TYPE_BASE_URL
  || `https://api.${env.share.domain}/errors`).replace(/\/$/, '');

const uri = (slug) => `${BASE}/${slug}`;

/** The catalogue. Slugs are part of the contract — do not rename in place. */
const TYPES = {
  VALIDATION: { slug: 'validation-error', status: 400, title: 'Validation Error' },
  MALFORMED_ARRAY: { slug: 'malformed-json-array', status: 400, title: 'Malformed JSON Array' },
  BAD_REQUEST: { slug: 'bad-request', status: 400, title: 'Bad Request' },
  INVALID_TOKEN: { slug: 'invalid-token', status: 401, title: 'Invalid Token' },
  ADMIN_REQUIRED: { slug: 'admin-required', status: 403, title: 'Admin Access Required' },
  FORBIDDEN: { slug: 'forbidden', status: 403, title: 'Forbidden' },
  NOT_FOUND: { slug: 'not-found', status: 404, title: 'Not Found' },
  UNKNOWN_SHARE_CODE: { slug: 'unknown-share-code', status: 404, title: 'Unknown Share Code' },
  CONFLICT: { slug: 'conflict', status: 409, title: 'Conflict' },
  RATE_LIMITED: { slug: 'rate-limited', status: 429, title: 'Too Many Requests' },
  INTERNAL: { slug: 'internal-error', status: 500, title: 'Internal Server Error' },
  NOT_IMPLEMENTED: { slug: 'not-implemented', status: 501, title: 'Not Implemented' },
  TENANT_UNAVAILABLE: { slug: 'tenant-unavailable', status: 503, title: 'Tenant Unavailable' },
};

/** The type a bare status maps to when no call site named one. */
const BY_STATUS = {
  400: TYPES.BAD_REQUEST,
  401: TYPES.INVALID_TOKEN,
  403: TYPES.FORBIDDEN,
  404: TYPES.NOT_FOUND,
  409: TYPES.CONFLICT,
  429: TYPES.RATE_LIMITED,
  501: TYPES.NOT_IMPLEMENTED,
  503: TYPES.TENANT_UNAVAILABLE,
};

const forStatus = (status) => BY_STATUS[status] || TYPES.INTERNAL;

/**
 * Build the response body.
 *
 * The legacy `error` envelope is carried in the same document rather than
 * behind content negotiation. Negotiation would have meant every existing
 * caller keeps the old shape forever, because none of them sends an Accept
 * header that asks for the new one; including both means a client can move
 * field by field and the old one never breaks. `error` goes in 3.0.0.
 */
const build = ({ status, title, type, detail, instance, requestId, errors }) => {
  const problem = { type, title, status };
  if (detail) problem.detail = detail;
  if (instance) problem.instance = instance;
  if (requestId) problem.requestId = requestId;
  if (errors && errors.length) problem.errors = errors;

  problem.error = {
    message: detail || title,
    ...(requestId ? { requestId } : {}),
    ...(errors && errors.length ? { details: errors } : {}),
  };
  return problem;
};

/** Turn an ApiError into a problem document. */
const fromApiError = (apiError, req, { detail } = {}) => {
  const named = apiError.type && TYPES[apiError.type];
  // A named type whose catalogued status disagrees with the one being sent
  // would produce a document titled for a different failure. The status wins.
  const usable = named && named.status === apiError.statusCode ? named : null;
  const kind = usable || forStatus(apiError.statusCode);
  return build({
    status: apiError.statusCode,
    title: kind.title,
    type: uri(kind.slug),
    detail: detail !== undefined ? detail : apiError.message,
    instance: req && req.originalUrl ? req.originalUrl.split('?')[0] : undefined,
    requestId: req && req.id,
    errors: apiError.details || undefined,
  });
};

const MEDIA_TYPE = 'application/problem+json';

module.exports = { TYPES, BASE, uri, forStatus, build, fromApiError, MEDIA_TYPE };
