'use strict';

const { z } = require('zod');

const orgIdParam = z.coerce.number().int().positive();

const createUserSchema = z.object({
  params: z.object({ id: orgIdParam }),
  body: z.object({
    first_name: z.string().trim().min(1, 'first_name is required'),
    last_name: z.string().trim().optional().default(''),
    email_address: z.string().trim().email('email_address must be a valid email'),
    password: z.string().min(6, 'password must be at least 6 characters'),
    job_title: z.string().trim().optional(),
    linkedin_url: z.string().trim().url().optional().or(z.literal('')),
    logo: z.string().trim().optional(),
    // 0 = manager, 1 = member. Accept string or number from form posts.
    type: z.coerce.number().int().min(0).max(1),
  }),
});

const listUsersSchema = z.object({
  params: z.object({ id: orgIdParam }),
});

const deleteUserSchema = z.object({
  params: z.object({
    id: orgIdParam,
    userId: z.coerce.number().int().positive(),
  }),
});

module.exports = { createUserSchema, listUsersSchema, deleteUserSchema };
