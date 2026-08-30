'use strict';

/**
 * Dashboards, the portfolio-metrics surface.
 *
 * These endpoints take form-encoded bodies whose array fields are JSON strings
 * (`selectedCompanies=[9]`), which is what the dashboard client sends. Swagger
 * UI renders them as plain text inputs, so paste JSON in directly.
 */

const h = require('../helpers');

const METRIC_TYPES = `Metric type. 1 restore ownership, 17 incorrect names, 18 encumbrances,
19 incorrect address, 20 invalid collaterals, 21 unnecessary patents, 22 missed monetization,
23 late maintenance, 24 incorrect recording, 25 late recording, 26 deflated collaterals,
30 assigned, 31 filed, 32 acquired, 33 divested, 34 collateralized, 35 maintenance budget,
36 abandoned, 37 PTAB, 38 top non-US family members, 39 proliferate inventors,
40 top law firms, 41 top lenders.`;

const selection = {
  selectedCompanies: h.jsonArrayField('Representative ids.'),
  customers: h.jsonArrayField('Counterparty ids. Only read in bank format.', '[]'),
  assignments: h.jsonArrayField('Transaction (rf_id) filter. Only read in bank format.', '[]'),
};

module.exports = {
  '/dashboards/': {
    get: h.operation({
      tag: 'Dashboards',
      summary: 'Dashboard tiles',
      description:
        'At least one company is required. An unfiltered call would aggregate every row in the '
        + 'shared partition — around 8 million — and never return.',
      params: [h.jsonArrayQuery('companies', 'Representative ids. Required, and must not be empty.')],
      ok: h.listResponse('One row per metric type.'),
    }),
    post: h.operation({
      tag: 'Dashboards',
      summary: 'One dashboard metric',
      description:
        `${METRIC_TYPES}\n\nSet \`data_format=1\` for a cumulative-by-year series instead of a `
        + 'single total; that form needs at least one company. Metric 37 is an outbound PTAB '
        + 'lookup rather than a query, and degrades to an empty tile if the USPTO is unreachable.',
      body: h.formBody({
        ...selection,
        type: { type: 'integer', example: 30, description: 'Metric type.' },
        data_format: { type: 'integer', enum: [0, 1], description: '1 = cumulative-by-year series.' },
        format_type: { type: 'string', enum: ['bank'], description: 'Switches to the lender view.' },
        company: { type: 'string', description: 'Company name, used by metric 37 (PTAB) only.' },
      }, ['type']),
      ok: h.jsonResponse(
        'A single row for most metrics; an array for 38-41 and for the cumulative series.',
        { oneOf: [{ type: 'object' }, { type: 'array', items: { type: 'object' } }] }
      ),
    }),
  },

  '/dashboards/temp': {
    post: h.operation({
      tag: 'Dashboards',
      summary: 'Recompute a metric live against the raw tables',
      description:
        'Bypasses the precomputed dashboard_items rows. An empty `list` field means "nothing to '
        + 'recompute" and returns {}.',
      body: h.formBody({
        ...selection,
        list: { type: 'string', description: 'Non-empty to trigger the recompute.', example: '[]' },
        tabs: h.jsonArrayField('Activity tab filter.', '[]'),
        type: { type: 'integer', example: 18 },
        format_type: { type: 'string', enum: ['bank'] },
      }, ['type']),
      ok: h.objectResponse('The recomputed counters.'),
    }),
  },

  '/dashboards/count': {
    post: h.operation({
      tag: 'Dashboards',
      summary: 'Precomputed counters for several metric types',
      body: h.formBody({
        selectedCompanies: selection.selectedCompanies,
        customers: selection.customers,
        type: h.jsonArrayField('Metric types to count.', '[30,31]'),
        format_type: { type: 'string', enum: ['bank'] },
      }),
      ok: h.listResponse('One row per metric type.'),
    }),
  },

  '/dashboards/example': {
    post: h.operation({
      tag: 'Dashboards',
      summary: 'One representative row for a metric type',
      body: h.formBody({
        selectedCompanies: selection.selectedCompanies,
        customers: selection.customers,
        type: h.jsonArrayField('Metric types.', '[30]'),
        format_type: { type: 'string', enum: ['bank'] },
      }),
      ok: h.objectResponse('A sample row, or {} when there is none.'),
    }),
  },

  '/dashboards/collateral': {
    post: h.operation({
      tag: 'Dashboards',
      summary: 'Collateral totals per recorded transaction',
      body: h.formBody({
        selectedCompanies: selection.selectedCompanies,
        assignor_id: h.jsonArrayField('Restrict to these counterparties.', '[]'),
      }),
      ok: h.listResponse('Reel/frame totals.'),
    }),
  },

  '/dashboards/parties': {
    post: h.operation({
      tag: 'Dashboards',
      summary: 'Counterparties on the acquisition, lending or licensing activities',
      description:
        'The asset set comes from `layout` unless `list`/`total` supply an explicit one. '
        + 'type=filled queries the inventor tables instead of recorded transactions.',
      body: h.formBody({
        selectedCompanies: selection.selectedCompanies,
        search: { type: 'string', enum: ['all'], description: 'Widen to every tracked asset.' },
        layout: { type: 'string', example: 'acquired', description: 'Layout name; defaults to acquired.' },
        type: { type: 'string', enum: ['lenders', 'license_out', 'filled'] },
        list: h.jsonArrayField('An explicit asset list.', '[]'),
        total: { type: 'integer', description: 'Must equal list length for the list to be used.' },
      }),
      ok: h.listResponse('Counterparties with asset counts.'),
      errors: h.TENANT_ERRORS,
    }),
  },

  '/dashboards/parties/assignor': {
    post: h.operation({
      tag: 'Dashboards',
      summary: 'Counterparties this company assigned assets to',
      body: h.formBody({
        selectedCompanies: selection.selectedCompanies,
        search: { type: 'string', enum: ['all'] },
        type: { type: 'string', enum: ['license_in'], description: 'Defaults to the divestment activities.' },
      }),
      ok: h.listResponse('Counterparties with asset counts.'),
      errors: h.TENANT_ERRORS,
    }),
  },

  '/dashboards/parties/inventor/{inventorID}': {
    get: h.operation({
      tag: 'Dashboards',
      summary: 'Map an inventor to a counterparty record',
      description:
        'Tries eight orderings of the name parts, since USPTO records spell inventors '
        + 'inconsistently.',
      params: [h.numericPathParam('inventorID', 'Inventor party id.')],
      ok: h.objectResponse('The matched party, or {} when none matched.'),
    }),
  },

  '/dashboards/filed_assets_events': {
    post: h.operation({
      tag: 'Dashboards',
      summary: 'Maintenance-fee events on filed patents',
      body: h.formBody({ selectedCompanies: selection.selectedCompanies }),
      ok: h.listResponse('Events, keyed by asset and event code.'),
    }),
  },

  '/dashboards/timeline': {
    post: h.operation({
      tag: 'Dashboards',
      summary: 'Company transactions for one timeline tab',
      description:
        'Tab 1 acquisitions, 2 divestments, 3 licensing, 4 lending, 5 employees, 6 court orders, '
        + '7 everything. Every tab except 5 also joins the counterparty logo.',
      body: h.formBody({
        selectedCompanies: selection.selectedCompanies,
        customers: h.jsonArrayField('Restrict to these counterparties.', '[]'),
        type: { type: 'integer', example: 1, description: 'Timeline tab, 1-7.' },
      }, ['type']),
      ok: h.listResponse('Transactions, newest first.'),
    }),
  },

  '/dashboards/share': {
    post: h.operation({
      tag: 'Dashboards',
      summary: 'Create a public link to this dashboard selection',
      body: h.formBody({
        selectedCompanies: selection.selectedCompanies,
        tabs: h.jsonArrayField('Activity tabs in the selection.', '[]'),
        customers: h.jsonArrayField('Counterparties in the selection.', '[]'),
        share_button: { type: 'string', enum: ['1', '2'], description: '2 uses the dashboard host, 1 the KPI host.' },
      }),
      ok: h.textResponse('The share URL.', 'https://kpi.patentrack.com/dashboard/ab12cd'),
      errors: h.TENANT_ERRORS,
    }),
  },
};
