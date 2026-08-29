'use strict';

const { z } = require('zod');

const signinSchema = z.object({
  body: z.object({
    username: z.string().trim().min(1, 'username is required'),
    password: z.string().min(1, 'password is required'),
  }),
});

module.exports = { signinSchema };
