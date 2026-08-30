'use strict';

const { z } = require('zod');

const createTelephoneSchema = z.object({
  body: z.object({
    representative_id: z.coerce.number().int().positive(),
    telephone_number: z.string().trim().min(1, 'telephone_number is required'),
  }),
});

// companies is an optional JSON-encoded array of representative ids in the query.
const listTelephoneSchema = z.object({
  query: z.object({ companies: z.string().optional() }),
});

const telephoneIdSchema = z.object({
  params: z.object({ telephoneId: z.coerce.number().int().positive() }),
});

module.exports = { createTelephoneSchema, listTelephoneSchema, telephoneIdSchema };
