'use strict';

// Company portfolio management, activity tabs, and the portfolio tree.

const h = require('../helpers');
const E = h.TENANT_ERRORS;

module.exports = {
  '/companies/': {
    get: h.operation({
      tag: 'Companies',
      summary: 'Companies with their subsidiaries',
      params: [h.jsonArrayQuery('companies', 'Restrict to these representative ids.')],
      ok: h.listResponse('Companies, each with a `children` array.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Companies',
      summary: 'Add companies to the portfolio',
      body: h.jsonBody({
        type: 'object',
        properties: {
          companies: h.jsonArrayField('Company names or ids to add.', '["ACME INC"]'),
          parent_id: { type: 'integer', description: 'Attach as subsidiaries of this company.' },
        },
      }),
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: E,
    }),
    delete: h.operation({
      tag: 'Companies',
      summary: 'Remove companies from the portfolio',
      params: [h.jsonArrayQuery('companies', 'Representative ids to remove.')],
      ok: h.objectResponse('Removed.'),
      errors: E,
    }),
  },

  '/companies/list': {
    get: h.operation({
      tag: 'Companies',
      summary: 'Portfolio list with report counters',
      description:
        'Merges the portfolio with the per-company report totals. Share-link callers only see the '
        + 'companies their link covers.',
      params: [h.jsonArrayQuery('companies', 'Representative ids.')],
      ok: h.listResponse('Companies with counters.'),
      errors: E,
    }),
  },

  '/companies/summary': {
    get: h.operation({
      tag: 'Companies',
      summary: 'Portfolio totals',
      ok: h.objectResponse('Asset and transaction totals across the portfolio.'),
      errors: E,
    }),
  },

  '/companies/maintainence_assets': {
    get: h.operation({
      tag: 'Companies',
      summary: 'Assets with maintenance fees due',
      params: [h.jsonArrayQuery('companies', 'Representative ids.')],
      ok: h.listResponse('Assets and their fee windows.'),
    }),
  },

  '/companies/request': {
    get: h.operation({
      tag: 'Companies',
      summary: 'List company-addition requests',
      ok: h.listResponse('Pending requests.'),
    }),
    post: h.operation({
      tag: 'Companies',
      summary: 'Request that a company be added to the corpus',
      body: h.jsonBody({
        type: 'object',
        properties: { company_name: { type: 'string', example: 'ACME INC' } },
        required: ['company_name'],
      }),
      ok: h.objectResponse('Request recorded.'),
      status: 201,
    }),
  },

  '/companies/search/{searchName}': {
    get: h.operation({
      tag: 'Companies',
      summary: 'Search the company corpus by name',
      params: [h.pathParam('searchName', 'Name fragment to search for.')],
      ok: h.listResponse('Matching companies.'),
    }),
  },

  '/companies/group': {
    post: h.operation({
      tag: 'Companies',
      summary: 'Group companies under a parent',
      body: h.jsonBody({
        type: 'object',
        properties: {
          companies: h.jsonArrayField('Representative ids to group.'),
          parent_id: { type: 'integer' },
        },
      }),
      ok: h.objectResponse('Grouped.'),
      errors: E,
    }),
  },

  '/companies/subcompanies': {
    delete: h.operation({
      tag: 'Companies',
      summary: 'Detach subsidiaries from their parent',
      params: [h.jsonArrayQuery('companies', 'Subsidiary representative ids.')],
      ok: h.objectResponse('Detached.'),
      errors: E,
    }),
  },

  '/companies/lawfirm': {
    get: h.operation({
      tag: 'Companies',
      summary: 'Law firms mapped to companies',
      params: [h.jsonArrayQuery('companies', 'Representative ids.')],
      ok: h.listResponse('Company/law-firm links.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Companies',
      summary: 'Map law firms to a company',
      body: h.jsonBody({
        type: 'object',
        properties: {
          representative_id: { type: 'integer' },
          lawfirms: h.jsonArrayField('Law firm ids.'),
        },
      }),
      ok: h.objectResponse('Mapped.'),
      status: 201,
      errors: E,
    }),
  },

  '/companies/lawfirm/{companyLawfirmId}': {
    delete: h.operation({
      tag: 'Companies',
      summary: 'Remove a company/law-firm link',
      params: [h.numericPathParam('companyLawfirmId', 'Link id.')],
      ok: h.objectResponse('Removed.'),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such link.') },
    }),
  },

  '/companies/{companyID}': {
    put: h.operation({
      tag: 'Companies',
      summary: 'Rename or restatus a company',
      params: [h.numericPathParam('companyID', 'Representative id.')],
      body: h.jsonBody({
        type: 'object',
        properties: {
          representative_name: { type: 'string' },
          status: { type: 'integer' },
          mode: { type: 'integer' },
        },
      }, false),
      ok: h.objectResponse('Updated.'),
      errors: E,
      extraResponses: { 404: h.errorResponse('No such company.') },
    }),
  },

  '/companies/{companyID}/list': {
    get: h.operation({
      tag: 'Companies',
      summary: "One company's subsidiaries",
      params: [h.numericPathParam('companyID', 'Representative id.')],
      ok: h.listResponse('Subsidiaries.'),
      errors: E,
    }),
  },

  '/companies/{companyID}/users': {
    get: h.operation({
      tag: 'Companies',
      summary: 'Users attached to a company',
      description:
        'Not yet ported — the legacy implementation depended on the messaging tier. Returns 501.',
      params: [h.numericPathParam('companyID', 'Representative id.')],
      ok: h.listResponse('Users.'),
      errors: E,
      extraResponses: { 501: h.errorResponse('Not implemented yet.') },
    }),
  },

  /* ----------------------------------------------------------------- tabs */
  '/tabs/{tabID}': {
    get: h.operation({
      tag: 'Tabs',
      summary: 'Companies active on one activity tab',
      params: [h.numericPathParam('tabID', 'Activity tab id.')],
      ok: h.listResponse('Companies with transaction and asset totals.'),
      errors: E,
    }),
  },
  '/tabs/{tabID}/customers': {
    get: h.operation({
      tag: 'Tabs',
      summary: 'Counterparties on a tab across several companies',
      params: [
        h.numericPathParam('tabID', 'Activity tab id.'),
        h.jsonArrayQuery('companiesIds', 'Representative ids. Required.'),
        ...h.paginationParams,
      ],
      ok: h.listResponse('Counterparties.'),
      errors: E,
    }),
  },
  '/tabs/{tabID}/companies/{companyID}': {
    get: h.operation({
      tag: 'Tabs',
      summary: "One company's counterparties on a tab",
      params: [
        h.numericPathParam('tabID', 'Activity tab id.'),
        h.numericPathParam('companyID', 'Representative id.'),
        ...h.paginationParams,
      ],
      ok: h.listResponse('Counterparties.'),
      errors: E,
    }),
  },
  '/tabs/{tabID}/companies/{companyID}/customers/{customerID}': {
    get: h.operation({
      tag: 'Tabs',
      summary: 'Transactions between a company and one counterparty',
      params: [
        h.numericPathParam('tabID', 'Activity tab id.'),
        h.pathParam('companyID', 'Representative id, or a JSON array of them.'),
        h.numericPathParam('customerID', 'Counterparty id.'),
      ],
      ok: h.listResponse('Transactions.'),
      errors: E,
    }),
  },
  '/tabs/{tabID}/companies/{companyID}/customers/{customerID}/transactions/{rfID}': {
    get: h.operation({
      tag: 'Tabs',
      summary: 'Assets covered by one transaction',
      params: [
        h.numericPathParam('tabID', 'Activity tab id.'),
        h.pathParam('companyID', 'Representative id, or a JSON array of them.'),
        h.numericPathParam('customerID', 'Counterparty id.'),
        h.numericPathParam('rfID', 'Transaction (reel-frame) id.'),
      ],
      ok: h.listResponse('Assets.'),
      errors: E,
    }),
  },

  /* ----------------------------------------------------------------- tree */
  '/tree/': {
    get: h.operation({
      tag: 'Tree',
      summary: 'Portfolio tree: tab → counterparty → transaction → assets',
      params: [h.jsonArrayQuery('portfolio', 'Representative ids. Required.')],
      ok: h.listResponse('One node per activity tab, always eleven of them.'),
      errors: E,
    }),
  },
};
