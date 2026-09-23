'use strict';

const { z } = require('zod');

const idParam = z.coerce.number().int().positive();

const createKeywordSchema = z.object({
  body: z.object({ keyword: z.string().trim().min(1, 'keyword is required') }),
});

const updateKeywordSchema = z.object({
  params: z.object({ keyword_id: idParam }),
  body: z.object({ keyword: z.string().trim().min(1, 'keyword is required') }),
});

const keywordIdSchema = z.object({
  params: z.object({ keyword_id: idParam }),
});

module.exports = { createKeywordSchema, updateKeywordSchema, keywordIdSchema };
