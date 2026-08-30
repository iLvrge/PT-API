'use strict';

const { z } = require('zod');

const createSchema = z.object({
  body: z.object({
    first_name: z.string().trim().min(1, 'Firstname cannot be empty.'),
    last_name: z.string().trim().min(1, 'Lastname cannot be empty.'),
    email_address: z.string().trim().min(1, 'Email address cannot be empty.').email('Email address is not valid'),
    job_title: z.string().trim().optional(),
    person_linkedin_url: z.string().trim().optional(),
    telephone: z.string().trim().optional(),
    telephone1: z.coerce.number().int().optional(),
    type: z.coerce.number().int().optional(),
    role: z.coerce.number().int().optional(),
  }),
});

const updateSchema = z.object({
  params: z.object({ userId: z.coerce.number().int().positive() }),
  body: z.object({
    first_name: z.string().trim().optional(),
    last_name: z.string().trim().optional(),
    email_address: z.string().trim().optional(),
    linkedin_url: z.string().trim().optional(),
    job_title: z.string().trim().optional(),
    telephone: z.string().trim().optional(),
    telephone1: z.coerce.number().int().optional(),
    password: z.string().optional(),
    status: z.coerce.number().int().optional(),
    type: z.enum(['Admin', 'Manager']).optional(),
    role: z.coerce.number().int().optional(),
  }),
});

const userIdSchema = z.object({ params: z.object({ userId: z.coerce.number().int().positive() }) });
const listQuerySchema = z.object({ query: z.object({ list: z.string().optional() }) });

module.exports = { createSchema, updateSchema, userIdSchema, listQuerySchema };
