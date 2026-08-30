'use strict';

// Admin-only resources: client users, keyword lists and the corporate tree upload.

const h = require('../helpers');

// The four admin list resources share one shape: { id, keyword }.
const listResource = (basePath, tag, noun) => ({
  [basePath]: {
    get: h.operation({
      tag,
      summary: `List ${noun}`,
      ok: h.listResponse(`Every ${noun} entry.`, h.ref('ListItem')),
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
    }),
    post: h.operation({
      tag,
      summary: `Add a ${noun} entry`,
      body: h.jsonBody(h.ref('ListItemInput')),
      ok: h.jsonResponse('Created.', h.ref('ListItem')),
      status: 201,
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
    }),
  },
  [`${basePath}/{id}`]: {
    put: h.operation({
      tag,
      summary: `Rename a ${noun} entry`,
      params: [h.numericPathParam('id', 'Entry id.')],
      body: h.jsonBody(h.ref('ListItemInput')),
      ok: h.jsonResponse('Updated.', h.ref('ListItem')),
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
      extraResponses: { 404: h.errorResponse('No such entry.') },
    }),
    delete: h.operation({
      tag,
      summary: `Delete a ${noun} entry`,
      params: [h.numericPathParam('id', 'Entry id.')],
      ok: h.jsonResponse('Deleted.', {
        type: 'object',
        properties: { id: { type: 'integer' }, deleted: { type: 'boolean' } },
      }),
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
      extraResponses: { 404: h.errorResponse('No such entry.') },
    }),
  },
});

const keywordPaths = {
  '/admin/keywords': {
    get: h.operation({
      tag: 'Admin lists',
      summary: 'List keywords',
      ok: h.listResponse('Every keyword.', h.ref('ListItem')),
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
    }),
    post: h.operation({
      tag: 'Admin lists',
      summary: 'Add a keyword',
      body: h.jsonBody(h.ref('ListItemInput')),
      ok: h.jsonResponse('Created.', h.ref('ListItem')),
      status: 201,
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
    }),
  },
  '/admin/keywords/{keywordId}': {
    put: h.operation({
      tag: 'Admin lists',
      summary: 'Rename a keyword',
      params: [h.numericPathParam('keywordId', 'Keyword id.')],
      body: h.jsonBody(h.ref('ListItemInput')),
      ok: h.jsonResponse('Updated.', h.ref('ListItem')),
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
      extraResponses: { 404: h.errorResponse('No such keyword.') },
    }),
    delete: h.operation({
      tag: 'Admin lists',
      summary: 'Delete a keyword',
      params: [h.numericPathParam('keywordId', 'Keyword id.')],
      ok: h.jsonResponse('Deleted.', {
        type: 'object',
        properties: { id: { type: 'integer' }, deleted: { type: 'boolean' } },
      }),
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
      extraResponses: { 404: h.errorResponse('No such keyword.') },
    }),
  },
};

module.exports = {
  ...keywordPaths,
  ...listResource('/admin/super_keywords', 'Admin lists', 'super keyword'),
  ...listResource('/admin/state', 'Admin lists', 'state'),
  ...listResource('/admin/company_keywords', 'Admin lists', 'company keyword'),

  '/admin/customers/{id}/users': {
    get: h.operation({
      tag: 'Admin users',
      summary: "List a customer organisation's users",
      params: [h.numericPathParam('id', 'Organisation id.')],
      ok: h.listResponse('The organisation users.', h.ref('User')),
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
    }),
    post: h.operation({
      tag: 'Admin users',
      summary: 'Create a user in a customer organisation',
      params: [h.numericPathParam('id', 'Organisation id.')],
      body: h.jsonBody(h.ref('NewUser')),
      ok: h.jsonResponse('Created.', h.ref('User')),
      status: 201,
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
      extraResponses: { 409: h.errorResponse('That email address is already registered.') },
    }),
  },

  '/admin/customers/{id}/users/{userId}': {
    delete: h.operation({
      tag: 'Admin users',
      summary: 'Delete a user from a customer organisation',
      params: [
        h.numericPathParam('id', 'Organisation id.'),
        h.numericPathParam('userId', 'User id.'),
      ],
      ok: h.objectResponse('Deleted.'),
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
      extraResponses: { 404: h.errorResponse('No such user in that organisation.') },
    }),
  },

  '/admin/corporate_tree': {
    post: h.operation({
      tag: 'Admin tree',
      summary: 'Upload a corporate-structure HTML export',
      description:
        'Stores the upload and returns the markup verbatim; the client parses the tree itself. '
        + 'Only HTML uploads are accepted.',
      body: h.multipartBody('file', 'The corporate tree, exported as HTML.'),
      ok: {
        description: 'The stored markup.',
        content: { 'text/html': { schema: { type: 'string' } } },
      },
      errors: { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') },
    }),
  },
};
