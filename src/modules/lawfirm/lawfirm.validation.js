'use strict';

const { z } = require('zod');

const createLawfirmSchema = z.object({
  body: z.object({ name: z.string().trim().min(1, 'name is required') }),
});

const updateLawfirmSchema = z.object({
  params: z.object({ lawfirmId: z.coerce.number().int().positive() }),
  body: z.object({ name: z.string().trim().min(1).optional() }),
});

const lawfirmIdSchema = z.object({
  params: z.object({ lawfirmId: z.coerce.number().int().positive() }),
});

const listLawfirmSchema = z.object({ query: z.object({ companies: z.string().optional() }) });

module.exports = { createLawfirmSchema, updateLawfirmSchema, lawfirmIdSchema, listLawfirmSchema };
