'use strict';

const { z } = require('zod');

const createSchema = z.object({
  body: z.object({
    category_name: z.string().trim().min(1, 'category_name is required'),
    products: z.string().optional().default(''),
  }),
});

const categoryIdSchema = z.object({ params: z.object({ category_id: z.coerce.number().int().positive() }) });
const productIdSchema = z.object({ params: z.object({ product_id: z.coerce.number().int().positive() }) });

module.exports = { createSchema, categoryIdSchema, productIdSchema };
