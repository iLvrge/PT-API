'use strict';

/**
 * The admin console's customer management. Every operation here is admin-only
 * and answers 403 for a non-admin token.
 */

const h = require('../helpers');

const E = { ...h.AUTH_ERRORS, 403: h.errorResponse('Admin access required.') };
const notFound = { 404: h.errorResponse('Customer not found.') };

const orgParam = (name = 'id') => h.numericPathParam(name, 'Organisation id.');
const companiesParam = h.jsonArrayQuery('companies', 'Company ids to scope to.', '[]');

// The pipeline jobs all answer as soon as the job is queued, not when it ends.
const job = ({ summary, description, params = [], body, tag = 'Admin jobs', status = 200 }) =>
  h.operation({
    tag,
    summary,
    description,
    params,
    body,
    ok: h.jsonResponse('The job was started.', {
      type: 'object', properties: { message: { type: 'string' } },
    }),
    status,
    errors: E,
    extraResponses: notFound,
  });

module.exports = {
  '/admin/customers': {
    get: h.operation({
      tag: 'Admin customers',
      summary: 'Every customer organisation',
      ok: h.listResponse('Customers.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Admin customers',
      summary: 'Create a customer',
      description:
        'Creates the organisation, gives it a public UUID and queues provisioning of its tenant '
        + 'database. An existing organisation with the same name is returned rather than duplicated.',
      body: h.jsonBody({
        type: 'object',
        required: ['company_name'],
        properties: {
          company_name: { type: 'string', example: 'Acme Inc' },
          organisation_type: { type: 'integer' },
        },
      }),
      ok: h.objectResponse('The customer.'),
      status: 201,
      errors: E,
    }),
    put: h.operation({
      tag: 'Admin customers',
      summary: 'Rename a customer or change its subscription',
      body: h.jsonBody({
        type: 'object',
        required: ['organisation_id', 'company_name'],
        properties: {
          organisation_id: { type: 'integer' },
          company_name: { type: 'string' },
          organisation_type: { type: 'integer' },
          subscribtion: { type: 'integer', description: 'Spelling kept from the existing client.' },
        },
      }),
      ok: h.objectResponse('The updated customer.'),
      errors: E,
      extraResponses: notFound,
    }),
  },

  '/admin/customers/reports': {
    get: h.operation({
      tag: 'Admin customers',
      summary: 'Dashboard totals for many customers at once',
      description:
        'Two queries instead of one request per customer. The console currently asks per row, '
        + 'which is 331 requests on a full dashboard load against a default global rate limit of '
        + '300 per fifteen minutes — the last rows answer 429 and render as zeros. Customers with '
        + 'no summary row are omitted rather than returned as zeros, so the caller can tell '
        + '"not computed yet" from "computed as zero".',
      params: [h.jsonArrayQuery('ids', 'Organisation ids.', '[68,146]')],
      ok: h.objectResponse('Totals keyed by organisation id.'),
      errors: E,
    }),
  },
  /*
   * GET and DELETE were two path entries differing only in what the parameter
   * was called — the same URL described twice, which is not a valid OpenAPI
   * document and made a generated client carry two methods for one endpoint.
   */
  '/admin/customers/{id}': {
    get: h.operation({
      tag: 'Admin customers',
      summary: 'One customer',
      params: [orgParam()],
      ok: h.objectResponse('The customer, with its public UUID.'),
      errors: E,
      extraResponses: notFound,
    }),
    delete: h.operation({
      tag: 'Admin customers',
      summary: 'Delete a customer that was never provisioned',
      description:
        'Refuses once the customer has a tenant database, since that would orphan it. The legacy '
        + 'version deleted on a column the table does not have, inside a transaction it never '
        + 'closed.',
      params: [orgParam()],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: {
        ...notFound,
        403: h.errorResponse('Admin access required, or the customer has a database.'),
      },
    }),
  },

  '/admin/customers/{id}/logo': {
    put: h.operation({
      tag: 'Admin customers',
      summary: "Set a customer's logo",
      description: 'Takes a base64 data URL and stores the decoded image.',
      params: [orgParam()],
      body: h.jsonBody({
        type: 'object',
        required: ['url_customer_logo'],
        properties: {
          url_customer_logo: {
            type: 'string',
            example: 'data:image/png;base64,iVBORw0KGgo...',
          },
        },
      }),
      ok: h.jsonResponse('The stored URL.', {
        type: 'object', properties: { logo: { type: 'string' } },
      }),
      errors: E,
      extraResponses: notFound,
    }),
  },

  '/admin/customers/{organisation_id}/buttons': {
    get: h.operation({
      tag: 'Admin customers',
      summary: 'The console switches for a customer',
      params: [orgParam('organisation_id')],
      ok: h.listResponse('Switches.'),
      errors: E,
    }),
    put: h.operation({
      tag: 'Admin customers',
      summary: 'Turn a console switch on or off',
      params: [orgParam('organisation_id')],
      body: h.jsonBody({
        type: 'object',
        required: ['button_id', 'status'],
        properties: { button_id: { type: 'integer' }, status: { type: 'integer', enum: [0, 1] } },
      }),
      ok: h.objectResponse('The switch.'),
      errors: E,
    }),
  },

  /* -------------------------------------------------------------- reports */

  '/admin/customers/run_query/{representative_name}/{query_no}': {
    get: h.operation({
      tag: 'Admin reports',
      summary: 'Run one of the fixed asset reports',
      description:
        'The report number selects both the table and the column from a fixed map, so nothing '
        + 'the caller sends reaches the SQL as an identifier. 1 parties, 2 transactions, '
        + '3/6/7 assets by layout, 4 and 5 the pre-built tables.',
      params: [
        h.pathParam('representative_name', 'Company name as recorded.'),
        h.numericPathParam('query_no', 'Report number, 1-7.'),
        h.queryParam('company_id', 'Company id.', { type: 'integer' }),
        h.queryParam('organisation_id', 'Organisation id.', { type: 'integer' }),
      ],
      ok: h.listResponse('The report rows.'),
      errors: E,
    }),
  },

  /* ---------------------------------------------------------------- logs */

  '/admin/customers/{id}/run_update_log': {
    get: h.operation({
      tag: 'Admin logs',
      summary: 'The update log for a customer',
      params: [orgParam(), companiesParam],
      ok: h.listResponse('Log entries, newest first.'),
      errors: E,
    }),
    delete: h.operation({
      tag: 'Admin logs',
      summary: 'Clear the update log',
      params: [orgParam(), companiesParam],
      ok: h.objectResponse('Cleared.'),
      errors: E,
    }),
  },
  '/admin/customers/{id}/flag_update_manually': {
    put: job({
      tag: 'Admin jobs',
      summary: 'Flag parties as employee-inventors by hand',
      description:
        'Setting the flag also retypes the conveyance to `employee` — an assignment from a named '
        + 'individual to their employer is an employment transfer, not a sale. Clearing it leaves '
        + 'the conveyance alone, since the original type is not recoverable. An empty list is '
        + 'refused rather than running an unbounded UPDATE.',
      params: [orgParam()],
      // formBody takes (properties, required) and wraps them itself. Passing a
      // whole schema here produced properties.properties.inventors — a body
      // schema that documented two fields called `type` and `properties`.
      body: h.formBody(
        {
          inventors: h.jsonArrayField('assignor_and_assignee ids.', '[1,2]'),
          flag: { type: 'integer', enum: [0, 1] },
        },
        ['inventors', 'flag']
      ),
    }),
  },
  '/admin/customers/{organisation_id}/{representative_id}/find_inventor': {
    get: job({
      summary: 'Search for assignments with a missing inventor',
      description:
        'The same job as /missing_inventor, under the path the admin console calls. Answers '
        + '"Already in process." rather than starting a second run.',
      params: [
        orgParam('organisation_id'),
        h.numericPathParam('representative_id', 'Company id.'),
      ],
    }),
  },
  '/admin/patents/{asset}': {
    get: h.operation({
      tag: 'Admin reports',
      summary: 'Illustration JSON for one asset',
      description:
        'The number is checked against documentid first, so an unknown one answers 400 rather '
        + 'than waiting on the pipeline. The pipeline itself degrades to an empty body when it '
        + 'cannot produce anything, which is what the console expects.',
      params: [
        h.pathParam('asset', 'Grant or application number.'),
        h.queryParam('flag', '1 grant only, 0 application only; omit for either.',
          { type: 'integer', enum: [0, 1] }),
      ],
      ok: h.textResponse('The illustration JSON, or an empty body.'),
      errors: E,
      extraResponses: { 400: h.errorResponse('Invalid number.') },
    }),
  },
  '/admin/customers/{id}/reports': {
    get: h.operation({
      tag: 'Admin customers',
      summary: 'Dashboard totals for one customer',
      description:
        'The pre-aggregated figures the console shows on each customer row, plus share_url when a '
        + 'share link has been issued. A customer with no tenant database, or with no companies '
        + 'yet, answers {} rather than an error — the console lists provisioned and unprovisioned '
        + 'customers side by side.',
      params: [orgParam()],
      ok: h.objectResponse('The totals, or {} when nothing has been computed yet.'),
      errors: E,
    }),
  },
  '/admin/customers/{id}/companies': {
    get: h.operation({
      tag: 'Admin customers',
      summary: 'The customer\'s companies with their figures',
      description:
        'Company rows come from the customer\'s tenant database and the figures from the shared '
        + 'corpus. A company with no summary row still appears, reported as zeros.',
      params: [orgParam()],
      ok: h.listResponse('Companies.'),
      errors: E,
    }),
  },
  '/admin/customers/{id}/patents': {
    get: h.operation({
      tag: 'Admin customers',
      summary: 'Every asset number held by a customer',
      description:
        'Grant number where there is one, application number otherwise; asset_type flags which. '
        + 'Pass representativeID to scope to particular companies.',
      params: [
        orgParam(),
        h.jsonArrayQuery('representativeID', 'Company ids to scope to.', '[]'),
        { name: 'direction', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'] },
          description: 'Sort direction on the asset number.' },
      ],
      ok: h.listResponse('Assets.'),
      errors: E,
    }),
  },
  '/admin/customers/{id}/family': {
    get: h.operation({
      tag: 'Admin logs',
      summary: 'The family-retrieval log',
      params: [orgParam(), companiesParam],
      ok: h.listResponse('Log entries, with progress as "retrieved / total".'),
      errors: E,
    }),
  },
  '/admin/customers/{id}/family-log': {
    delete: h.operation({
      tag: 'Admin logs',
      summary: 'Clear the family-retrieval log',
      params: [orgParam(), companiesParam],
      ok: h.objectResponse('Cleared.'),
      errors: E,
    }),
  },
  '/admin/customers/{id}/reclassify': {
    get: h.operation({
      tag: 'Admin logs',
      summary: 'The reclassification log',
      description:
        "Each entry's start time is filled in from the previous entry's end — the table only "
        + 'records when each step finished.',
      params: [orgParam(), companiesParam],
      ok: h.listResponse('Log entries.'),
      errors: E,
    }),
  },
  '/admin/customers/{id}/reclassify-log': {
    get: h.operation({
      tag: 'Admin logs',
      summary: 'The reclassification log (alias)',
      params: [orgParam(), companiesParam],
      ok: h.listResponse('Log entries.'),
      errors: E,
    }),
    delete: h.operation({
      tag: 'Admin logs',
      summary: 'Clear the reclassification log',
      params: [orgParam(), companiesParam],
      ok: h.objectResponse('Cleared.'),
      errors: E,
    }),
  },

  /* -------------------------------------------------------- entity files */

  '/admin/customers/static_file/read_entity_file': {
    get: h.operation({
      tag: 'Admin jobs',
      summary: 'Read a normalisation output file',
      description:
        'Only the files the normalisation scripts write can be read. The legacy version joined '
        + 'the name straight onto the script directory, so any path could be read.',
      params: [h.queryParam('fileName', 'File name, no path.', { type: 'string', example: 'normalizeNames_118_file.json' }, true)],
      ok: h.listResponse('The file contents, or [] when the script has not run yet.'),
      errors: E,
    }),
  },
  '/admin/customers/read_static_file/read_entity_file/{id}/{portfolios}/{type}': {
    get: h.operation({
      tag: 'Admin jobs',
      summary: 'Read the normalisation output for one run',
      params: [
        orgParam(),
        h.pathParam('portfolios', 'JSON array of portfolio ids.', { type: 'string', example: '[]' }),
        h.pathParam('type', 'Run type.', { type: 'string', example: '0' }),
      ],
      ok: h.listResponse('The file contents.'),
      errors: E,
    }),
  },

  /* --------------------------------------------------------- pipeline jobs */

  '/admin/customers/customers/{id}/{type}': {
    get: job({
      summary: 'Rebuild a customer\'s entity suggestions',
      description:
        'Queues the name normaliser. Its arguments are passed to the process directly; the '
        + 'legacy version built a shell string from them (TEST_REPORT.md section 3).',
      params: [orgParam(), h.pathParam('type', 'Entity type.')],
      status: 202,
    }),
  },
  '/admin/customers/customers/{id}/{representative_id}/{type}': {
    get: job({
      summary: 'Rebuild the entity suggestions for named companies',
      params: [
        orgParam(),
        h.pathParam('representative_id', 'JSON array of company ids.', { type: 'string', example: '[9]' }),
        h.pathParam('type', 'Entity type.'),
      ],
      status: 202,
    }),
  },
  '/admin/customers/{organisation_id}/create_tree': {
    get: job({ summary: 'Build the corporate tree', params: [orgParam('organisation_id')], status: 202 }),
  },
  '/admin/customers/{organisation_id}/flag_automatic': {
    get: job({
      summary: 'Recompute the automatic flags',
      params: [orgParam('organisation_id'), h.jsonArrayQuery('representative_id', 'Company ids.', '[]')],
    }),
  },
  '/admin/customers/{organisation_id}/transaction_missing_conveyance': {
    get: job({
      summary: 'Fill in missing conveyance types',
      params: [orgParam('organisation_id'), h.queryParam('representative_id', 'Company id.')],
    }),
  },
  '/admin/customers/{organisation_id}/publish': {
    get: job({ summary: 'Publish company changes', params: [orgParam('organisation_id')] }),
  },
  '/admin/customers/{organisation_id}/address/publish': {
    get: job({ summary: 'Publish address changes', params: [orgParam('organisation_id')] }),
  },
  '/admin/customers/{organisation_id}/{representative_id}/missing_inventor': {
    get: job({
      summary: 'Find assignments with a missing inventor',
      description: 'One run at a time per company; a second call reports that it is already running.',
      params: [orgParam('organisation_id'), h.numericPathParam('representative_id', 'Company id.')],
    }),
  },
  '/admin/customers/{organisation_id}/{representative_id}/missing_inventor/stop': {
    get: job({
      summary: 'Stop the missing-inventor run',
      params: [orgParam('organisation_id'), h.numericPathParam('representative_id', 'Company id.')],
    }),
  },
  '/admin/customers/retrieve_cited_patents/{customer_id}': {
    get: job({
      summary: 'Retrieve the assignees of cited patents',
      params: [
        h.numericPathParam('customer_id', 'Organisation id.'),
        h.jsonArrayQuery('companies', 'Company ids.', '[]'),
        h.queryParam('type', 'Retrieval type.'),
      ],
      status: 202,
    }),
  },
  '/admin/customers/retrieve_cited_patents_domain/{customer_id}/{api_name}': {
    get: job({
      summary: 'Look up assignee domains',
      params: [
        h.numericPathParam('customer_id', 'Organisation id.'),
        h.pathParam('api_name', 'Which lookup provider to use.'),
        h.queryParam('assignees', 'Assignee names.'),
      ],
      status: 202,
    }),
  },
  '/admin/customers/retrieve_cited_patents_logo': {
    post: job({
      summary: 'Download assignee logos',
      body: h.jsonBody({
        type: 'object',
        properties: {
          client_id: { type: 'integer' },
          api_name: { type: 'string' },
          assignees: { type: 'string' },
          all: { type: 'integer' },
          company_id: { type: 'integer' },
          type: { type: 'string' },
          source_data: { type: 'string' },
        },
      }),
      status: 202,
    }),
  },

  /* ------------------------------------------------------------ admin users */

  '/admin/users': {
    get: h.operation({
      tag: 'Admin users',
      summary: 'Every console administrator',
      ok: h.listResponse('Administrators.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Admin users',
      summary: 'Create a console administrator',
      body: h.jsonBody({
        type: 'object',
        required: ['username', 'password'],
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          username: { type: 'string' },
          password: { type: 'string', format: 'password' },
        },
      }),
      ok: h.objectResponse('The new administrator.'),
      status: 201,
      errors: E,
    }),
  },
  '/admin/users/{user_id}': {
    put: h.operation({
      tag: 'Admin users',
      summary: "Change an administrator's name or password",
      params: [h.numericPathParam('user_id', 'Administrator id.')],
      body: h.jsonBody({
        type: 'object',
        required: ['password'],
        properties: {
          first_name: { type: 'string' },
          password: { type: 'string', format: 'password' },
        },
      }),
      ok: h.objectResponse('Updated.'),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such administrator.') },
    }),
  },
  '/admin/users/{org_id}/{user_id}': {
    delete: h.operation({
      tag: 'Admin users',
      summary: 'Delete a customer user',
      description:
        'The row lives in two databases on two servers, so one transaction cannot span them. The '
        + 'business row goes first because it is the one that grants access; if the tenant row '
        + 'then fails, the response says so rather than leaving the user signed in.',
      params: [
        h.numericPathParam('org_id', 'Organisation id.'),
        h.numericPathParam('user_id', 'User id.'),
      ],
      ok: h.objectResponse('Deleted, with a note if the tenant row survived.'),
      errors: E,
      extraResponses: {
        404: h.errorResponse('No such user in that organisation.'),
        503: h.errorResponse('The customer database is unreachable.'),
      },
    }),
  },
};
