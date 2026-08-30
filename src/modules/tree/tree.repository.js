'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const { chunk } = require('../../utils/collection');

// MySQL handles long IN lists, but a bounded batch keeps the packet and the
// optimizer's range list predictable.
const ID_BATCH = 1000;

/** Per-tab totals across the selected companies. */
const tabTotals = (orgId, representativeIds) =>
  q.selectAll(
    connections.application,
    `SELECT tab_id, representative_id,
            SUM(transaction_count) AS totalTransactions,
            SUM(assets_count) AS totalAssets
       FROM tree_parties
      WHERE organisation_id = :orgId AND representative_id IN (:representativeIds)
      GROUP BY tab_id, representative_id`,
    { orgId, representativeIds }
  );

/** Every counterparty on every tab, in one read (the legacy issued 11). */
const parties = (orgId, representativeIds) =>
  q.selectAll(
    connections.application,
    `SELECT tab_id, assignor_and_assignee_id AS id, name,
            SUM(transaction_count) AS transaction_count,
            SUM(assets_count) AS assets_count
       FROM tree_parties
      WHERE organisation_id = :orgId AND representative_id IN (:representativeIds)
      GROUP BY tab_id, representative_id, assignor_and_assignee_id`,
    { orgId, representativeIds }
  );

/** Every transaction under those counterparties, in one read. */
const transactions = (orgId, representativeIds) =>
  q.selectAll(
    connections.application,
    `SELECT tab_id, assignor_and_assignee_id, rf_id, exec_dt, assets_count
       FROM tree_parties_collection
      WHERE organisation_id = :orgId AND representative_id IN (:representativeIds)`,
    { orgId, representativeIds }
  );

/** The assets on a set of transactions, batched. */
const assetsForTransactions = async (rfIds) => {
  if (!rfIds.length) return [];
  const batches = await Promise.all(
    chunk(rfIds, ID_BATCH).map((ids) =>
      q.selectAll(
        connections.application,
        `SELECT rf_id, appno_doc_num, grant_doc_num FROM documentid WHERE rf_id IN (:ids)`,
        { ids }
      )
    )
  );
  return batches.flat();
};

module.exports = { tabTotals, parties, transactions, assetsForTransactions, ID_BATCH };
