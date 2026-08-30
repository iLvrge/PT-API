'use strict';

/**
 * Registers the simple admin list resources through the shared factory.
 * Paths and columns mirror the legacy admin_keywords.js routes exactly.
 */

const makeListModule = require('./list.factory');

const superKeywords = makeListModule({
  table: 'super_keyword',
  idColumn: 'super_keyword_id',
  nameColumn: 'super_keyword_name',
  basePath: '/super_keywords',
});

const state = makeListModule({
  table: 'state',
  idColumn: 'state_id',
  nameColumn: 'name',
  basePath: '/state',
});

const companyKeywords = makeListModule({
  table: 'company_keyword',
  idColumn: 'keyword_id',
  nameColumn: 'keyword_name',
  basePath: '/company_keywords',
});

module.exports = {
  routers: [superKeywords.router, state.router, companyKeywords.router],
  modules: { superKeywords, state, companyKeywords },
};
