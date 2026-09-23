'use strict';

/**
 * Builders for the OpenAPI path objects in ./paths.
 *
 * Most of this API takes the same handful of parameter shapes — JSON arrays
 * passed as query strings, numeric path ids, form-encoded bodies — so they are
 * expressed once here rather than repeated across 195 operations.
 */

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

/** A path parameter. Always required, by definition. */
const pathParam = (name, description, schema = { type: 'string' }) => ({
  name, in: 'path', required: true, description, schema,
});

const numericPathParam = (name, description) =>
  pathParam(name, description, { type: 'integer' });

/** A query parameter. */
const queryParam = (name, description, schema = { type: 'string' }, required = false) => ({
  name, in: 'query', required, description, schema,
});

/**
 * A JSON array sent as a query string, e.g. companies=[9,10]. The client
 * serialises these itself, so they are documented as strings with an example.
 */
const jsonArrayQuery = (name, description, example = '[9]') =>
  queryParam(name, `${description} JSON array, e.g. ${example}`, { type: 'string', example });

const paginationParams = [
  queryParam('limit', 'Maximum rows to return.', { type: 'integer', example: 100 }),
  queryParam('offset', 'Rows to skip.', { type: 'integer', example: 0 }),
];

/** A JSON request body. */
const jsonBody = (schema, required = true) => ({
  required,
  content: { 'application/json': { schema } },
});

/**
 * A form-encoded body. The dashboard and customer screens post
 * application/x-www-form-urlencoded with JSON-encoded array fields.
 */
const formBody = (properties, required = []) => ({
  required: true,
  content: {
    'application/x-www-form-urlencoded': { schema: { type: 'object', properties, required } },
    'application/json': { schema: { type: 'object', properties, required } },
  },
});

/** A JSON array field inside a form body. */
const jsonArrayField = (description, example = '[9]') => ({
  type: 'string', description: `${description} JSON array.`, example,
});

const multipartBody = (fieldName, description) => ({
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        properties: { [fieldName]: { type: 'string', format: 'binary', description } },
        required: [fieldName],
      },
    },
  },
});

/* ------------------------------------------------------------- responses */

const jsonResponse = (description, schema) => ({
  description,
  content: { 'application/json': { schema } },
});

const textResponse = (description, example) => ({
  description,
  content: { 'text/plain': { schema: { type: 'string', example } } },
});

const arrayOf = (schema) => ({ type: 'array', items: schema });
const objectResponse = (description) => jsonResponse(description, { type: 'object' });
const listResponse = (description, items = { type: 'object' }) =>
  jsonResponse(description, arrayOf(items));

/**
 * An error response.
 *
 * Errors are served as RFC 7807 problem documents. The media type is
 * `application/problem+json`, which is what makes a generic client treat the
 * body as an error rather than as data.
 */
const errorResponse = (description) => ({
  description,
  content: { 'application/problem+json': { schema: ref('Problem') } },
});

/**
 * The 429 every operation can answer.
 *
 * `globalLimiter` is mounted on every request in app.js, so this is not a
 * property of particular endpoints — it applies to all of them, and the spec
 * said so on ten. `Retry-After` tells the caller how long to wait instead of
 * making them guess.
 */
const RATE_LIMITED = {
  ...errorResponse('Rate limit exceeded. Retry after the interval in the Retry-After header.'),
  headers: {
    'Retry-After': {
      description: 'Seconds to wait before retrying.',
      schema: { type: 'integer', example: 900 },
    },
    'RateLimit-Limit': {
      description: 'Requests permitted in the current window.',
      schema: { type: 'integer', example: 300 },
    },
    'RateLimit-Remaining': {
      description: 'Requests left in the current window.',
      schema: { type: 'integer', example: 0 },
    },
    'RateLimit-Reset': {
      description: 'Seconds until the window resets.',
      schema: { type: 'integer', example: 900 },
    },
  },
};

// Attached to every authenticated operation so the failure modes are visible
// in the UI rather than discovered by trial.
const AUTH_ERRORS = {
  400: errorResponse('Validation failed. The body names the offending fields.'),
  401: errorResponse('Missing, malformed or expired bearer token.'),
  429: RATE_LIMITED,
  500: errorResponse('Unexpected server error.'),
};

const TENANT_ERRORS = {
  ...AUTH_ERRORS,
  503: errorResponse("The caller's tenant database is unavailable."),
};

/**
 * One operation.
 * @param {object} spec
 * @param {string} spec.tag group in the UI
 * @param {string} spec.summary one line, imperative
 * @param {string} [spec.description] longer notes, including legacy caveats
 * @param {Array} [spec.params] parameters
 * @param {object} [spec.body] requestBody
 * @param {object} spec.ok the 200/201 response
 * @param {object} [spec.errors] which error set applies
 * @param {object} [spec.extraResponses] e.g. 404
 * @param {boolean} [spec.public] true when no token is required
 * @param {string} [spec.deprecated] why, and what to use instead
 */
const operation = ({
  tag, summary, description, params, body, ok, errors = AUTH_ERRORS, extraResponses = {},
  public: isPublic = false, status = 200, deprecated,
}) => {
  const op = {
    tags: [tag],
    summary,
    // 429 is merged in here rather than left to each `errors` set: the global
    // limiter runs in front of every route, including the public ones and the
    // health probes, so no operation is exempt.
    responses: { [status]: ok, 429: RATE_LIMITED, ...errors, ...extraResponses },
  };
  if (description) op.description = description;
  if (params && params.length) op.parameters = params;
  if (body) op.requestBody = body;
  if (isPublic) {
    op.security = [];
    delete op.responses[401];
  }
  if (deprecated) {
    op.deprecated = true;
    op.description = `**Deprecated.** ${deprecated}${description ? `\n\n${description}` : ''}`;
  }
  return op;
};

module.exports = {
  ref,
  pathParam,
  numericPathParam,
  queryParam,
  jsonArrayQuery,
  paginationParams,
  jsonBody,
  formBody,
  jsonArrayField,
  multipartBody,
  jsonResponse,
  textResponse,
  listResponse,
  objectResponse,
  errorResponse,
  arrayOf,
  operation,
  AUTH_ERRORS,
  TENANT_ERRORS,
  RATE_LIMITED,
};
