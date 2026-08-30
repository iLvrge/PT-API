'use strict';

/**
 * Documents: the Google Drive integration, layout/template mapping, and the
 * tenant document store.
 *
 * The XML and spreadsheet generators are declared here but answer 501 — they
 * depend on the reporting tier, which has not been ported yet. They are listed
 * rather than hidden so nothing looks silently missing during testing.
 */

const h = require('../helpers');

const E = h.AUTH_ERRORS;
const notPorted = {
  501: h.errorResponse('Not implemented yet — the XML/spreadsheet tier is pending.'),
};

const pending = (summary, params) => h.operation({
  tag: 'Documents (pending)',
  summary,
  description: 'Declared for completeness; answers 501 until the reporting tier is ported.',
  params,
  ok: h.objectResponse('Not reached yet.'),
  errors: E,
  extraResponses: notPorted,
});

module.exports = {
  '/documents/auth_token': {
    get: h.operation({
      tag: 'Documents',
      summary: 'Exchange a Google OAuth code for tokens',
      params: [h.queryParam('code', 'The OAuth authorisation code.')],
      ok: h.objectResponse('The stored Google credentials.'),
      errors: E,
    }),
  },
  '/documents/profile': {
    get: h.operation({
      tag: 'Documents',
      summary: 'The linked Google account',
      ok: h.objectResponse('Profile, or an empty object when no account is linked.'),
      errors: E,
    }),
  },
  '/documents/drive': {
    get: h.operation({
      tag: 'Documents',
      summary: 'List Drive files visible to the linked account',
      params: [h.queryParam('folder', 'Restrict to one folder id.')],
      ok: h.listResponse('Drive files.'),
      errors: E,
    }),
  },
  '/documents/layout': {
    get: h.operation({
      tag: 'Documents',
      summary: 'Report layouts',
      ok: h.listResponse('Layouts.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Documents',
      summary: 'Attach a template to layouts',
      body: h.jsonBody({
        type: 'object',
        properties: {
          template_id: { type: 'integer' },
          layouts: h.jsonArrayField('Layout ids.', '[1,15]'),
        },
      }),
      ok: h.objectResponse('Attached.'),
      errors: E,
    }),
    delete: h.operation({
      tag: 'Documents',
      summary: 'Detach a template from layouts',
      params: [
        h.queryParam('template_id', 'Template id.', { type: 'integer' }),
        h.jsonArrayQuery('layouts', 'Layout ids.', '[1]'),
      ],
      ok: h.objectResponse('Detached.'),
      errors: E,
    }),
  },
  '/documents/layout/{layout_id}': {
    get: h.operation({
      tag: 'Documents',
      summary: 'Templates attached to one layout',
      params: [h.numericPathParam('layout_id', 'Layout id.')],
      ok: h.listResponse('Templates.'),
      errors: E,
    }),
  },
  '/documents/repo_folder': {
    get: h.operation({
      tag: 'Documents',
      summary: 'The configured Drive repository folder',
      ok: h.objectResponse('The folder.'),
      errors: E,
    }),
    put: h.operation({
      tag: 'Documents',
      summary: 'Set the Drive repository folder',
      body: h.jsonBody({ type: 'object', properties: { folder_id: { type: 'string' } } }),
      ok: h.objectResponse('Saved.'),
      errors: E,
    }),
  },
  '/documents/template_folder': {
    put: h.operation({
      tag: 'Documents',
      summary: 'Set the Drive template folder',
      body: h.jsonBody({ type: 'object', properties: { folder_id: { type: 'string' } } }),
      ok: h.objectResponse('Saved.'),
      errors: E,
    }),
  },
  '/documents/create_template_drive': {
    post: h.operation({
      tag: 'Documents',
      summary: 'Copy a template into the repository folder',
      body: h.jsonBody({
        type: 'object',
        properties: { template_id: { type: 'integer' }, name: { type: 'string' } },
      }),
      ok: h.objectResponse('The copied file.'),
      errors: E,
    }),
  },

  '/documents/': {
    get: h.operation({
      tag: 'Documents',
      summary: 'Documents in the tenant store',
      params: [h.queryParam('type', 'Document type filter.', { type: 'integer' })],
      ok: h.listResponse('Documents.'),
      errors: h.TENANT_ERRORS,
    }),
    post: h.operation({
      tag: 'Documents',
      summary: 'Add a document',
      description: 'Accepts a `file` attachment as multipart/form-data.',
      body: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                type: { type: 'integer' },
                file: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: h.TENANT_ERRORS,
    }),
  },
  '/documents/{document_id}': {
    put: h.operation({
      tag: 'Documents',
      summary: 'Update a document',
      params: [h.numericPathParam('document_id', 'Document id.')],
      body: h.jsonBody({
        type: 'object',
        properties: { title: { type: 'string' }, description: { type: 'string' } },
      }, false),
      ok: h.objectResponse('Updated.'),
      errors: h.TENANT_ERRORS,
      extraResponses: { 404: h.errorResponse('No such document.') },
    }),
    delete: h.operation({
      tag: 'Documents',
      summary: 'Delete a document',
      params: [h.numericPathParam('document_id', 'Document id.')],
      ok: h.objectResponse('Deleted.'),
      errors: h.TENANT_ERRORS,
      extraResponses: { 404: h.errorResponse('No such document.') },
    }),
  },

  /* ------------------------------------------------- not ported yet (501) */
  '/documents/downloadXML': { post: pending('Export the selection as XML') },
  '/documents/fixed_transaction_address/downloadXML': {
    post: pending('Export address corrections as XML'),
  },
  '/documents/fixed_transaction_name/downloadXML': {
    post: pending('Export name corrections as XML'),
  },
  '/documents/create_maintainence_file': { post: pending('Generate the maintenance-fee file') },
  '/documents/product_sheet': { post: pending('Generate the product spreadsheet') },
  '/documents/sheet': { post: pending('Generate a spreadsheet') },
  '/documents/sheet/{type}': {
    put: pending('Update a generated spreadsheet', [h.pathParam('type', 'Sheet type.')]),
  },
  '/documents/sheet/{type}/url': {
    post: pending('Get the URL of a generated spreadsheet', [h.pathParam('type', 'Sheet type.')]),
  },
  '/documents/sheet/{type}/{asset}': {
    post: pending('Generate a spreadsheet for one asset', [
      h.pathParam('type', 'Sheet type.'),
      h.pathParam('asset', 'Asset number.'),
    ]),
  },
  '/documents/transaction': { post: pending('Generate a transaction document') },
};
