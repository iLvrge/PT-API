'use strict';

/**
 * The admin console's company-search and normalisation surface.
 *
 * "Normalising" means pointing many recorded spellings of a company at one
 * canonical record, so the rest of the product treats them as the same entity.
 * The same pattern applies to law firms and lawyers, each with its own
 * canonical table.
 */

const h = require('../helpers');

const E = { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') };
const entityParam = h.numericPathParam('ID', 'Party (assignor/assignee) id.');
const idParam = h.numericPathParam('id', 'Record id.');

const search = (summary, description, params) => ({
  get: h.operation({ tag: 'Admin search', summary, description, params, ok: h.listResponse('Matches.'), errors: E }),
});

module.exports = {
  '/admin/company/request': {
    get: h.operation({
      tag: 'Admin search',
      summary: 'Customer requests to add a company',
      description:
        'Three kinds union together: requests pointed at a corpus company, at another customer '
        + 'account, and still unassigned.',
      ok: h.listResponse('Requests, newest first.'),
      errors: E,
    }),
    put: h.operation({
      tag: 'Admin search',
      summary: 'Resolve a batch of requests',
      description: 'type 0 points them at a corpus company, anything else at a customer account.',
      body: h.jsonBody({
        type: 'object',
        required: ['company_ids', 'representative_id'],
        properties: {
          company_ids: h.jsonArrayField('Request ids.', '[1,2]'),
          representative_id: { type: 'integer' },
          type: { type: 'integer', enum: [0, 1] },
        },
      }),
      ok: h.objectResponse('How many were resolved.'),
      errors: E,
    }),
  },

  /* ------------------------------------------------------------- searching */

  '/admin/company/search/all/': {
    get: h.operation({
      tag: 'Admin search',
      summary: 'Search companies from the grid filter',
      params: [h.queryParam('filter', 'The grid filter, as JSON.', { type: 'string', example: '[{"property":"name","value":"acme"}]' })],
      ok: h.listResponse('Matching parties, most-recorded first.'),
      errors: E,
    }),
    put: h.operation({
      tag: 'Admin normalise',
      summary: 'Point a set of recorded names at one canonical company',
      description:
        'Accepts either a plain id list or the selected grid rows. A row with flag 3 came from '
        + 'PTAB, which is matched by name rather than id and updated separately.',
      body: h.jsonBody({
        type: 'object',
        required: ['normalize_name'],
        properties: {
          normalize_name: { type: 'string', example: 'Acme Inc' },
          IDs: h.jsonArrayField('Party ids.', '[1,2]'),
          selected_rows: {
            type: 'string',
            description: 'JSON array of grid rows, each with id, name and flag.',
            example: '[{"id":1,"name":"ACME INC.","flag":1}]',
          },
        },
      }),
      ok: h.objectResponse('The canonical record and how many names now point at it.'),
      errors: E,
    }),
  },

  '/admin/company/search/{search}': search(
    'Search recorded company names',
    'Each line of the term is treated as one phrase in a MySQL boolean-mode search.',
    [h.pathParam('search', 'Search term; newlines separate phrases.')]
  ),
  '/admin/company/search/address/{address}': search(
    'Search companies by recorded address', null,
    [h.pathParam('address', 'Address text.')]
  ),
  '/admin/company/search/country/{name}': search(
    'Companies recorded in one country', null,
    [h.pathParam('name', 'Country as recorded.')]
  ),
  '/admin/company/representative/search/{name}': search(
    'Search canonical company names', null, [h.pathParam('name', 'Search term.')]
  ),
  '/admin/company/account/search/{name}': search(
    'Search customer accounts by name', null, [h.pathParam('name', 'Search term.')]
  ),

  /* ------------------------------------------------------------- addresses */

  '/admin/lawfirm/{ID}/search/address': {
    get: h.operation({
      tag: 'Admin search',
      summary: "A law firm's recorded addresses",
      params: [h.numericPathParam('ID', 'Law firm id.')],
      ok: h.listResponse('Addresses, most-used first.'),
      errors: E,
    }),
  },
  '/admin/lawfirm/{ID}/search/address/all': {
    post: h.operation({
      tag: 'Admin search',
      summary: 'Find law firms at a set of addresses',
      params: [h.numericPathParam('ID', 'Law firm id, for context.')],
      body: h.formBody({ 'address[]': { type: 'string', description: 'Repeatable address field.' } }),
      ok: h.listResponse('Matching law firms.'),
      errors: E,
    }),
  },
  '/admin/company/{ID}/search/address/{type}': {
    get: h.operation({
      tag: 'Admin search',
      summary: "A party's recorded addresses",
      params: [
        entityParam,
        h.pathParam('type', 'Party type.'),
        h.queryParam('flag', '2 reads the bibliographic applicant record instead.', { type: 'string' }),
      ],
      ok: h.listResponse('Addresses, most-used first.'),
      errors: E,
    }),
  },
  '/admin/company/{ID}/search/address/all/{type}': {
    post: h.operation({
      tag: 'Admin search',
      summary: 'Find companies at a set of addresses',
      description: 'type 1 restricts the search to security interests.',
      params: [entityParam, h.pathParam('type', 'Search type; 1 for security interests.')],
      body: h.formBody({ 'address[]': { type: 'string', description: 'Repeatable address field.' } }),
      ok: h.listResponse('Matching parties.'),
      errors: E,
    }),
  },
  '/admin/company/{ID}/search/address_with_transactions/{type}': {
    get: h.operation({
      tag: 'Admin search',
      summary: "A party's addresses, with the transaction each came from",
      params: [entityParam, h.pathParam('type', 'Party type.')],
      ok: h.listResponse('Addresses with their transactions, newest first.'),
      errors: E,
    }),
    put: h.operation({
      tag: 'Admin search',
      summary: 'Record which transaction an address was taken from',
      params: [entityParam, h.pathParam('type', 'Party type.')],
      body: h.jsonBody({
        type: 'object',
        properties: { address1: { type: 'string' }, address2: { type: 'string' } },
      }),
      ok: h.jsonResponse('The transaction, or null when the address was never used.', {
        type: 'object', nullable: true,
      }),
      errors: E,
    }),
  },

  /* ------------------------------------------------------------- law firms */

  '/admin/company/law_firms': {
    get: h.operation({
      tag: 'Admin law firms',
      summary: 'Law firms, most-recorded first',
      params: [h.queryParam('search', 'Optional name search.')],
      ok: h.listResponse('Law firms with what they normalise to.'),
      errors: E,
    }),
    put: h.operation({
      tag: 'Admin normalise',
      summary: 'Point a set of law firms at one canonical firm',
      description:
        'Selected names we have correspondence for but no law-firm row are created first, so the '
        + 'selection is not silently narrowed.',
      body: h.jsonBody({
        type: 'object',
        required: ['law_firm_ids', 'normalize_name'],
        properties: {
          law_firm_ids: h.jsonArrayField('Law firm ids.', '[1,2]'),
          names: h.jsonArrayField('Selected names, including any not yet in the corpus.', '[]'),
          normalize_name: { type: 'string' },
        },
      }),
      ok: h.objectResponse('The canonical firm and how many now point at it.'),
      errors: E,
    }),
  },
  '/admin/company/law_firms/{id}': {
    get: h.operation({
      tag: 'Admin law firms',
      summary: 'The lawyers at one firm',
      params: [idParam],
      ok: h.listResponse('Lawyers.'),
      errors: E,
    }),
  },
  '/admin/company/law_firms/{id}/companies': {
    get: h.operation({
      tag: 'Admin law firms',
      summary: 'The companies a firm has filed for',
      params: [idParam],
      ok: h.listResponse('Companies with their asset counts.'),
      errors: E,
    }),
  },
  '/admin/company/{companyID}/law_firms': {
    get: h.operation({
      tag: 'Admin law firms',
      summary: "A company's law firms",
      params: [h.numericPathParam('companyID', 'Party id.')],
      ok: h.listResponse('Law firms with their transaction counts.'),
      errors: E,
    }),
  },

  /* --------------------------------------------------------------- lawyers */

  '/admin/company/lawyers': {
    get: h.operation({
      tag: 'Admin law firms',
      summary: 'Lawyers, most-recorded first',
      params: [h.queryParam('search', 'Optional name search.')],
      ok: h.listResponse('Lawyers with what they normalise to.'),
      errors: E,
    }),
    put: h.operation({
      tag: 'Admin normalise',
      summary: 'Point a set of lawyers at one canonical lawyer',
      body: h.jsonBody({
        type: 'object',
        required: ['lawyer_ids', 'normalize_name'],
        properties: {
          lawyer_ids: h.jsonArrayField('Lawyer ids.', '[1,2]'),
          normalize_name: { type: 'string' },
        },
      }),
      ok: h.objectResponse('The canonical lawyer and how many now point at them.'),
      errors: E,
    }),
  },
  '/admin/company/lawyers/{id}': {
    get: h.operation({
      tag: 'Admin law firms',
      summary: 'The lawyers at one firm',
      params: [idParam],
      ok: h.listResponse('Lawyers.'),
      errors: E,
    }),
  },

  /* ----------------------------------------------------------- assignments */

  '/admin/company/assignments': {
    get: h.operation({
      tag: 'Admin assignments',
      summary: 'Recently recorded transactions',
      params: [h.queryParam('limit', 'Rows to return, capped at 1000.', { type: 'integer', example: 100 })],
      ok: h.listResponse('Transactions, newest first.'),
      errors: E,
    }),
    put: h.operation({
      tag: 'Admin assignments',
      summary: 'Correct the correspondent on a transaction',
      description: 'Only the correspondent name and address columns can be changed.',
      body: h.jsonBody({
        type: 'object',
        required: ['rf_id'],
        properties: {
          rf_id: { type: 'integer' },
          cname: { type: 'string' },
          caddress_1: { type: 'string' },
          caddress_2: { type: 'string' },
          caddress_3: { type: 'string' },
          caddress_4: { type: 'string' },
          caddress_5: { type: 'string' },
          caddress_6: { type: 'string' },
          caddress_7: { type: 'string' },
        },
      }),
      ok: h.objectResponse('Which columns were changed.'),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such transaction.') },
    }),
  },
  '/admin/company/assignments/{id}': {
    get: h.operation({
      tag: 'Admin assignments',
      summary: 'One transaction as recorded',
      params: [idParam],
      ok: h.objectResponse('The transaction and its correspondent.'),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such transaction.') },
    }),
  },
  '/admin/company/raw/assignments/{id}': {
    get: h.operation({
      tag: 'Admin assignments',
      summary: 'One transaction as recorded (alias)',
      params: [idParam],
      ok: h.objectResponse('The transaction and its correspondent.'),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such transaction.') },
    }),
    put: h.operation({
      tag: 'Admin assignments',
      summary: 'Correct one transaction',
      params: [idParam],
      body: h.jsonBody({ type: 'object', properties: { cname: { type: 'string' } } }),
      ok: h.objectResponse('Which columns were changed.'),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such transaction.') },
    }),
  },
  '/admin/company/recent_transactions': {
    get: h.operation({
      tag: 'Admin assignments',
      summary: 'Recently recorded transactions',
      params: [h.queryParam('limit', 'Rows to return, capped at 1000.', { type: 'integer' })],
      ok: h.listResponse('Transactions, newest first.'),
      errors: E,
    }),
  },
  '/admin/all/transactions/{conveyanceType}': {
    get: h.operation({
      tag: 'Admin assignments',
      summary: 'Transactions of one conveyance type',
      params: [h.pathParam('conveyanceType', 'Conveyance type.', { type: 'string', example: 'security' })],
      ok: h.listResponse('Transactions, newest first, capped at 1000.'),
      errors: E,
    }),
  },

  /* ---------------------------------------------------------------- assets */

  '/admin/company/assets/{entityID}': {
    get: h.operation({
      tag: 'Admin search',
      summary: "A party's assets",
      params: [h.numericPathParam('entityID', 'Party id.')],
      ok: h.listResponse('Assets.'),
      errors: E,
    }),
  },
  '/admin/company/{representativeID}/event_maintainence': {
    get: h.operation({
      tag: 'Admin search',
      summary: "A company's maintenance-fee events",
      params: [h.numericPathParam('representativeID', 'Company id.')],
      ok: h.listResponse('Events.'),
      errors: E,
    }),
  },

  /* ----------------------------------------------------------------- cited */

  '/admin/company/cited/{id}': {
    get: h.operation({
      tag: 'Admin cited',
      summary: 'Cited assignee organisations for a customer',
      params: [h.numericPathParam('id', 'Organisation id.')],
      ok: h.listResponse('Assignees with their domains and logos.'),
      errors: E,
    }),
  },
  '/admin/company/owned/cited/{id}': {
    get: h.operation({
      tag: 'Admin cited',
      summary: 'Cited assignee organisations (alias)',
      params: [h.numericPathParam('id', 'Organisation id.')],
      ok: h.listResponse('Assignees.'),
      errors: E,
    }),
  },
  '/admin/company/get_counter_cited_organisations_and_logo': {
    get: h.operation({
      tag: 'Admin cited',
      summary: 'How many cited assignees have a logo',
      params: [h.queryParam('client_id', 'Organisation id; defaults to the caller.', { type: 'integer' })],
      ok: h.objectResponse('Totals.'),
      errors: E,
    }),
  },
  '/admin/company/assignees/query_name': {
    put: h.operation({
      tag: 'Admin cited',
      summary: "Correct an assignee's search name or logo set",
      description:
        'Sends `assignee_query` to change the search name, `api_logo` and friends to change the '
        + 'logo set, or `image_url` alone to change just the chosen image.',
      body: h.jsonBody({
        type: 'object',
        required: ['assignee_id'],
        properties: {
          assignee_id: { type: 'integer' },
          assignee_query: { type: 'string' },
          api_logo: { type: 'string' },
          image_url: { type: 'string' },
          without_square: { type: 'string' },
        },
      }),
      ok: h.objectResponse('Which columns were changed.'),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such assignee.') },
    }),
  },
  '/admin/company/assignees/logos': {
    put: h.operation({
      tag: 'Admin cited',
      summary: 'Clear or re-download a set of assignee logos',
      description:
        'The download is queued as a script with its argument array; the legacy version built a '
        + 'shell string from the id list (TEST_REPORT.md section 3).',
      body: h.jsonBody({
        type: 'object',
        required: ['assignee_id', 'type'],
        properties: {
          assignee_id: h.jsonArrayField('Assignee ids.', '[1,2]'),
          type: { type: 'string', enum: ['clear', 'download'] },
        },
      }),
      ok: h.objectResponse('What was started.'),
      errors: E,
    }),
  },
};
