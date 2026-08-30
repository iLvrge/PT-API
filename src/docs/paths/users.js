'use strict';

// Tenant users (/users) — the client-facing user management, distinct from the
// admin-only /admin/customers/{id}/users.

const h = require('../helpers');
const E = h.TENANT_ERRORS;

module.exports = {
  '/users/': {
    get: h.operation({
      tag: 'Users',
      summary: 'List users in the caller organisation',
      ok: h.listResponse('Users.', h.ref('User')),
      errors: E,
    }),
    post: h.operation({
      tag: 'Users',
      summary: 'Create a user',
      body: h.jsonBody(h.ref('NewUser')),
      ok: h.jsonResponse('Created.', h.ref('User')),
      status: 201,
      errors: E,
      extraResponses: { 409: h.errorResponse('That email address is already registered.') },
    }),
    delete: h.operation({
      tag: 'Users',
      summary: 'Delete several users at once',
      params: [h.jsonArrayQuery('users', 'User ids to delete.', '[3,4]')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
    }),
  },
  '/users/{userId}': {
    put: h.operation({
      tag: 'Users',
      summary: 'Update a user',
      params: [h.numericPathParam('userId', 'User id.')],
      body: h.jsonBody(h.ref('NewUser'), false),
      ok: h.jsonResponse('Updated.', h.ref('User')),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such user.') },
    }),
    delete: h.operation({
      tag: 'Users',
      summary: 'Delete a user',
      params: [h.numericPathParam('userId', 'User id.')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such user.') },
    }),
  },
  '/users/invite': {
    post: h.operation({
      tag: 'Users',
      summary: 'Invite a user by email',
      description:
        'Not yet ported: the invitation mail and Slack notification depend on the messaging tier. '
        + 'Returns 501 until that module lands.',
      body: h.jsonBody({
        type: 'object',
        properties: { email_address: { type: 'string', format: 'email' } },
      }),
      ok: h.objectResponse('Invitation sent.'),
      errors: h.AUTH_ERRORS,
      extraResponses: { 501: h.errorResponse('Not implemented yet — messaging tier pending.') },
    }),
  },
};
