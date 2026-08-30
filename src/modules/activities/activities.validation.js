'use strict';

const { z } = require('zod');

const listSchema = z.object({
  query: z.object({ type: z.string().optional(), count: z.string().optional() }),
});

const typeOptionSchema = z.object({
  params: z.object({ type: z.string().trim().min(1), option: z.enum(['count', 'list']) }),
});

const commentsSchema = z.object({
  params: z.object({ subject_type: z.string().trim().min(1), subject: z.string().trim().min(1) }),
});

const idSchema = z.object({ params: z.object({ id: z.coerce.number().int().positive() }) });

const updateSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({ complete: z.coerce.number().int() }),
});

module.exports = { listSchema, typeOptionSchema, commentsSchema, idSchema, updateSchema };
