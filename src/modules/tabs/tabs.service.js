'use strict';

const q = require('../../db/query');
const repository = require('./tabs.repository');

const parsePage = (limit, offset) => {
  if (limit === undefined || limit === null) return {};
  return {
    limit: limit > 0 ? parseInt(limit, 10) : 100,
    offset: offset > 0 ? parseInt(offset, 10) : 0,
  };
};

// GET /tabs/:tabID — companies on a tab with customer + asset totals.
const companies = async (tenant, orgId, tabId) => {
  const list = await q.selectAll(tenant, `SELECT representative_id FROM representative WHERE type = 0`);
  const ids = list.map((r) => r.representative_id);
  if (!ids.length) return [];

  const [parties, totals] = await Promise.all([
    repository.companiesOnTab(ids, orgId, tabId),
    repository.assetTotalsByCompany(ids, orgId, tabId),
  ]);
  const totalById = new Map(totals.map((t) => [t.representative_id, t.totalAssets]));
  return parties.map((p) => ({ ...p, totalAssets: totalById.get(p.id) || 0 }));
};

// GET /tabs/:tabID/companies/:companyID
const companyCustomers = (orgId, tabId, representativeId, limit, offset) =>
  repository.companyCustomers({ representativeId, orgId, tabId, ...parsePage(limit, offset) });

// GET /tabs/:tabID/customers — grouped by name with normalised transaction counts.
const customers = async (orgId, tabId, companyIds, limit, offset) => {
  const list = await repository.customersByName({ companies: companyIds, orgId, tabId, ...parsePage(limit, offset) });
  const out = [];
  for (const customer of list) {
    const idRows = await repository.idsForName(customer.name, companyIds, orgId, tabId);
    const ids = idRows.map((r) => r.assignor_and_assignee_id);
    if (!ids.length) continue;
    const transactionCount = await repository.transactionCountForIds(companyIds, orgId, tabId, ids);
    out.push({ ...customer, transactionCount, assetsCount: 0 });
  }
  return out;
};

// GET /tabs/:tabID/companies/:companyID/customers/:customerID
const customerTransactions = async (orgId, tabId, representativeIds, customerId, limit, offset) => {
  const nameRows = await repository.customerNames(customerId);
  let customerIds = [customerId];
  if (nameRows.length) {
    const names = [];
    const repIds = [];
    for (const item of nameRows) {
      names.push(item.name);
      if (item.representative_id > 0) {
        repIds.push(item.representative_id);
        if (!names.includes(item.representative_name)) names.push(item.representative_name);
      }
    }
    const expanded = await repository.customerIdsFor({ names, representativeIds: repIds });
    if (expanded.length) customerIds = expanded.map((r) => r.assignor_and_assignee_id);
  }
  const page = parsePage(limit ?? 100, offset ?? 0);
  return repository.customerTransactions({ orgId, representativeIds, customerIds, tabId, ...page });
};

// GET .../transactions/:rfID
const transactionAssets = (rfId, limit, offset) =>
  repository.transactionAssets({ rfId, ...parsePage(limit, offset) });

module.exports = { companies, companyCustomers, customers, customerTransactions, transactionAssets };
