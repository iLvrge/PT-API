'use strict';

const { z } = require('zod');

const addressFields = {
  street_address: z.string().trim().optional(),
  suite: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  country: z.string().trim().optional(),
  zip_code: z.string().trim().optional(),
  telephone: z.string().trim().optional(),
  telephone_2: z.string().trim().optional(),
  telephone_3: z.string().trim().optional(),
};

const createAddressSchema = z.object({
  body: z.object({
    ...addressFields,
    representative_id: z.coerce.number().int().positive(),
    // required on create — declared AFTER the spread so it is not overridden
    street_address: z.string().trim().min(1, 'street_address is required'),
  }),
});

const updateAddressSchema = z.object({
  params: z.object({ addressId: z.coerce.number().int().positive() }),
  body: z.object(addressFields),
});

const addressIdSchema = z.object({ params: z.object({ addressId: z.coerce.number().int().positive() }) });
const companiesQuerySchema = z.object({ query: z.object({ companies: z.string().optional() }) });

module.exports = { createAddressSchema, updateAddressSchema, addressIdSchema, companiesQuerySchema };
