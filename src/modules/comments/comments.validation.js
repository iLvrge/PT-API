'use strict';

const { z } = require('zod');

const subjectTypeParam = z.string().trim().min(1);

const listSchema = z.object({ params: z.object({ subjectType: subjectTypeParam }) });

const getBySubjectSchema = z.object({
  params: z.object({ subjectType: subjectTypeParam, subject: z.string().trim().min(1) }),
});

const createSchema = z.object({
  params: z.object({ subjectType: subjectTypeParam }),
  body: z.object({
    subject: z.union([z.string(), z.number()]),
    comment: z.string().trim().min(1, 'comment is required'),
    professional_id: z.coerce.number().int().optional(),
    document_id: z.coerce.number().int().optional(),
  }),
});

const commentIdSchema = z.object({
  params: z.object({ ID: z.coerce.number().int().positive() }),
  body: z.object({ comment: z.string().trim().min(1, 'comment is required').optional() }),
});

module.exports = { listSchema, getBySubjectSchema, createSchema, commentIdSchema };
