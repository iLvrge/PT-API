'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');

const COUNTERS = [
  'weekly_transactions', 'weekly_applications',
  'monthly_transactions', 'montly_applications',
  'quaterly_transactions', 'quaterly_applications',
];

/** The organisation's own display name, used when the caller sends none. */
const organisationName = (orgId) =>
  q.selectValue(
    connections.business,
    `SELECT name FROM organisation WHERE organisation_id = :orgId LIMIT 1`,
    { orgId },
    'name',
    null
  );

/** Resolve a top-level company in the caller's tenant database by either name. */
const findParentRepresentative = (tenant, name) =>
  q.selectOne(
    tenant,
    `SELECT representative_id FROM representative
      WHERE (original_name = :name OR representative_name = :name) AND parent_id = 0
      LIMIT 1`,
    { name }
  );

/** Update counters for one company. */
const forRepresentative = (orgId, representativeId) =>
  q.selectOne(
    connections.application,
    `SELECT ${COUNTERS.join(', ')} FROM \`update\`
      WHERE organisation_id = :orgId AND representative_id = :representativeId LIMIT 1`,
    { orgId, representativeId }
  );

/** Update counters summed across every company in the organisation. */
const forOrganisation = (orgId) =>
  q.selectOne(
    connections.application,
    `SELECT ${COUNTERS.map((c) => `SUM(${c}) AS ${c}`).join(', ')} FROM \`update\`
      WHERE organisation_id = :orgId GROUP BY organisation_id`,
    { orgId }
  );

module.exports = { organisationName, findParentRepresentative, forRepresentative, forOrganisation, COUNTERS };
