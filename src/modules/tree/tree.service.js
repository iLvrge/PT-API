'use strict';

const repository = require('./tree.repository');
const { groupBy } = require('../../utils/collection');

// Tab id -> display label, as rendered by the portfolio tree.
const TAB_LABELS = [
  'Acquisitions', 'Sale', 'License In', 'License Out', 'Securities',
  'Merger In', 'Merger Out', 'Options', 'Court Orders', 'Employees', 'Other',
];

/**
 * The portfolio tree: tab -> counterparty -> transaction -> assets.
 *
 * The legacy route walked this with nested loops, issuing one query per
 * counterparty and one per transaction. Here the four levels are four reads and
 * the nesting happens in memory. It also fixes two ReferenceErrors in the
 * legacy inner loop (`rf_id` and `item`) that made the route throw whenever a
 * counterparty actually had transactions, and adds the missing organisation
 * filter on the tab totals, which previously summed across every tenant.
 */
const portfolio = async (orgId, representativeIds) => {
  if (!representativeIds.length) return [];

  const [totals, parties, transactions] = await Promise.all([
    repository.tabTotals(orgId, representativeIds),
    repository.parties(orgId, representativeIds),
    repository.transactions(orgId, representativeIds),
  ]);

  const rfIds = [...new Set(transactions.map((t) => t.rf_id))];
  const assets = await repository.assetsForTransactions(rfIds);

  const assetsByRfId = groupBy(assets, (a) => a.rf_id);
  const transactionsByParty = groupBy(transactions, (t) => `${t.tab_id}:${t.assignor_and_assignee_id}`);
  const partiesByTab = groupBy(parties, (p) => p.tab_id);

  return TAB_LABELS.map((label, tabId) => {
    const tabTotals = totals.filter((t) => Number(t.tab_id) === tabId);
    const children = (partiesByTab.get(tabId) || partiesByTab.get(`${tabId}`) || []).map((party) => ({
      label: `${party.name} (${party.transaction_count})`,
      id: party.id,
      children: (transactionsByParty.get(`${party.tab_id}:${party.id}`) || []).map((txn) => ({
        label: `${txn.exec_dt} (${txn.assets_count})`,
        rf_id: txn.rf_id,
        children: (assetsByRfId.get(txn.rf_id) || []).map((asset) => ({
          appno_doc_num: asset.appno_doc_num,
          grant_doc_num: asset.grant_doc_num,
        })),
      })),
    }));

    return {
      label,
      transaction_count: tabTotals.reduce((sum, t) => sum + Number(t.totalTransactions || 0), 0),
      assets_count: tabTotals.reduce((sum, t) => sum + Number(t.totalAssets || 0), 0),
      // Spelled as the client expects it.
      childeren: children,
    };
  });
};

module.exports = { portfolio, TAB_LABELS };
