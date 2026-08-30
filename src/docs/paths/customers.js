'use strict';

/**
 * The customers surface — the portfolio explorer. Thirty endpoints covering
 * asset types, transactions, timelines, parties and the correction queues.
 */

const h = require('../helpers');

const E = h.TENANT_ERRORS;
const companies = h.jsonArrayQuery('companies', 'Representative ids.');
const tabs = h.jsonArrayQuery('tabs', 'Activity tab ids.', '[1,6]');
const customers = h.jsonArrayQuery('customers', 'Counterparty ids.', '[]');
const assignments = h.jsonArrayQuery('assignments', 'Transaction (rf_id) filter.', '[]');
const layout = h.queryParam('layout', 'Layout name, e.g. acquired, divested, collaterlized.');

module.exports = {
  '/customers/events': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Portfolio events',
      params: [companies, tabs, customers, ...h.paginationParams],
      ok: h.listResponse('Events.'),
      errors: E,
    }),
  },

  '/customers/timeline': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Portfolio transaction timeline',
      params: [companies, tabs, customers, layout],
      ok: h.listResponse('Transactions, newest first.'),
    }),
  },
  '/customers/timeline/filling_assets': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Filing activity over time',
      params: [companies, tabs, customers, layout],
      ok: h.listResponse('Filings grouped by period.'),
      errors: E,
    }),
  },
  '/customers/timeline/security': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Security interests over time',
      params: [companies],
      ok: h.listResponse('Security transactions.'),
    }),
  },

  '/customers/asset_types': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Asset-type tabs with their totals',
      params: [companies],
      ok: h.listResponse('One row per tab.'),
      errors: E,
    }),
  },
  '/customers/asset_types/companies': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Companies behind the asset-type tabs',
      params: [companies, tabs, ...h.paginationParams],
      ok: h.listResponse('Companies.'),
      errors: E,
    }),
  },
  '/customers/asset_types/{tab_id}/companies': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Companies on one asset-type tab',
      params: [h.numericPathParam('tab_id', 'Tab id.'), companies, layout],
      ok: h.listResponse('Companies.'),
      errors: E,
    }),
  },
  '/customers/asset_types/assignments': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Recorded assignments behind the selection',
      params: [companies, tabs, customers, layout],
      ok: h.listResponse('Assignments.'),
      errors: E,
    }),
  },
  '/customers/asset_types/assignments/{rfID}': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Assets covered by one assignment',
      params: [h.numericPathParam('rfID', 'Transaction (reel-frame) id.'), layout],
      ok: h.listResponse('Assets.'),
      errors: E,
    }),
  },
  '/customers/asset_types/assets': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Assets behind the selection',
      params: [companies, tabs, customers, assignments, ...h.paginationParams],
      ok: h.listResponse('Assets.'),
      errors: E,
    }),
  },
  '/customers/asset_types/assets/agents': {
    post: h.operation({
      tag: 'Customers',
      summary: 'Prosecuting agents for a set of assets',
      body: h.formBody({ assets: h.jsonArrayField('Application numbers.', '["16123456"]') }),
      ok: h.listResponse('Agents.'),
      errors: E,
    }),
  },
  '/customers/asset_types/assets/family': {
    post: h.operation({
      tag: 'Customers',
      summary: 'Foreign family members for a set of assets',
      body: h.formBody({ assets: h.jsonArrayField('Application numbers.', '["16123456"]') }),
      ok: h.listResponse('Family members by country.'),
      errors: E,
    }),
  },
  '/customers/asset_types/inventors/location': {
    post: h.operation({
      tag: 'Customers',
      summary: 'Inventor locations for a set of assets',
      body: h.formBody({ assets: h.jsonArrayField('Application numbers.', '["16123456"]') }),
      ok: h.listResponse('Inventor locations.'),
      errors: E,
    }),
  },

  '/customers/transactions/groupids': {
    post: h.operation({
      tag: 'Customers',
      summary: 'Transactions for a set of group ids',
      body: h.formBody({ groupids: h.jsonArrayField('Group ids.', '[1]') }),
      ok: h.listResponse('Transactions.'),
    }),
  },
  '/customers/transactions/address': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Transactions with a questionable recorded address',
      params: [companies, ...h.paginationParams],
      ok: h.listResponse('Transactions.'),
    }),
  },
  '/customers/transactions/name': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Transactions with a questionable recorded name',
      params: [companies, ...h.paginationParams],
      ok: h.listResponse('Transactions.'),
    }),
  },
  '/customers/transactions/queues/address': {
    post: h.operation({
      tag: 'Customers',
      summary: 'Queue an address correction',
      body: h.formBody({
        transactions: h.jsonArrayField('Transaction ids to correct.', '[500]'),
        address: { type: 'string' },
      }),
      ok: h.objectResponse('Queued.'),
      errors: E,
    }),
  },
  '/customers/transactions/queues/name': {
    post: h.operation({
      tag: 'Customers',
      summary: 'Queue a name correction',
      body: h.formBody({
        transactions: h.jsonArrayField('Transaction ids to correct.', '[500]'),
        name: { type: 'string' },
      }),
      ok: h.objectResponse('Queued.'),
      errors: E,
    }),
  },

  '/customers/incorrectnames': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Assets recorded under the wrong owner name',
      params: [companies, ...h.paginationParams],
      ok: h.listResponse('Findings.'),
      errors: E,
    }),
  },
  '/customers/lawfirm': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Law firms across the selection',
      params: [companies, h.queryParam('rfID', 'Restrict to one transaction.', { type: 'integer' })],
      ok: h.listResponse('Law firms.'),
      errors: E,
    }),
  },
  '/customers/lenders': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Lenders across the selection',
      params: [companies, ...h.paginationParams],
      ok: h.listResponse('Lenders.'),
      errors: E,
    }),
  },
  '/customers/portfolios': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Portfolio breakdown',
      params: [companies],
      ok: h.listResponse('Portfolios.'),
      errors: E,
    }),
  },

  '/customers/{layout}/assets': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Assets behind one layout',
      params: [h.pathParam('layout', 'Layout name, e.g. acquired.'), companies, ...h.paginationParams],
      ok: h.listResponse('Assets.'),
      errors: E,
    }),
  },
  '/customers/{layout}/parties': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Counterparties behind one layout',
      params: [h.pathParam('layout', 'Layout name.'), companies],
      ok: h.listResponse('Counterparties.'),
      errors: E,
    }),
  },
  '/customers/{layout}/activites': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Activities behind one layout',
      description: 'The path spelling "activites" is the legacy one and is kept for compatibility.',
      params: [h.pathParam('layout', 'Layout name.'), companies],
      ok: h.listResponse('Activities.'),
      errors: E,
    }),
  },
  '/customers/{layout}/transactions': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Transactions behind one layout',
      params: [h.pathParam('layout', 'Layout name.'), companies, ...h.paginationParams],
      ok: h.listResponse('Transactions.'),
      errors: E,
    }),
  },

  '/customers/{parentCompany}/parties/{tabId}': {
    get: h.operation({
      tag: 'Customers',
      summary: "Counterparties under a parent company's tab",
      params: [
        h.pathParam('parentCompany', 'Parent company name.'),
        h.numericPathParam('tabId', 'Activity tab id.'),
      ],
      ok: h.listResponse('Counterparties.'),
      errors: E,
    }),
  },
  '/customers/{parentCompany}/{name}/collections/{tabId}': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Transactions between a parent company and one counterparty',
      params: [
        h.pathParam('parentCompany', 'Parent company name.'),
        h.pathParam('name', 'Counterparty name.'),
        h.numericPathParam('tabId', 'Activity tab id.'),
      ],
      ok: h.listResponse('Transactions.'),
    }),
  },
  '/customers/{rf_id}/assets': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Assets on one transaction',
      params: [h.numericPathParam('rf_id', 'Transaction (reel-frame) id.')],
      ok: h.listResponse('Assets.'),
    }),
  },
  '/customers/{type}': {
    get: h.operation({
      tag: 'Customers',
      summary: 'Customers of one type',
      description:
        'The catch-all route. Declared last so the literal paths above always win.',
      params: [h.pathParam('type', 'Customer type discriminator.'), companies],
      ok: h.listResponse('Customers.'),
      errors: E,
    }),
  },
};
