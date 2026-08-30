'use strict';

const { z } = require('zod');

const createSchema = z.object({
  body: z.object({
    first_name: z.string().trim().min(1, 'first_name is required'),
    last_name: z.string().trim().optional().default(''),
    email_address: z.string().trim().email().optional().or(z.literal('')),
    telephone: z.string().trim().optional(),
    telephone1: z.coerce.number().int().optional(),
    linkedin_url: z.string().trim().optional(),
    firm_id: z.coerce.number().int().positive({ message: 'Please select a lawfirm' }),
  }),
});

const updateSchema = z.object({
  params: z.object({ professionalId: z.coerce.number().int().positive() }),
  body: z.object({
    first_name: z.string().trim().optional(),
    last_name: z.string().trim().optional(),
    email_address: z.string().trim().optional(),
    telephone: z.string().trim().optional(),
    telephone1: z.coerce.number().int().optional(),
    linkedin_url: z.string().trim().optional(),
    firm_id: z.coerce.number().int().optional(),
  }),
});

const professionalIdSchema = z.object({
  params: z.object({ professionalId: z.coerce.number().int().positive() }),
});

module.exports = { createSchema, updateSchema, professionalIdSchema };
