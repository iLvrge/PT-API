'use strict';

/**
 * Announce a deprecated endpoint at runtime, not only in the docs.
 *
 * A `deprecated: true` in the OpenAPI document is only seen by someone reading
 * the OpenAPI document. RFC 8594 puts it in the response itself, so a client
 * that never opens Swagger UI still finds out — in its own logs, against its
 * own traffic.
 *
 *   Deprecation: true
 *   Sunset: Wed, 01 Jul 2026 00:00:00 GMT
 *   Link: <...>; rel="successor-version"
 *   Warning: 299 - "..."
 *
 * The endpoint keeps working. This is notice, not removal.
 */

/**
 * When the deprecated forms stop being served.
 *
 * One date for the whole 3.0.0 release rather than one per endpoint: they are
 * removed together, and a per-endpoint date would drift from the release it
 * actually depends on.
 */
const SUNSET = new Date('2026-07-01T00:00:00Z');

const deprecated = ({ reason, successor }) => (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET.toUTCString());
  if (successor) res.setHeader('Link', `<${successor}>; rel="successor-version"`);
  // 299 is the "miscellaneous persistent warning" code; the quoted text is
  // what a client logs verbatim.
  res.setHeader('Warning', `299 - "${reason.replace(/"/g, "'")}"`);
  next();
};

module.exports = { deprecated, SUNSET };
