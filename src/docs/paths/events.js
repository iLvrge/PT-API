'use strict';

// Asset events: maintenance-fee history, abandonment and the life-span charts.

const h = require('../helpers');

const E = h.AUTH_ERRORS;
const T = h.TENANT_ERRORS;
const assetParam = (name, description) =>
  h.pathParam(name, description, { type: 'string', pattern: '^[A-Za-z0-9]+$', example: '13456789' });
const counterParam = h.queryParam('counter', 'Present at all: return just the count as text/plain.', { type: 'string' });

const chartResponse = (description) => h.jsonResponse(description, {
  type: 'array',
  description: 'A charting table: a header row, then one row per year.',
  items: { type: 'array', items: {} },
});

const tabLifeSpan = (summary, params) => ({
  get: h.operation({
    tag: 'Events',
    summary,
    params,
    ok: h.listResponse('Year-by-year asset counts.'),
    errors: T,
  }),
});

module.exports = {
  '/events/tabs': {
    get: h.operation({
      tag: 'Events',
      summary: 'Life span of the assets in a selection',
      description:
        'How many assets are alive in each year of their term. A US patent runs twenty years from '
        + 'its filing date, so the series is the overlap of every asset\'s window.',
      params: [
        h.queryParam('type', 'Layout name.', { type: 'string', example: 'acquired' }),
        h.jsonArrayQuery('companies', 'Representative ids.'),
        h.jsonArrayQuery('tabs', 'Activity tab ids.', '[]'),
        h.jsonArrayQuery('customers', 'Counterparty ids.', '[]'),
        h.jsonArrayQuery('rf_ids', 'Transaction ids.', '[]'),
      ],
      ok: h.listResponse('Year-by-year asset counts.'),
      errors: E,
    }),
  },
  '/events/tabs/{tabID}': tabLifeSpan(
    'Life span of the assets on one activity tab',
    [h.numericPathParam('tabID', 'Activity tab id.')]
  ),
  '/events/tabs/{tabID}/companies/{companyID}': tabLifeSpan(
    "Life span of one company's assets on a tab",
    [h.numericPathParam('tabID', 'Activity tab id.'), h.numericPathParam('companyID', 'Representative id.')]
  ),
  '/events/tabs/{tabID}/companies/{companyID}/customers/{customerID}': tabLifeSpan(
    'Life span narrowed to one counterparty',
    [
      h.numericPathParam('tabID', 'Activity tab id.'),
      h.numericPathParam('companyID', 'Representative id.'),
      h.numericPathParam('customerID', 'Counterparty id.'),
    ]
  ),
  '/events/tabs/{tabID}/companies/{representativeID}/customers/{customerID}/transactions/{rfID}': tabLifeSpan(
    'Life span narrowed to one transaction',
    [
      h.numericPathParam('tabID', 'Activity tab id.'),
      h.numericPathParam('representativeID', 'Representative id.'),
      h.numericPathParam('customerID', 'Counterparty id.'),
      h.numericPathParam('rfID', 'Transaction id.'),
    ]
  ),

  '/events/assets': {
    post: h.operation({
      tag: 'Events',
      summary: 'Life span of an explicit asset list',
      body: h.formBody({ list: h.jsonArrayField('Application numbers.', '["13456789"]') }),
      ok: h.listResponse('Year-by-year asset counts.'),
      errors: E,
    }),
  },

  '/events/abandoned/maintainence/assets': {
    post: h.operation({
      tag: 'Events',
      summary: 'Where a portfolio stands against the maintenance-fee windows',
      description:
        'Fees fall due at 3.5, 7.5 and 11.5 years. An asset that paid the first window but not '
        + 'the second lapsed there; assets with no grant number never reached a window at all.',
      body: h.formBody({
        selectedCompanies: h.jsonArrayField('Representative ids.'),
        type: { type: 'string', example: 'acquired', description: 'Layout name.' },
      }),
      ok: chartResponse('One row per bucket: pending, not yet due, lapsed at each window, maintained.'),
      errors: E,
    }),
  },
  '/events/abandoned/yearly/assets': {
    post: h.operation({
      tag: 'Events',
      summary: 'Abandonments per year',
      body: h.formBody({
        selectedCompanies: h.jsonArrayField('Representative ids.'),
        type: { type: 'string', example: 'acquired', description: 'Layout name.' },
      }),
      ok: chartResponse('One row per year, with no gaps between the first and last.'),
      errors: E,
    }),
  },

  '/events/all/assets/{category_type}': {
    get: h.operation({
      tag: 'Events',
      summary: 'Assets in one event category',
      description: 'Only `to_record` is implemented; anything else is a 400 rather than an empty list.',
      params: [
        h.pathParam('category_type', 'Event category.', { type: 'string', enum: ['to_record'] }),
        h.jsonArrayQuery('companies', 'Representative ids.'),
        h.jsonArrayQuery('customers', 'Counterparty ids.', '[]'),
      ],
      ok: h.objectResponse('The assets and the icon set they draw.'),
      errors: E,
    }),
  },
  '/events/all/assets/to_record/detail/{application}': {
    get: h.operation({
      tag: 'Events',
      summary: 'One unrecorded asset',
      params: [assetParam('application', 'Application number.')],
      ok: h.objectResponse('The asset.'),
      errors: E,
      extraResponses: { 404: h.errorResponse('No unrecorded asset with that number.') },
    }),
  },

  '/events/assets/status/{applicationNumber}': {
    get: h.operation({
      tag: 'Events',
      summary: 'Prosecution timeline for one asset',
      description:
        'Filing, publication and grant dates come from whichever index holds them: the '
        + 'publication index while pending, the grant index once issued, the assignment corpus '
        + 'as a last resort.',
      params: [assetParam('applicationNumber', 'Application number.'), counterParam],
      ok: h.objectResponse('Dates and the status history.'),
      errors: E,
    }),
  },
  '/events/assets/transactions/{rfID}': {
    get: h.operation({
      tag: 'Events',
      summary: 'The assets on one transaction',
      params: [h.numericPathParam('rfID', 'Transaction (reel-frame) id.')],
      ok: h.objectResponse('The assets and the icons they draw.'),
      errors: E,
    }),
  },

  '/events/{applicationNumber}': {
    get: h.operation({
      tag: 'Events',
      summary: 'Maintenance-fee history for one asset',
      description:
        'Returns each event with its icon set, and whether the patent has expired. A number the '
        + 'maintenance table does not key on is resolved through the assignment corpus first.',
      params: [assetParam('applicationNumber', 'Application or patent number.'), counterParam],
      ok: h.jsonResponse('The history.', {
        type: 'object',
        properties: {
          events: { type: 'array', items: { type: 'object' } },
          icons: { type: 'object' },
          expired: { type: 'boolean' },
          expired_date: { type: 'string' },
        },
      }),
      errors: E,
    }),
  },
  '/events/{applicationNumber}/{patentNumber}': {
    get: h.operation({
      tag: 'Events',
      summary: 'Maintenance-fee history, given both numbers',
      params: [
        assetParam('applicationNumber', 'Application number.'),
        assetParam('patentNumber', 'Patent number, used to resolve the application.'),
        counterParam,
      ],
      ok: h.objectResponse('The history.'),
      errors: E,
    }),
  },
};
