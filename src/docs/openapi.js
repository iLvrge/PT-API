'use strict';

/**
 * OpenAPI 3.0 specification for the implemented v2 endpoints. Served as
 * interactive docs at GET /docs and as raw JSON at GET /docs.json.
 *
 * Kept as a hand-written spec (rather than generated from decorators) so it
 * stays readable and reviewable. Extend it as modules are added.
 */

const errorResponse = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: { field: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
  },
};

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'PatenTrack API (v2)',
    version: '2.0.0',
    description:
      'Industry-standard rewrite. Layered architecture with a raw-SELECT / Sequelize-write split. ' +
      'Only implemented endpoints are documented here.',
  },
  servers: [{ url: '/', description: 'Current host' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: errorResponse,
      Credentials: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'user@example.com' },
          password: { type: 'string', example: 'secret' },
        },
      },
      AuthToken: {
        type: 'object',
        properties: {
          auth: { type: 'boolean' },
          accessToken: { type: 'string' },
          message: { type: 'string' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          email_address: { type: 'string' },
          type: { type: 'integer', description: '0 = manager, 1 = member' },
        },
      },
      NewUser: {
        type: 'object',
        required: ['first_name', 'email_address', 'password', 'type'],
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string', description: 'Optional; stored as "" when omitted' },
          email_address: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          job_title: { type: 'string' },
          type: { type: 'integer', enum: [0, 1] },
        },
      },
      Keyword: {
        type: 'object',
        properties: { id: { type: 'integer' }, keyword: { type: 'string' } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        security: [],
        responses: { 200: { description: 'Process is up' } },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe (checks every DB connection)',
        security: [],
        responses: { 200: { description: 'Ready' }, 503: { description: 'A database is down' } },
      },
    },
    '/signin': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in and receive a JWT',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } },
        },
        responses: {
          200: { description: 'Authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthToken' } } } },
          400: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Incorrect credentials' },
        },
      },
    },
    '/refresh-token': {
      get: {
        tags: ['Auth'],
        summary: 'Exchange a valid token for a fresh one (signature verified)',
        parameters: [{ in: 'header', name: 'x-auth-token', schema: { type: 'string' }, required: true }],
        security: [],
        responses: { 200: { description: 'New token' }, 401: { description: 'Invalid or expired token' } },
      },
    },
    '/admin/customers/{id}/users': {
      get: {
        tags: ['Users'],
        summary: 'List users in an organisation',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'User list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } },
          401: { description: 'Unauthorized' },
          403: { description: 'Admin required' },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create a user in an organisation',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NewUser' } } },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          400: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { description: 'Email already exists' },
        },
      },
    },
    '/admin/customers/{id}/users/{userId}': {
      delete: {
        tags: ['Users'],
        summary: 'Delete a user',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'userId', required: true, schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } },
      },
    },
    '/admin/keywords': {
      get: {
        tags: ['Keywords'],
        summary: 'List keywords',
        responses: { 200: { description: 'Keyword list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Keyword' } } } } } },
      },
      post: {
        tags: ['Keywords'],
        summary: 'Create a keyword',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['keyword'], properties: { keyword: { type: 'string' } } } } },
        },
        responses: { 201: { description: 'Created' }, 400: { description: 'Validation failed' } },
      },
    },
    '/admin/keywords/{keywordId}': {
      put: {
        tags: ['Keywords'],
        summary: 'Rename a keyword',
        parameters: [{ in: 'path', name: 'keywordId', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['keyword'], properties: { keyword: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Updated' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Keywords'],
        summary: 'Delete a keyword',
        parameters: [{ in: 'path', name: 'keywordId', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Deleted' }, 404: { description: 'Not found' } },
      },
    },
  },
};

module.exports = openapi;
