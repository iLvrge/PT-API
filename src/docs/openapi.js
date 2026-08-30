'use strict';

/**
 * The OpenAPI 3.0 document, served interactively at GET /docs and as JSON at
 * GET /docs.json.
 *
 * The paths are split per surface under ./paths so each file stays readable.
 * tests/integration/docs-coverage.test.js walks the live Express router and
 * fails if any mounted route is missing here, so the spec cannot silently fall
 * behind the code.
 */

const core = require('./paths/core');
const admin = require('./paths/admin');
const crud = require('./paths/crud');
const users = require('./paths/users');
const company = require('./paths/company');
const customers = require('./paths/customers');
const dashboards = require('./paths/dashboards');
const documents = require('./paths/documents');
const portfolio = require('./paths/portfolio');

const errorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        requestId: { type: 'string', description: 'Echoes the X-Request-Id header.' },
        details: {
          type: 'array',
          description: 'Present on validation failures; names each offending field.',
          items: {
            type: 'object',
            properties: { field: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
  },
};

const schemas = {
  Error: errorSchema,

  Credentials: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: { type: 'string', example: 'user@example.com' },
      password: { type: 'string', format: 'password' },
    },
  },

  AuthToken: {
    type: 'object',
    properties: {
      auth: { type: 'boolean' },
      accessToken: { type: 'string', description: 'Paste this into the Authorize dialog.' },
      message: { type: 'string' },
    },
  },

  Profile: {
    type: 'object',
    properties: {
      user_id: { type: 'integer' },
      first_name: { type: 'string' },
      last_name: { type: 'string' },
      email_address: { type: 'string', format: 'email' },
      organisation_id: { type: 'integer' },
      organisation_name: { type: 'string' },
    },
  },

  User: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      first_name: { type: 'string' },
      last_name: { type: 'string' },
      email_address: { type: 'string', format: 'email' },
      job_title: { type: 'string' },
      type: { type: 'integer', description: '0 manager, 1 member, 9 admin.' },
      status: { type: 'integer' },
    },
  },

  NewUser: {
    type: 'object',
    required: ['first_name', 'email_address', 'password', 'type'],
    properties: {
      first_name: { type: 'string' },
      last_name: { type: 'string', description: 'Optional; stored as "" when omitted.' },
      email_address: { type: 'string', format: 'email' },
      password: { type: 'string', format: 'password', minLength: 6 },
      job_title: { type: 'string' },
      type: { type: 'integer', enum: [0, 1] },
    },
  },

  ListItem: {
    type: 'object',
    properties: { id: { type: 'integer' }, keyword: { type: 'string' } },
  },
  ListItemInput: {
    type: 'object',
    required: ['keyword'],
    properties: { keyword: { type: 'string' } },
  },

  AddressInput: {
    type: 'object',
    properties: {
      representative_id: { type: 'integer', description: 'For company addresses.' },
      lawfirm_id: { type: 'integer', description: 'For law firm addresses.' },
      street_address: { type: 'string' },
      suite: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      country: { type: 'string' },
      zip_code: { type: 'string' },
      telephone: { type: 'string' },
    },
  },

  ProfessionalInput: {
    type: 'object',
    properties: {
      first_name: { type: 'string' },
      last_name: { type: 'string' },
      email_address: { type: 'string', format: 'email' },
      telephone: { type: 'string' },
      linkedin_url: { type: 'string' },
      firm_id: { type: 'integer' },
      type: { type: 'integer' },
    },
  },

  ActivityInput: {
    type: 'object',
    properties: {
      subject: { type: 'string' },
      comment: { type: 'string' },
      subject_type: { type: 'integer' },
      professional_id: { type: 'integer' },
      document_id: { type: 'integer' },
      complete: { type: 'integer' },
      upload_file: { type: 'string', format: 'binary' },
    },
  },

  Illustration: {
    type: 'object',
    description: 'The box-and-connector graph the front end draws for one assignment.',
    properties: {
      box: { type: 'array', items: { type: 'object' }, description: 'Party boxes.' },
      connection: { type: 'array', items: { type: 'object' }, description: 'Connectors.' },
      line: { type: 'array', items: { type: 'object' }, description: 'The connectors again, under the key the client reads.' },
      all_boxes: { type: 'array', items: { type: 'object' } },
      legend: { type: 'array', items: { type: 'object' } },
      box_menu: { type: 'object' },
      general: { type: 'object' },
      popup: { type: 'array', items: { type: 'object' } },
    },
  },
};

const tags = [
  { name: 'Health', description: 'Liveness and readiness probes.' },
  { name: 'Auth', description: 'Sign in here first, then Authorize with the returned token.' },
  { name: 'Profile', description: 'The signed-in user.' },
  { name: 'Users', description: 'Users inside the caller organisation.' },
  { name: 'Admin users', description: 'Cross-organisation user management. Admin only.' },
  { name: 'Admin lists', description: 'Keyword, state and company-keyword lists. Admin only.' },
  { name: 'Admin tree', description: 'Corporate-structure upload. Admin only.' },
  { name: 'Companies', description: 'The company portfolio.' },
  { name: 'Tabs', description: 'Activity tabs: companies, counterparties, transactions, assets.' },
  { name: 'Tree', description: 'The portfolio tree.' },
  { name: 'Customers', description: 'The portfolio explorer.' },
  { name: 'Dashboards', description: 'Portfolio metrics and their share links.' },
  { name: 'Documents', description: 'Google Drive integration and the tenant document store.' },
  { name: 'Documents (pending)', description: 'Declared but answering 501 until the reporting tier is ported.' },
  { name: 'Timelines', description: 'Transaction timelines and drill-downs.' },
  { name: 'Illustrations', description: 'Assignment diagrams.' },
  { name: 'Share', description: 'Public share links. Reachable with only a code.' },
  { name: 'Search', description: 'Entity and transaction search.' },
  { name: 'Counters', description: 'Validity, transaction and update counters.' },
  { name: 'Addresses', description: 'Company addresses.' },
  { name: 'Telephone', description: 'Company telephone numbers.' },
  { name: 'Law firms', description: 'Law firms and their addresses.' },
  { name: 'Categories', description: 'Product categories and products.' },
  { name: 'Collections', description: 'Saved company collections.' },
  { name: 'Professionals', description: 'Professional contacts.' },
  { name: 'Comments', description: 'Comments on activities and other subjects.' },
  { name: 'Activities', description: 'Activity log.' },
  { name: 'Selections', description: 'Per-user saved selections.' },
  { name: 'Charts', description: 'Chart series.' },
  { name: 'Event icons', description: 'Event flag SVGs.' },
  { name: 'Docs', description: 'This specification.' },
];

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'PatenTrack API (v2)',
    version: '2.0.0',
    description: [
      'Layered rewrite of the PatenTrack API: routes → controller → service → repository,',
      'with raw SQL for reads and Sequelize models for writes.',
      '',
      '**To test an endpoint:** call `POST /signin`, copy `accessToken` from the response,',
      'press **Authorize** above and paste it. Every operation except Health, sign-in and the',
      'Share endpoints needs that token.',
      '',
      'Endpoints tagged *Documents (pending)* answer 501 — they depend on the reporting tier,',
      'which has not been ported yet. They are listed so nothing looks silently missing.',
      '',
      'Array parameters are JSON encoded as strings, e.g. `companies=[9,10]`, matching what the',
      'existing client sends.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'This host' }],
  tags,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'The accessToken returned by POST /signin.',
      },
    },
    schemas,
  },
  security: [{ bearerAuth: [] }],
  paths: {
    ...core,
    ...admin,
    ...crud,
    ...users,
    ...company,
    ...customers,
    ...dashboards,
    ...documents,
    ...portfolio,
  },
};

module.exports = openapi;
