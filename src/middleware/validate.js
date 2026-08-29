'use strict';

/**
 * Request validation middleware backed by zod schemas.
 *
 * Audit findings F13 / F17: validation used to be an accident of the ORM's
 * NOT NULL constraints, surfacing as a generic `402 Bad inputs`. Here each
 * write route declares a schema; a failure returns 400 with the exact fields.
 *
 *   route.post('/users', validate(createUserSchema), controller.create);
 *
 * The schema may validate any of { body, params, query }. Parsed (coerced)
 * values are written back so handlers read normalised data.
 */

const ApiError = require('../utils/api-error');

const validate = (schema) => (req, res, next) => {
  const target = {
    body: req.body,
    params: req.params,
    query: req.query,
  };

  const result = schema.safeParse(target);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.').replace(/^(body|params|query)\./, ''),
      message: i.message,
    }));
    return next(ApiError.badRequest('Validation failed', details));
  }

  if (result.data.body) req.body = result.data.body;
  if (result.data.params) req.params = result.data.params;
  if (result.data.query) req.query = result.data.query;
  return next();
};

module.exports = validate;
