'use strict';

/**
 * The remaining read surfaces: entity search, transaction search, validity and
 * transaction counters, update counters, illustrations, share links, timelines
 * and event icons.
 */

const h = require('../helpers');

const E = h.AUTH_ERRORS;
const T = h.TENANT_ERRORS;

// Share endpoints are reachable with only a code, so they carry their own
// tighter rate limit and answer 429 rather than 401.
const SHARE_ERRORS = {
  400: h.errorResponse('Invalid or malformed code.'),
  404: h.errorResponse('No share link with that code.'),
  429: h.errorResponse('Too many requests — share codes are rate limited.'),
  500: h.errorResponse('Unexpected server error.'),
};

module.exports = {
  /* ------------------------------------------------------- entity search */
  '/entity/search/{search_string}/{type}': {
    get: h.operation({
      tag: 'Search',
      summary: 'Full-text search over parties or recorded assignments',
      params: [
        h.pathParam('search_string', 'The term to search for.'),
        h.numericPathParam('type', '1 searches counterparties, 2 searches recording parties.'),
      ],
      ok: h.listResponse('Matches, capped at 1000.'),
      errors: E,
    }),
  },

  '/search/{search_string}': {
    get: h.operation({
      tag: 'Search',
      summary: 'Search transactions by party, correspondent or asset number',
      description:
        'Queries three sources in parallel and de-duplicates by transaction id. A numeric term is '
        + 'also tried as a transaction id and an application number.',
      params: [h.pathParam('search_string', 'The term to search for.')],
      ok: h.jsonResponse('Matching transactions.', {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'object' } },
          total_records: { type: 'integer' },
          txn_ids: { type: 'array', items: { type: 'integer' } },
        },
      }),
      errors: T,
    }),
  },

  /* ----------------------------------------------------------- counters */
  '/validity_counter': {
    get: h.operation({
      tag: 'Counters',
      summary: 'Portfolio validity counters',
      params: [h.jsonArrayQuery('companies', 'Representative ids.')],
      ok: h.objectResponse('Counters, all zero when the organisation has no rows yet.'),
      errors: T,
    }),
  },
  '/transactions': {
    get: h.operation({
      tag: 'Counters',
      summary: 'Transaction counters by activity',
      params: [h.jsonArrayQuery('companies', 'Representative ids.')],
      ok: h.objectResponse('Buy, sale, security, release and licence counters.'),
      errors: T,
    }),
  },
  '/transactions/{transactionId}': {
    get: h.operation({
      tag: 'Counters',
      summary: 'Everything recorded on one transaction',
      params: [h.numericPathParam('transactionId', 'Transaction (reel-frame) id.')],
      ok: h.jsonResponse('Parties, the assignment record and the assets.', {
        type: 'object',
        properties: {
          assignees: { type: 'array', items: { type: 'object' } },
          assignors: { type: 'array', items: { type: 'object' } },
          assignments: { type: 'object', nullable: true },
          patent: { type: 'array', items: { type: 'object' } },
        },
      }),
      errors: E,
    }),
  },
  '/updates/{companyName}': {
    get: h.operation({
      tag: 'Counters',
      summary: 'Weekly, monthly and quarterly change counters',
      description:
        'Pass 0 to sum across the whole organisation. The literal string "undefined" falls back to '
        + "the organisation's own name, which the dashboard client relies on.",
      params: [h.pathParam('companyName', 'Company name, or 0 for the whole organisation.')],
      ok: h.objectResponse('Counters, all zero when the company has none.'),
      errors: T,
    }),
  },

  /* ------------------------------------------------------- illustrations */
  '/connection/{reelFrame}': {
    get: h.operation({
      tag: 'Illustrations',
      summary: 'Assignment diagram for a reel-frame',
      description:
        'This endpoint was unauthenticated in the legacy app; it now requires a token.',
      params: [h.pathParam('reelFrame', 'Reel and frame, e.g. 45231-0812.', {
        type: 'string', pattern: '^\\d+-\\d+$', example: '45231-0812',
      })],
      ok: h.jsonResponse('The diagram, or {} when the reel-frame is unknown.', h.ref('Illustration')),
      errors: E,
    }),
  },
  '/connection/asset/{applicationNumber}': {
    get: h.operation({
      tag: 'Illustrations',
      summary: 'Diagram of the transaction that misnamed an application',
      params: [
        h.pathParam('applicationNumber', 'Application number.'),
        h.jsonArrayQuery('companies', 'Representative ids. Required — without one the result is {}.'),
      ],
      ok: h.jsonResponse('The diagram, or {}.', h.ref('Illustration')),
      errors: T,
    }),
  },
  '/collections/{rf_id}/illustration': {
    get: h.operation({
      tag: 'Illustrations',
      summary: 'Assignment diagram for a transaction id',
      params: [h.numericPathParam('rf_id', 'Transaction (reel-frame) id.')],
      ok: h.jsonResponse('The diagram.', h.ref('Illustration')),
      errors: E,
    }),
  },

  /* --------------------------------------------------------------- share */
  '/share': {
    post: h.operation({
      tag: 'Share',
      summary: 'Create a public share link',
      description: 'Supply either an explicit asset list or a transaction list, not neither.',
      body: h.formBody({
        assets: {
          type: 'string',
          description: 'JSON array of { asset, flag }. flag 4 = patent, 5 = application.',
          example: '[{"asset":"9446259","flag":4}]',
        },
        transactions: h.jsonArrayField('Transaction ids to derive the assets from.', '[]'),
        type: { type: 'integer', enum: [0, 1, 2], description: '0 standard host, 2 sample host, otherwise the share host.' },
      }),
      ok: h.textResponse('The share URL.', 'https://share.patentrack.com/ab12cd'),
      errors: E,
    }),
  },
  '/share/{code}/{type}': {
    get: h.operation({
      tag: 'Share',
      summary: 'Assets behind a share link',
      params: [
        h.pathParam('code', 'The share code.'),
        h.numericPathParam('type', 'Share type. 9 returns a dashboard selection instead.'),
      ],
      ok: h.jsonResponse('The shared assets and the owning organisation logo.', {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'object' } },
          total_records: { type: 'integer' },
          logo: { type: 'string' },
        },
      }),
      errors: SHARE_ERRORS,
      public: true,
    }),
  },
  '/share/illustration/{asset}/{code}': {
    get: h.operation({
      tag: 'Share',
      summary: 'Re-share one asset as its own link',
      params: [h.pathParam('asset', 'Asset number.'), h.pathParam('code', 'The source share code.')],
      ok: h.textResponse('The new share URL.', 'https://share.patentrack.com/ef34gh'),
      errors: SHARE_ERRORS,
      public: true,
    }),
  },
  '/share/data/{asset}/{code}': {
    get: h.operation({
      tag: 'Share',
      summary: 'Illustration JSON for one shared asset',
      description:
        'Proxies the PHP illustration pipeline. Returns an empty body when the pipeline is '
        + 'unreachable, rather than failing the page.',
      params: [h.pathParam('asset', 'Asset number.'), h.pathParam('code', 'The share code.')],
      ok: { description: 'The illustration JSON, or an empty body.', content: { 'application/json': { schema: { type: 'string' } } } },
      errors: SHARE_ERRORS,
      public: true,
    }),
  },
  '/share/illustrate/show/{code}': {
    get: h.operation({
      tag: 'Share',
      summary: 'Illustration JSON for the first asset on a share link',
      params: [h.pathParam('code', 'The share code.')],
      ok: { description: 'The illustration JSON, or an empty body.', content: { 'application/json': { schema: { type: 'string' } } } },
      errors: SHARE_ERRORS,
      public: true,
    }),
  },
  '/share/timeline/list/{code}': {
    get: h.operation({
      tag: 'Share',
      summary: 'Transaction timeline behind a share link',
      description:
        'Older links stored only assets; their transactions are derived on read.',
      params: [h.pathParam('code', 'The share code.')],
      ok: h.jsonResponse('The timeline.', {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'object' } },
          groups: { type: 'array', items: { type: 'object' } },
        },
      }),
      errors: SHARE_ERRORS,
      public: true,
    }),
  },
  '/share/dashboard/list/{code}': {
    get: h.operation({
      tag: 'Share',
      summary: 'Dashboard selection behind a share link',
      params: [h.pathParam('code', 'The share code.')],
      ok: h.objectResponse('The stored selection plus its share_button.'),
      errors: SHARE_ERRORS,
      public: true,
    }),
  },

  /* ----------------------------------------------------------- timelines */
  '/timeline/': {
    get: h.operation({
      tag: 'Timelines',
      summary: 'Recorded transactions, filtered',
      description: 'Omit `limit` to return every row; the end of a date range is inclusive.',
      params: [
        h.queryParam('from', 'Start date.', { type: 'string', format: 'date', example: '2020-01-01' }),
        h.queryParam('to', 'End date, inclusive.', { type: 'string', format: 'date', example: '2020-12-31' }),
        h.jsonArrayQuery('companies', 'Representative ids.'),
        h.jsonArrayQuery('tabs', 'Activity tab ids.', '[1,6]'),
        h.jsonArrayQuery('customers', 'Counterparty ids.', '[]'),
        ...h.paginationParams,
      ],
      ok: h.listResponse('Transactions, newest first.'),
      errors: T,
    }),
  },
  '/timeline/item/{rfId}': {
    get: h.operation({
      tag: 'Timelines',
      summary: 'The parties on one transaction',
      description: 'Skips the property list, which the timeline never draws.',
      params: [h.numericPathParam('rfId', 'Transaction (reel-frame) id.')],
      ok: h.objectResponse('Assignors, assignees, the assignment record and any release.'),
      errors: E,
    }),
  },
  '/timeline/standalone/{groupId}': {
    get: h.operation({
      tag: 'Timelines',
      summary: 'Points in one conveyance group',
      description:
        'Groups: 0 employee assignments, 1 acquisitions, 2 security and release, 3 everything '
        + 'else. This endpoint was unauthenticated in the legacy app and always served '
        + "organisation 11; it now requires a token and is scoped to the caller's organisation.",
      params: [h.numericPathParam('groupId', 'Conveyance group, 0-3.')],
      ok: h.jsonResponse('Points and the group colour.', {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object' } },
          className: { type: 'string', example: 'blue' },
        },
      }),
      errors: T,
    }),
  },
  '/timeline/standalone/filter/{groupId}/{startDate}/{endDate}/{scroll}': {
    get: h.operation({
      tag: 'Timelines',
      summary: 'A conveyance group over a date window',
      description:
        'Widens the window around the given range, narrowing it until the result is drawable.',
      params: [
        h.numericPathParam('groupId', 'Conveyance group, 0-3.'),
        h.pathParam('startDate', 'Window start.', { type: 'string', format: 'date', example: '2020-01-01' }),
        h.pathParam('endDate', 'Window end.', { type: 'string', format: 'date', example: '2020-12-31' }),
        h.pathParam('scroll', 'Which edge to walk: "right" or "left".', { type: 'string', enum: ['left', 'right'] }),
      ],
      ok: h.objectResponse('Items, assignors, assignees and the window extent.'),
      errors: T,
    }),
  },
  '/timeline/filter/search/{groupId}/{startDate}/{endDate}/{scroll}': {
    get: h.operation({
      tag: 'Timelines',
      summary: 'The searchable variant of the filtered timeline',
      description: 'Same window search; this variant encodes the scroll direction as 1 or 0.',
      params: [
        h.numericPathParam('groupId', 'Conveyance group, 0-3.'),
        h.pathParam('startDate', 'Window start.', { type: 'string', format: 'date', example: '2020-01-01' }),
        h.pathParam('endDate', 'Window end.', { type: 'string', format: 'date', example: '2020-12-31' }),
        h.pathParam('scroll', '1 scrolls right, anything else scrolls left.', { type: 'string', enum: ['0', '1'] }),
      ],
      ok: h.objectResponse('Bucketed parties, the window extent and the group labels.'),
      errors: T,
    }),
  },
  '/timeline/{groupId}': {
    get: h.operation({
      tag: 'Timelines',
      summary: 'Points on one activity tab',
      params: [h.numericPathParam('groupId', 'Activity tab id. Tab 8 draws surnames only.')],
      ok: h.objectResponse('Points and the tab colour.'),
      errors: T,
    }),
  },
  '/timeline/{organisation}/{name}/{depth}/{groupId}': {
    get: h.operation({
      tag: 'Timelines',
      summary: 'Drill into a company, party, transaction or asset',
      params: [
        h.pathParam('organisation', 'Company name, as recorded in the tenant database.'),
        h.pathParam('name', 'What to drill into: a party name, transaction id or asset number.'),
        h.numericPathParam('depth', '0 company, 1 party, 2 transaction, 3 asset.'),
        h.numericPathParam('groupId', 'Activity tab id. Tab 9 draws surnames only.'),
      ],
      ok: h.objectResponse('Points and the depth colour.'),
      errors: T,
      extraResponses: { 404: h.errorResponse('The company is unknown to this tenant.') },
    }),
  },

  /* ----------------------------------------------------------- icons */
  '/events_icons/': {
    get: h.operation({
      tag: 'Event icons',
      summary: 'Every event flag icon',
      description: 'About 430KB of markup. Prefer the single-icon endpoint where you can.',
      ok: h.jsonResponse('SVG markup keyed by event id.', {
        type: 'object', additionalProperties: { type: 'string' },
      }),
      errors: E,
    }),
  },
  '/events_icons/{eventId}': {
    get: h.operation({
      tag: 'Event icons',
      summary: 'One event flag icon',
      params: [h.numericPathParam('eventId', 'Event id. The set is not contiguous.')],
      ok: { description: 'The SVG.', content: { 'image/svg+xml': { schema: { type: 'string' } } } },
      errors: E,
      extraResponses: { 404: h.errorResponse('That event has no icon.') },
    }),
  },

  /* ------------------------------------------------------------ the spec */
  '/docs.json': {
    get: h.operation({
      tag: 'Docs',
      summary: 'This specification as JSON',
      ok: h.objectResponse('The OpenAPI document.'),
      errors: {},
      public: true,
    }),
  },
};
