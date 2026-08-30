'use strict';

const repository = require('./transactions.repository');

const EMPTY = Object.fromEntries(repository.SUMMED.map((column) => [column, 0]));

const counters = async (orgId, companies) => {
  const row = await repository.counters(orgId, companies);
  return row || { ...EMPTY };
};

/** Reshape a flat party row into the nested form the client already consumes. */
const toParty = (row) => ({
  name: row.name,
  assignor_and_assignee_id: row.assignor_and_assignee_id,
  assignor_and_assignee: row.party_name === null && row.id === null
    ? null
    : {
      name: row.party_name,
      id: row.id,
      representative: row.representative_name ? { name: row.representative_name } : null,
    },
});

/** Everything recorded against one transaction (rf_id). */
const detail = async (rfId) => {
  const [assigneeRows, assignorRows, assignment, patent] = await Promise.all([
    repository.assignees(rfId),
    repository.assignors(rfId),
    repository.assignment(rfId),
    repository.assets(rfId),
  ]);
  return {
    assignees: assigneeRows.map(toParty),
    assignors: assignorRows.map(toParty),
    assignments: assignment,
    patent,
  };
};

module.exports = { counters, detail, toParty, EMPTY };
