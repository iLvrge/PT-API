'use strict';

// The two public patent APIs: USPTO PTAB and PatentsView citations.

const h = require('../helpers');

const E = h.AUTH_ERRORS;
const counterParam = h.queryParam(
  'counter',
  'Present at all: return just the tally as text/plain, for a dashboard tile.',
  { type: 'string' }
);

module.exports = {
  '/ptab/{asset}': {
    get: h.operation({
      tag: 'External APIs',
      summary: 'PTAB proceedings for an application',
      description:
        'A leading "US" is stripped before the lookup. Degrades to an empty list when the USPTO '
        + 'is unreachable, rather than failing the page.',
      params: [
        h.pathParam('asset', 'Application number, with or without a US prefix.', {
          type: 'string', example: '16123456',
        }),
        counterParam,
      ],
      ok: h.listResponse('Proceedings as timeline events.'),
      errors: E,
    }),
  },
  '/ptab/document/{identifier}': {
    get: h.operation({
      tag: 'External APIs',
      summary: 'Download one PTAB document',
      description:
        'This route was unauthenticated in the legacy app, making the API an open proxy to the '
        + 'USPTO document store. It requires a token here.',
      params: [h.pathParam('identifier', 'PTAB document identifier.')],
      ok: {
        description: 'The document bytes.',
        content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
      },
      errors: E,
      extraResponses: { 404: h.errorResponse('That document is not available.') },
    }),
  },
  '/citation/{asset}': {
    get: h.operation({
      tag: 'External APIs',
      summary: 'Patents citing one patent',
      description:
        'Queries PatentsView, then caches the assignees and citing links locally so the next '
        + 'lookup for this asset does not need the API. Needs PATENTS_VIEW_API_KEYS to be set.',
      params: [
        h.pathParam('asset', 'Granted patent number.', { type: 'string', example: '9446259' }),
        counterParam,
      ],
      ok: h.listResponse('Citing patents as timeline events.'),
      errors: E,
    }),
  },
  '/citation': {
    post: h.operation({
      tag: 'External APIs',
      summary: 'Companies citing a whole portfolio selection',
      description:
        'Resolves the selection to grant numbers first — from db_new_application.assets for '
        + 'layouts up to 15, from the precomputed dashboard metrics above that — then reads the '
        + 'cached citing companies. Supplying a `list` whose length equals `total` skips the '
        + 'resolution and uses it directly.',
      body: h.formBody({
        list: h.jsonArrayField('Application numbers already known to the caller.', '[]'),
        total: { type: 'integer', description: 'Total assets in the selection.' },
        type: { type: 'string', example: 'acquired', description: 'Layout name.' },
        selectedCompanies: h.jsonArrayField('Representative ids.'),
        tabs: h.jsonArrayField('Activity tab ids.', '[]'),
        customers: h.jsonArrayField('Counterparty ids.', '[]'),
        assignments: h.jsonArrayField('Transaction ids.', '[]'),
        other_mode: { type: 'string', enum: ['true'], description: 'Read the for-sale list instead.' },
        start: { type: 'string', format: 'date', description: 'Restrict citations to this window.' },
        end: { type: 'string', format: 'date' },
        counter: { type: 'string', enum: ['1'], description: '1 returns just the tally, uncapped.' },
      }),
      ok: h.listResponse('Citing companies, capped at 500 unless counter=1.'),
      errors: E,
    }),
  },
};
