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
      summary: "Correspondents on a customer's transactions",
      description:
        '`id` is the CUSTOMER, not a transaction. One row per distinct name and address, which is '
        + 'what the console\'s Correspondence column lists. An earlier version read `id` as an '
        + 'rf_id and answered 404 for every customer.',
      params: [h.numericPathParam('id', 'Organisation id.'), h.jsonArrayQuery('portfolios', 'Company ids to scope to; omit for all.', '[]')],
      ok: h.listResponse('Correspondents.'),
      errors: E,
    }),
  },
  '/admin/company/raw/assignments/{id}': {
    get: h.operation({
      tag: 'Admin assignments',
      summary: "Correspondents on a customer's transactions, with every address line",
      description:
        'As above, but returning all nine address lines for the address-cleaning screen, and '
        + 'including the wholly blank correspondents so they can be filled in.',
      params: [h.numericPathParam('id', 'Organisation id.'), h.jsonArrayQuery('portfolios', 'Company ids to scope to; omit for all.', '[]')],
      ok: h.listResponse('Correspondents.'),
      errors: E,
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
    put: h.operation({
      tag: 'Admin cited',
      summary: 'Attach cited assignees to an organisation',
      description:
        'The legacy handler declared its result `const` and then assigned to it, so it threw on '
        + 'every successful call; the throw was swallowed by an empty catch and no response was '
        + 'ever sent, leaving the request open until the client gave up.',
      params: [h.numericPathParam('id', 'Organisation id.')],
      body: h.formBody({
        type: 'object',
        required: ['assignee_id', 'organisation_id'],
        properties: {
          assignee_id: h.jsonArrayField('Assignee ids.', '[1,2]'),
          organisation_id: { type: 'integer' },
        },
      }),
      ok: h.objectResponse('How many were moved.'),
      errors: E,
    }),
    get: h.operation({
      tag: 'Admin cited',
      summary: 'Cited assignee organisations for a customer',
      description:
        'Paged. Answers { citedAssignees, organizations, total_records } — the console reads those '
        + 'three keys, so this is an object and not a bare array. Scoped to the chosen portfolio, '
        + 'or to every company the customer has when none is given.',
      params: [
        h.numericPathParam('id', 'Organisation id.'),
        h.jsonArrayQuery('portfolios', 'Company ids to scope to; omit for all.', '[]'),
        h.queryParam('sort_by', 'Sortable column; anything else falls back to occurences.',
          { type: 'string', enum: ['occurences', 'assignee_organization', 'assignee_query', 'domain', 'assignee_id'] }),
        h.queryParam('sort_direction', 'ASC or DESC.', { type: 'string', enum: ['asc', 'desc'] }),
        h.queryParam('rows_per_page', 'Page size, 1-500 (default 50).', { type: 'integer' }),
        h.queryParam('current_page', 'Zero-based page number.', { type: 'integer' }),
        h.queryParam('assignee_id', 'Narrow to one assignee.', { type: 'integer' }),
      ],
      ok: h.objectResponse('citedAssignees, organizations and total_records.'),
      errors: E,
    }),
  },
  '/admin/company/owned/cited/{id}': {
    get: h.operation({
      tag: 'Admin cited',
      summary: 'Cited assignee organisations (alias)',
      params: [
        h.numericPathParam('id', 'Organisation id.'),
        h.jsonArrayQuery('portfolios', 'Company ids to scope to; omit for all.', '[]'),
        h.queryParam('sort_by', 'Sortable column; anything else falls back to occurences.',
          { type: 'string', enum: ['occurences', 'assignee_organization', 'assignee_query', 'domain', 'assignee_id'] }),
        h.queryParam('sort_direction', 'ASC or DESC.', { type: 'string', enum: ['asc', 'desc'] }),
        h.queryParam('rows_per_page', 'Page size, 1-500 (default 50).', { type: 'integer' }),
        h.queryParam('current_page', 'Zero-based page number.', { type: 'integer' }),
        h.queryParam('assignee_id', 'Narrow to one assignee.', { type: 'integer' }),
      ],
      ok: h.objectResponse('citedAssignees, organizations and total_records.'),
      errors: E,
    }),
  },
  '/admin/company/parties/{id}': {
    get: h.operation({
      tag: 'Admin cited',
      summary: 'Parties on a customer\'s transactions',
      description:
        'Every party on the customer\'s transactions except those already recorded as inventors — '
        + 'the grid lists companies, not people. Names not seen before are recorded so a logo can '
        + 'be attached to them later. Answers { list, total_records }.',
      params: [
        h.numericPathParam('id', 'Organisation id.'),
        h.jsonArrayQuery('portfolios', 'Company ids to scope to; omit for all.', '[]'),
        h.queryParam('sort_by', 'Sortable column; anything else falls back to occurences.',
          { type: 'string', enum: ['occurences', 'assignee_organization', 'assignee_query', 'domain', 'assignee_id'] }),
        h.queryParam('sort_direction', 'ASC or DESC.', { type: 'string', enum: ['asc', 'desc'] }),
        h.queryParam('rows_per_page', 'Page size, 1-500 (default 50).', { type: 'integer' }),
        h.queryParam('current_page', 'Zero-based page number.', { type: 'integer' }),
        h.queryParam('assignee_id', 'Narrow to one assignee.', { type: 'integer' }),
      ],
      ok: h.objectResponse('list and total_records.'),
      errors: E,
    }),
  },
  '/admin/company/parties/all/{id}': {
    get: h.operation({
      tag: 'Admin cited',
      summary: 'Parties on a customer\'s transactions (alias)',
      params: [
        h.numericPathParam('id', 'Organisation id.'),
        h.jsonArrayQuery('portfolios', 'Company ids to scope to; omit for all.', '[]'),
        h.queryParam('sort_by', 'Sortable column; anything else falls back to occurences.',
          { type: 'string', enum: ['occurences', 'assignee_organization', 'assignee_query', 'domain', 'assignee_id'] }),
        h.queryParam('sort_direction', 'ASC or DESC.', { type: 'string', enum: ['asc', 'desc'] }),
        h.queryParam('rows_per_page', 'Page size, 1-500 (default 50).', { type: 'integer' }),
        h.queryParam('current_page', 'Zero-based page number.', { type: 'integer' }),
        h.queryParam('assignee_id', 'Narrow to one assignee.', { type: 'integer' }),
      ],
      ok: h.objectResponse('list and total_records.'),
      errors: E,
    }),
  },
  '/admin/company/saved_logo/parties/all/{id}': {
    get: h.operation({
      tag: 'Admin cited',
      summary: 'Parties, showing the logos this customer saved',
      description:
        'Same list, but the logo column comes from the customer\'s own saved logos rather than the '
        + 'shared ones. This view never records new names.',
      params: [
        h.numericPathParam('id', 'Organisation id.'),
        h.jsonArrayQuery('portfolios', 'Company ids to scope to; omit for all.', '[]'),
        h.queryParam('sort_by', 'Sortable column; anything else falls back to occurences.',
          { type: 'string', enum: ['occurences', 'assignee_organization', 'assignee_query', 'domain', 'assignee_id'] }),
        h.queryParam('sort_direction', 'ASC or DESC.', { type: 'string', enum: ['asc', 'desc'] }),
        h.queryParam('rows_per_page', 'Page size, 1-500 (default 50).', { type: 'integer' }),
        h.queryParam('current_page', 'Zero-based page number.', { type: 'integer' }),
        h.queryParam('assignee_id', 'Narrow to one assignee.', { type: 'integer' }),
      ],
      ok: h.objectResponse('list and total_records.'),
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
  '/admin/company/report': {
    get: h.operation({
      tag: 'Admin reports',
      summary: 'The corpus-wide company report',
      description:
        'Pre-aggregated by the nightly pipeline into admin_representative_reports. `product` is '
        + 'parties minus transactions; `tranaction_assets` (spelling kept from the client) is the '
        + 'transactions-per-asset ratio.',
      ok: h.listResponse('One row per company.'),
      errors: E,
    }),
  },
  '/admin/company/lender': {
    get: h.operation({
      tag: 'Admin search',
      summary: 'Search lenders by name',
      description:
        'A lender is a party on a security-interest transaction: either the conveyance is typed '
        + 'security/restatedsecurity, or it is untyped and the conveyance text says SECURITY '
        + 'INTEREST. An empty search returns [] rather than scanning the corpus.',
      params: [h.queryParam('search', 'Full-text search term.', { type: 'string' })],
      ok: h.listResponse('Matching lenders, most frequent first.'),
      errors: E,
    }),
  },
  '/admin/company/{id}/companies': {
    get: h.operation({
      tag: 'Admin normalise',
      summary: 'Other spellings that normalise onto the same company',
      description: 'Drives the console\'s "Normalised Companies" list.',
      params: [h.numericPathParam('id', 'assignor_and_assignee id.')],
      ok: h.listResponse('Candidate spellings, most frequent first.'),
      errors: E,
    }),
  },
  '/admin/company/law_firms/{id}/normalize_lawfirms': {
    get: h.operation({
      tag: 'Admin law firms',
      summary: 'Other spellings that normalise onto the same law firm',
      params: [h.numericPathParam('id', 'Law firm id.')],
      ok: h.listResponse('Candidate spellings.'),
      errors: E,
    }),
  },
  '/admin/company/family/{id}': {
    get: h.operation({
      tag: 'Admin jobs',
      summary: 'Rebuild a customer\'s asset families',
      description:
        'Queues assets_family.php and answers 202 straight away — the rebuild takes minutes and '
        + 'the console polls the family log for progress.',
      params: [
        h.numericPathParam('id', 'Organisation id.'),
        h.queryParam('retrievedAll', 'Rebuild everything rather than only what is missing.',
          { type: 'string' }),
      ],
      ok: h.jsonResponse('The job was started.', {
        type: 'object', properties: { message: { type: 'string' } },
      }),
      status: 202,
      errors: E,
    }),
  },
  '/admin/company/family/{id}/{representativeID}': {
    get: h.operation({
      tag: 'Admin jobs',
      summary: 'Rebuild asset families for chosen companies',
      params: [
        h.numericPathParam('id', 'Organisation id.'),
        h.pathParam('representativeID', 'JSON array of company ids, e.g. [1,2].'),
        h.queryParam('retrievedAll', 'Rebuild everything rather than only what is missing.',
          { type: 'string' }),
      ],
      ok: h.jsonResponse('The job was started.', {
        type: 'object', properties: { message: { type: 'string' } },
      }),
      status: 202,
      errors: E,
    }),
  },
  '/admin/company/transactions/{id}': {
    get: h.operation({
      tag: 'Admin assignments',
      summary: 'The conveyance-text grid for a customer',
      description:
        'Every recorded transaction touching the customer\'s assets. `convey_ty` is what the USPTO '
        + 'recorded and `updated_convey_ty` what a reviewer has since corrected it to. The response '
        + 'also carries the filter options and the name-to-number map the console posts back with, '
        + 'so it answers { list, conveyance, update_conveyance, type, assignment_type }. '
        + 'Passing id 0 with ?search= runs a free-text search over conveyance text instead.',
      params: [
        h.numericPathParam('id', 'Organisation id, or 0 with ?search=.'),
        h.jsonArrayQuery('portfolios', 'Company ids to scope to; omit for all.', '[]'),
        h.queryParam('search', 'Free-text search, only when id is 0.', { type: 'string' }),
      ],
      ok: h.objectResponse('The grid rows and its option lists.'),
      errors: E,
    }),
  },
  '/admin/company/transactions/{id}/{representativeID}': {
    get: h.operation({
      tag: 'Admin assignments',
      summary: 'The conveyance-text grid, scoped to chosen companies',
      params: [
        h.numericPathParam('id', 'Organisation id.'),
        h.pathParam('representativeID', 'JSON array of company ids, e.g. [55].'),
      ],
      ok: h.objectResponse('The grid rows and its option lists.'),
      errors: E,
    }),
  },
  '/admin/company/transactions/{customerID}': {
    put: h.operation({
      tag: 'Admin assignments',
      summary: 'Retype one transaction',
      description:
        'Writes to representative_assignment_conveyance, which overlays the USPTO typing rather '
        + 'than replacing it. Only a conveyance type in the fixed set is accepted.',
      params: [h.numericPathParam('customerID', 'Organisation id.')],
      body: h.formBody({
        type: 'object',
        required: ['rf_id', 'convey_ty'],
        properties: {
          rf_id: { type: 'integer' },
          convey_ty: { type: 'string', example: 'security' },
        },
      }),
      ok: h.objectResponse('What was written.'),
      errors: E,
    }),
  },
  '/admin/company/lenders/{id}/companies': {
    get: h.operation({
      tag: 'Admin search',
      summary: 'Companies a lender has lent to',
      description:
        'A lender reaches a company through a security-interest assignment. `id` is a JSON array '
        + 'of assignor_and_assignee ids.',
      params: [h.pathParam('id', 'JSON array of lender ids, e.g. [123].')],
      ok: h.listResponse('Companies, most frequent first.'),
      errors: E,
    }),
  },
  '/admin/company/{id}/company_selection': {
    put: h.operation({
      tag: 'Admin customers',
      summary: "Turn a customer's companies on or off",
      description:
        'Writes `status` on the chosen companies inside that customer\'s own database. An empty '
        + 'list is refused rather than updating every company.',
      params: [h.numericPathParam('id', 'Organisation id.')],
      body: h.formBody({
        type: 'object',
        required: ['representative_id', 'status'],
        properties: {
          representative_id: h.jsonArrayField('Company ids.', '[1,2]'),
          status: { type: 'integer', enum: [0, 1] },
        },
      }),
      ok: h.objectResponse('How many rows were updated.'),
      errors: { ...E, 503: h.errorResponse('Organisation database is unavailable.') },
    }),
  },
  '/admin/company/auth_token': {
    get: h.operation({
      tag: 'Admin cited',
      summary: 'Exchange a Google OAuth code for tokens',
      description:
        'Used by the cited-assignee spreadsheet export, which writes to a Google Sheet on the '
        + 'operator\'s behalf. The tokens are returned to the caller and never stored here. A code '
        + 'Google rejects answers 400, not 500.',
      params: [h.queryParam('code', 'The OAuth authorisation code.', { type: 'string' })],
      ok: h.objectResponse('The Google token set.'),
      errors: E,
      extraResponses: { 400: h.errorResponse('Missing code, or Google rejected it.') },
    }),
  },
};
