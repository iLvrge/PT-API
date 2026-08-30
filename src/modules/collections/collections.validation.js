'use strict';

const { z } = require('zod');

// `companies` arrives as a JSON-encoded array of assignor ids (legacy form post).
const createSchema = z.object({
  body: z.object({
    collection_name: z.string().trim().min(1, 'collection_name is required'),
    companies: z.string().optional(),
  }),
});

const updateSchema = z.object({
  params: z.object({ collectionId: z.coerce.number().int().positive() }),
  body: z.object({
    collection_name: z.string().trim().min(1).optional(),
    companies: z.string().optional(),
  }),
});

const collectionIdSchema = z.object({
  params: z.object({ collectionId: z.coerce.number().int().positive() }),
});

module.exports = { createSchema, updateSchema, collectionIdSchema };
