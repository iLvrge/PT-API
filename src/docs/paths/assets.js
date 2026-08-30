'use strict';

// Assets: the portfolio's patents and applications, and their CPC breakdown.

const h = require('../helpers');

const E = h.AUTH_ERRORS;
const T = h.TENANT_ERRORS;

const selection = {
  list: h.jsonArrayField('Application numbers already known to the caller.', '[]'),
  total: { type: 'integer', description: 'Total assets in the selection; a list of this length is used as-is.' },
  type: { type: 'string', example: 'acquired', description: 'Layout name.' },
  selectedCompanies: h.jsonArrayField('Representative ids.'),
  tabs: h.jsonArrayField('Activity tab ids.', '[]'),
  customers: h.jsonArrayField('Counterparty ids.', '[]'),
  assignments: h.jsonArrayField('Transaction ids.', '[]'),
  scope: h.jsonArrayField('Restrict to these CPC codes.', '[]'),
  year: h.jsonArrayField('Restrict to these filing years.', '[]'),
  range: {
    type: 'integer', enum: [1, 2, 3, 4, 5], default: 3,
    description: 'CPC granularity: 5 section, 4 section+class, 3 sub-class, 2 main group, 1 sub group.',
  },
  data_type: { type: 'integer', enum: [0, 1] },
  other_mode: { type: 'string', enum: ['true'], description: 'Read the for-sale list instead.' },
};

const pending = (summary, tag) => h.operation({
  tag,
  summary,
  description: 'Declared for completeness; answers 501 until that tier is ported.',
  ok: h.objectResponse('Not reached yet.'),
  errors: E,
  extraResponses: { 501: h.errorResponse('Not implemented yet.') },
});

module.exports = {
  '/assets': {
    get: h.operation({
      tag: 'Assets',
      summary: 'Every tracked asset for the organisation',
      ok: h.listResponse('Assets.'),
      errors: E,
    }),
  },

  '/assets/categories_products': {
    post: h.operation({
      tag: 'Assets',
      summary: 'Filing year for a set of grant numbers',
      body: h.formBody({ list: h.jsonArrayField('Grant numbers.', '["9446259"]') }),
      ok: h.jsonResponse('Grant numbers with their filing year.', {
        type: 'object', properties: { list: { type: 'array', items: { type: 'object' } } },
      }),
      errors: T,
    }),
  },

  '/assets/cpc': {
    post: h.operation({
      tag: 'Assets',
      summary: 'CPC classification breakdown',
      description:
        'Groups the selection by filing year and CPC code. An asset\'s classification lives in '
        + 'one of three indexes depending on how far through prosecution it is, so the breakdown '
        + 'runs in two passes and unions them. Returns the rows, one group entry per distinct CPC '
        + 'code with its definition, and which of the assets are listed for sale.',
      body: h.formBody(selection),
      ok: h.jsonResponse('The breakdown.', {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'object' } },
          group: { type: 'array', items: { type: 'object' } },
          sales: { type: 'array', items: { type: 'string' } },
        },
      }),
      errors: T,
    }),
  },

  '/assets/cpc/{year}/{cpcCode}': {
    post: h.operation({
      tag: 'Assets',
      summary: 'The assets inside one breakdown cell',
      params: [
        h.pathParam('year', 'Filing year.', { type: 'string', example: '2018' }),
        h.pathParam('cpcCode', 'CPC code, at the same granularity as `range`.', {
          type: 'string', example: 'H04L',
        }),
      ],
      body: h.formBody(selection),
      ok: h.jsonResponse('The assets.', {
        type: 'object', properties: { list: { type: 'array', items: { type: 'object' } } },
      }),
      errors: T,
    }),
  },

  '/assets/{asset}': {
    get: h.operation({
      tag: 'Assets',
      summary: 'Illustration for one asset',
      params: [
        h.pathParam('asset', 'Patent or application number.'),
        h.queryParam('flag', '1 forces a patent number, 0 an application number.', { type: 'integer' }),
      ],
      ok: {
        description: 'The illustration JSON, or an empty body when unavailable.',
        content: { 'application/json': { schema: { type: 'string' } } },
      },
      errors: E,
    }),
  },

  '/assets/{patentNumber}/{type}/outsource': {
    get: h.operation({
      tag: 'Assets',
      summary: 'Link into USPTO Assignment Center',
      description:
        'This route had no authentication at all in the legacy app — its middleware array was '
        + 'empty. It requires a token here.',
      params: [
        h.pathParam('patentNumber', 'Asset number, or a transaction id when type is 0.'),
        h.pathParam('type', '1 for an asset, 0 for a recorded transaction.', {
          type: 'string', enum: ['0', '1'],
        }),
        h.queryParam('flag', '1 patent number, 0 application number.', { type: 'integer' }),
      ],
      ok: h.jsonResponse('The link, or an empty body when nothing matched.', {
        type: 'object', properties: { url: { type: 'string' } },
      }),
      errors: E,
    }),
  },

  '/assets/download/{itemID}': {
    get: h.operation({
      tag: 'Assets',
      summary: 'Where a recorded assignment PDF lives',
      description:
        'Returns the CDN copy when we mirrored the document, otherwise the USPTO link. The legacy '
        + 'route downloaded the PDF onto the API server first; this only resolves the location.',
      params: [h.numericPathParam('itemID', 'Transaction (reel-frame) id.')],
      ok: h.jsonResponse('The link.', {
        type: 'object', properties: { link: { type: 'string' } },
      }),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such transaction.') },
    }),
  },

  '/assets/move': {
    post: h.operation({
      tag: 'Assets',
      summary: 'Move assets between layouts',
      description:
        'A move writes two rows per asset: arriving in the new layout, and leaving the old one. '
        + 'Category 0 means "stay put" and writes one. The returned ids are what /assets/rollback '
        + 'takes.',
      body: h.formBody({
        moved_assets: {
          type: 'string',
          description: 'JSON array of { grant_doc_num, appno_doc_num, currentLayout, move_category }.',
          example: '[{"grant_doc_num":"9446259","appno_doc_num":"13456789","currentLayout":15,"move_category":30}]',
        },
      }),
      ok: h.listResponse('The created transfer ids.'),
      errors: E,
    }),
  },

  '/assets/rollback': {
    delete: h.operation({
      tag: 'Assets',
      summary: 'Undo a move',
      params: [h.jsonArrayQuery('revert', 'Transfer ids from /assets/move.', '[1,2]')],
      ok: h.jsonResponse('Whether anything was removed.', {
        type: 'object', properties: { deleted: { type: 'boolean' } },
      }),
      errors: E,
    }),
  },

  '/assets/validate': {
    post: h.operation({
      tag: 'Assets',
      summary: 'Which of these asset numbers we do not recognise',
      description:
        'Strips a US prefix, a kind code (A1, B2) and punctuation before checking, and reports '
        + 'back the numbers as the caller sent them.',
      body: h.formBody({
        foreign_assets: h.jsonArrayField('Asset numbers to check.', '["US9,446,259 B2"]'),
      }),
      ok: h.listResponse('The unrecognised numbers.', { type: 'string' }),
      errors: E,
    }),
  },

  '/assets/assets_for_sale': {
    post: h.operation({
      tag: 'Assets',
      summary: 'List an asset for sale',
      body: h.formBody({
        appno_doc_num: { type: 'string' },
        grant_doc_num: { type: 'string' },
        type: { type: 'integer' },
      }),
      ok: h.jsonResponse('Listed.', {
        type: 'object', properties: { message: { type: 'string' } },
      }),
      errors: T,
    }),
  },

  /* ------------------------------------------------- not ported yet (501) */
  '/assets/{patentNumber}/files/{channelID}/slack/{token}': {
    get: h.operation({
      tag: 'Assets (pending)',
      summary: 'Share an asset\'s files to Slack',
      description: 'Declared for completeness; answers 501 until the messaging tier is ported.',
      params: [
        h.pathParam('patentNumber', 'Asset number.'),
        h.pathParam('channelID', 'Slack channel id.'),
        h.pathParam('token', 'Slack token.'),
      ],
      ok: h.objectResponse('Not reached yet.'),
      errors: E,
      extraResponses: { 501: h.errorResponse('Not implemented yet.') },
    }),
  },
  '/assets/external_assets': {
    post: pending('Add external assets to the sheet', 'Assets (pending)'),
    put: pending('Append external assets to the sheet', 'Assets (pending)'),
    patch: pending('Update an external asset in the sheet', 'Assets (pending)'),
    delete: pending('Remove external assets from the sheet', 'Assets (pending)'),
  },
  '/assets/external_assets/sheets': {
    post: pending('Create the external assets sheet', 'Assets (pending)'),
  },
  '/assets/external_assets/sheets/assets': {
    post: pending('Read the external assets sheet', 'Assets (pending)'),
  },
  '/assets/external_assets/sheets/timeline': {
    post: pending('Read the external assets timeline sheet', 'Assets (pending)'),
  },
};
