'use strict';

const { z } = require('zod');

const addressBody = z.object({
  lawfirm_id: z.coerce.number().int().positive(),
  street_address: z.string().trim().optional(),
  suite: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  country: z.string().trim().optional(),
  zip_code: z.string().trim().optional(),
  telephone: z.string().trim().optional(),
});

const createSchema = z.object({ body: addressBody });
const updateSchema = z.object({
  params: z.object({ addressId: z.coerce.number().int().positive() }),
  body: addressBody.partial(),
});
const addressIdSchema = z.object({ params: z.object({ addressId: z.coerce.number().int().positive() }) });
const lawfirmIdSchema = z.object({ params: z.object({ lawfirmId: z.coerce.number().int().positive() }) });

module.exports = { createSchema, updateSchema, addressIdSchema, lawfirmIdSchema };
