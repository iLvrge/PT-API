'use strict';

// Health, authentication, profile and the admin sign-in.

const h = require('../helpers');

module.exports = {
  '/health': {
    get: h.operation({
      tag: 'Health',
      summary: 'Liveness probe',
      description: 'Answers as soon as the process is up. Does not touch the database.',
      ok: h.jsonResponse('The service is running.', {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          uptime: { type: 'number' },
          version: { type: 'string' },
        },
      }),
      errors: {},
      public: true,
    }),
  },

  '/health/ready': {
    get: h.operation({
      tag: 'Health',
      summary: 'Readiness probe',
      description:
        'Authenticates against every configured database. Returns 503 when any of them is down, '
        + 'so a load balancer can take the instance out of rotation.',
      ok: h.jsonResponse('Every database answered.', {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          databases: { type: 'object', additionalProperties: { type: 'string', example: 'up' } },
        },
      }),
      errors: {},
      extraResponses: { 503: h.errorResponse('At least one database is unreachable.') },
      public: true,
    }),
  },

  '/signin': {
    post: h.operation({
      tag: 'Auth',
      summary: 'Sign in and receive a bearer token',
      description:
        'Start here. Copy `accessToken` from the response into the Authorize dialog to exercise '
        + 'every other endpoint.',
      body: h.jsonBody(h.ref('Credentials')),
      ok: h.jsonResponse('Signed in.', h.ref('AuthToken')),
      errors: {
        400: h.errorResponse('Missing username or password.'),
        401: h.errorResponse('Unknown user, wrong password, or the account is disabled.'),
        429: h.errorResponse('Too many sign-in attempts from this address.'),
        500: h.errorResponse('Unexpected server error.'),
      },
      public: true,
    }),
  },

  '/refresh-token': {
    get: h.operation({
      tag: 'Auth',
      summary: 'Exchange a valid token for a fresh one',
      description:
        'The signature of the presented token is verified before a new one is issued. The legacy '
        + 'endpoint only decoded the payload, so any user could mint a token for any account.',
      ok: h.jsonResponse('A new token.', h.ref('AuthToken')),
    }),
  },

  '/admin/signin': {
    post: h.operation({
      tag: 'Auth',
      summary: 'Sign in to the admin console',
      body: h.jsonBody(h.ref('Credentials')),
      ok: h.jsonResponse('Signed in.', h.ref('AuthToken')),
      errors: {
        400: h.errorResponse('Missing username or password.'),
        401: h.errorResponse('Unknown user or wrong password.'),
        429: h.errorResponse('Too many sign-in attempts from this address.'),
        500: h.errorResponse('Unexpected server error.'),
      },
      public: true,
    }),
  },

  '/profile': {
    get: h.operation({
      tag: 'Profile',
      summary: "The signed-in user's profile and organisation",
      ok: h.jsonResponse('The profile.', h.ref('Profile')),
    }),
  },
};
