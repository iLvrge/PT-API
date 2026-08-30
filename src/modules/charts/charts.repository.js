'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const QUERIES = require('./charts.queries');

// Top-level representative names from the tenant DB. Note: the legacy fallback
// referenced `orginal_name` (a typo) so it never applied; we use the intended
// `original_name` column here.
const listRepresentativeNames = async (tenant) => {
  const rows = await q.selectAll(
    tenant,
    `SELECT representative_name, original_name FROM representative WHERE parent_id = 0`
  );
  return rows.map((r) => (r.representative_name && r.representative_name !== '' ? r.representative_name : r.original_name));
};

const runChart = (type, names) => {
  const entry = QUERIES[type];
  if (!entry) return Promise.resolve(null);
  return q.selectAll(connections.application, entry.sql, { names, employerAssign: entry.employerAssign });
};

module.exports = { listRepresentativeNames, runChart, QUERIES };
