'use strict';

/**
 * GET /customers/:layout/assets — the largest legacy handler, ported as branch
 * builders sharing one count/order/limit skeleton. SQL transcribed verbatim
 * (including the existing COLLATE coercions on the inventor-union and
 * maintenance subqueries). Sort columns are allowlisted (the legacy spliced
 * them raw - the F7 injection). PTAB's ownedAssets filter compared literal
 * strings ('appellantPatentNumber') instead of values - fixed.
 */

const { connections } = require('../../db');
const q = require('../../db/query');
const { identifier, direction: dirOf } = require('../../db/query');

const SORT_COLUMNS = ['asset', 'asset_type', 'format_asset', 'appno_doc_num', 'grant_doc_num', 'grant_date', 'payment_due', 'payment_grace', 'remaining_year', 'fee_amount'];

const orderClause = (column, direction) => {
  const col = identifier(column, SORT_COLUMNS, 'asset');
  const dir = dirOf(direction);
  return col === 'asset'
    ? ` ORDER BY asset_type ASC, ABS(${col}) ${dir} `
    : ` ORDER BY asset_type ASC, ${col} ${dir} `;
};

const COUNT_COLS = ` CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN assets.appno_doc_num ELSE assets.grant_doc_num END AS asset `;

const LIST_COLS = `assets.organisation_id,
  CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN CONCAT(SUBSTRING(assets.appno_doc_num, 1, 2), '/', FORMAT(SUBSTRING(assets.appno_doc_num, 3), 0)) ELSE FORMAT(assets.grant_doc_num, 0) END AS format_asset,
  CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN assets.appno_doc_num ELSE assets.grant_doc_num END AS asset,
  CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type, assets.appno_doc_num, assets.grant_doc_num, 0 AS child_count, '' AS channel `;

// Shared count-then-page runner over a STRING_COLUMNS template.
const countAndList = async (template, repl, { column, direction, limit, offset }) => {
  const total = await q.selectValue(
    connections.applicationNew,
    `SELECT COUNT(*) as total_records FROM (${template.replace('STRING_COLUMNS', COUNT_COLS)}) AS temp`,
    repl,
    'total_records',
    0
  );
  if (!total) return { list: [], total_records: 0 };

  let sql = template.replace('STRING_COLUMNS', LIST_COLS) + orderClause(column, direction);
  const pageRepl = { ...repl };
  if (parseInt(limit, 10) !== 0) {
    sql += ` LIMIT :offset, :limit`;
    pageRepl.offset = parseInt(offset, 10) || 0;
    pageRepl.limit = parseInt(limit, 10);
  }
  const list = await q.selectAll(connections.applicationNew, sql, pageRepl);
  return { list, total_records: total };
};

// The two-customer inventor-union fragment (verbatim COLLATEs).
const inventorUnion = (bankMode) => ` OR application IN ( SELECT appno_doc_num COLLATE utf8mb4_0900_ai_ci FROM (
  Select appno_doc_num, assignor_and_assignee_id from db_patent_application_bibliographic.inventor
  where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
    select application FROM db_new_application.dashboard_items
    WHERE organisation_id = :organisationID AND type = :layoutID
      AND representative_id IN (:companies) ${bankMode ? 'AND mode IN (:mode)' : ''})
  UNION
  Select appno_doc_num, assignor_and_assignee_id from db_patent_grant_bibliographic.inventor_new
  where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
    select application FROM db_new_application.dashboard_items
    WHERE organisation_id = :organisationID AND type = :layoutID
      AND representative_id IN (:companies) ${bankMode ? 'AND mode IN (:mode)' : ''})) AS tempInventor
  where assignor_and_assignee_id IN (:inventor)))`;

// customers.length === 2 means [customerId, inventorId] in the legacy contract.
const applyCustomerSplit = (repl, customers) => {
  if (customers.length === 2) {
    repl.customers = customers[0];
    repl.inventor = customers[1];
    return true;
  }
  repl.customers = customers;
  return false;
};

// ---- branch: other_mode (assets for sale / licence) ----
const forSale = async ({ otherMode, bankMode, column, direction, limit, offset }) => {
  const repl = { organisationID: 0, type: otherMode === 1 ? 2 : otherMode === 3 ? 4 : 0 };
  if (bankMode) repl.mode = 1;

  const total = await q.selectValue(
    connections.applicationNew,
    `SELECT COUNT(*) as total_records FROM (SELECT ${COUNT_COLS} FROM db_new_application.assets_for_sale AS assets
      WHERE (organisation_id = :organisationID OR organisation_id IS NULL) AND type = :type
      ${bankMode ? 'AND mode IN (:mode)' : ''} GROUP BY appno_doc_num) AS temp`,
    repl,
    'total_records',
    0
  );
  if (!total) return { list: [], total_records: 0 };

  let sql = `SELECT assets.organisation_id, organisation.name,
    CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN CONCAT(SUBSTRING(assets.appno_doc_num, 1, 2), '/', FORMAT(SUBSTRING(assets.appno_doc_num, 3), 0)) ELSE FORMAT(assets.grant_doc_num, 0) END AS format_asset,
    CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN assets.appno_doc_num ELSE assets.grant_doc_num END AS asset,
    CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type, assets.appno_doc_num, assets.grant_doc_num, 0 AS child_count, '' AS channel
    FROM db_new_application.assets_for_sale AS assets
    INNER JOIN db_business.organisation AS organisation ON organisation.organisation_id = assets.organisation_id
    WHERE organisation.organisation_id = :organisationID AND type = :type` + orderClause(column, direction);
  if (parseInt(limit, 10) !== 0) {
    sql += ` LIMIT :offset, :limit`;
    repl.offset = parseInt(offset, 10) || 0;
    repl.limit = parseInt(limit, 10);
  }
  const list = await q.selectAll(connections.applicationNew, sql, repl);
  return { list, total_records: total };
};

// ---- branch: maintenance (layout 3) ----
const maintenance = async ({ companies, bankMode, column, direction }) => {
  const sql = `SELECT asset, asset_type, channel, appno_doc_num, grant_doc_num, grant_date, date_format(payment_due, '%b %d, %Y') AS payment_due, date_format(payment_grace, '%b %d, %Y') AS payment_grace, type, fee_code, fee_amount, fee_code_surcharge, fee_surcharge, remaining_year, source, fwd_citation, technology, child_count FROM maintainence_assets WHERE company_id IN (:representativeIDs) AND ( organisation_id = :organisationID OR organisation_id IS NULL ) AND appno_doc_num IN (SELECT application COLLATE utf8mb4_0900_ai_ci FROM dashboard_items where organisation_id = :organisationID AND representative_id IN (:representativeIDs) ${bankMode ? 'AND mode IN (:mode)' : ''} AND type = 35 GROUP BY application) AND appno_doc_num NOT IN (SELECT appno_doc_num FROM db_application.assets_transfer WHERE appno_doc_num <> '' AND status = 0 AND layout_id = :layoutID AND ( organisation_id = :organisationID OR organisation_id IS NULL )) AND grant_doc_num NOT IN (SELECT grant_doc_num FROM db_application.assets_transfer WHERE appno_doc_num = '' AND grant_doc_num <> '' AND status = 0 AND layout_id = :layoutID AND ( organisation_id = :organisationID OR organisation_id IS NULL )) GROUP BY grant_doc_num, appno_doc_num, company_id` + orderClause(column, direction);
  const repl = { representativeIDs: companies, organisationID: 0, layoutID: 3 };
  if (bankMode) repl.mode = 1;
  const list = await q.selectAll(connections.applicationNew, sql, repl);
  return { list, total_records: list.length };
};

// ---- branch: PTAB (layout 37) ----
const tenantCompanyName = (tenant, companies) =>
  q.selectValue(tenant, `SELECT representative_name FROM representative WHERE company_id IN (:companies) LIMIT 1`, { companies }, 'representative_name', null);

const ownedApplications = async ({ companies, bankMode }) => {
  const repl = { organisationID: 0, selectedCompanies: companies, type: 30 };
  if (bankMode) repl.mode = 1;
  const rows = await q.selectAll(
    connections.applicationNew,
    `SELECT application FROM dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:selectedCompanies) ${bankMode ? 'AND mode IN (:mode)' : ''} AND type = :type AND application <> '' GROUP BY application`,
    repl
  );
  return rows.map((r) => `${r.application}`);
};

const fetchPtabProceedings = async (company) => {
  const base = `https://developer.uspto.gov/ptab-api/proceedings?patentOwnerName=%22${company.replace(/ /g, '%20')}%22`;
  const first = await fetch(`${base}&recordTotalQuantity=1`).then((r) => r.json());
  const total = parseInt(first.recordTotalQuantity, 10) || 0;
  if (!total) return [];
  if (total === 1) return first.results || [];
  const full = await fetch(`${base}&recordTotalQuantity=${first.recordTotalQuantity}`).then((r) => r.json());
  return full.results || [];
};

const ptabDocuments = ({ number, otherNumber, orgId, column, direction }) => {
  let sql = `SELECT ${orgId} AS organisation_id, CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN CONCAT(SUBSTRING(assets.appno_doc_num, 1, 2), '/', FORMAT(SUBSTRING(assets.appno_doc_num, 3), 0)) ELSE FORMAT(assets.grant_doc_num, 0) END AS format_asset,
    CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN assets.appno_doc_num ELSE assets.grant_doc_num END AS asset,
    CASE WHEN assets.grant_doc_num = '' OR assets.grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type, assets.appno_doc_num, assets.grant_doc_num, 0 AS child_count, '' AS channel FROM db_uspto.documentid AS assets WHERE `;
  const repl = {};
  if (number.length) {
    sql += ` assets.grant_doc_num IN (:number)`;
    repl.number = number;
  }
  if (otherNumber.length) {
    if (number.length) sql += ` OR `;
    sql += ` assets.appno_doc_num IN (:other_number)`;
    repl.other_number = otherNumber;
  }
  sql += ` GROUP BY assets.appno_doc_num` + orderClause(column, direction);
  return q.selectAll(connections.applicationNew, sql, repl);
};

// ---- branch: owned dashboard layouts (30/31/22 and 45) ----
const ownedDashboard = ({ layoutId, companies, customers, bankMode }) => {
  const repl = { organisationID: 0, layoutID: layoutId };
  if (bankMode) repl.mode = 1;
  if (companies.length) repl.companies = companies;

  let sql = `SELECT * FROM (SELECT STRING_COLUMNS_INNER FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID `;
  sql += layoutId === 45 ? `${bankMode ? 'AND mode IN (:mode)' : ''} ` : `AND type = :layoutID ${bankMode ? 'AND mode IN (:mode)' : ''} `;
  if (companies.length) sql += ` AND representative_id IN (:companies) `;
  if (layoutId === 45) {
    sql += ` AND type = 30 AND application NOT IN (SELECT application FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:companies) ${customers.length ? 'AND assignor_id IN (:customers)' : ''} ${bankMode ? 'AND mode IN (:mode)' : ''} AND type = 34 GROUP BY application) `;
  }
  if (customers.length) {
    const split = applyCustomerSplit(repl, customers);
    sql += ` AND ${split ? '(' : ''} application IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id IN ( SELECT apt.rf_id FROM db_new_application.activity_parties_transactions AS apt WHERE ( apt.organisation_id = :organisationID OR apt.organisation_id IS NULL ) ${companies.length ? 'AND company_id IN (:companies)' : ''} AND apt.assignor_and_assignee_id IN (:customers) GROUP BY apt.rf_id ) GROUP BY documentid.appno_doc_num) `;
    if (split) sql += inventorUnion(bankMode);
  }
  sql += ` GROUP BY application) AS queryTemp `;

  // dashboard rows expose application/patent; adapt the shared column templates
  const template = sql.replace(
    'STRING_COLUMNS_INNER',
    `CASE WHEN patent = '' OR patent IS NULL THEN CONCAT(SUBSTRING(application, 1, 2), '/', FORMAT(SUBSTRING(application, 3), 0)) ELSE FORMAT(patent, 0) END AS format_asset,
     CASE WHEN patent = '' OR patent IS NULL THEN application ELSE patent END AS asset,
     CASE WHEN patent = '' OR patent IS NULL THEN 1 ELSE 0 END AS asset_type, application AS appno_doc_num, patent AS grant_doc_num, 0 AS child_count, '' AS channel`
  );
  return { template: `SELECT STRING_COLUMNS FROM (${template}) AS assets`, repl };
};

// ---- branch: lawfirm assets (layout 40) ----
const lawfirmAssets = async ({ companies, assignments, lawyers, layoutId, bankMode }) => {
  const repl = { organisationID: 0, layoutID: layoutId, date: 1999, companies };
  if (bankMode) repl.mode = 1;

  let sql = `SELECT STRING_COLUMNS FROM db_new_application.assets AS assets WHERE ( organisation_id = :organisationID OR organisation_id IS NULL ) and company_id IN (:companies) and layout_id = 15 AND date_format(assets.appno_date, '%Y') > :date AND appno_doc_num IN ( select appno_doc_num from db_uspto.documentid where rf_id IN (`;
  if (assignments.length) {
    sql += ` :assignments `;
    repl.assignments = assignments;
  } else {
    sql += ` SELECT rf_id FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:companies) AND type = :layoutID ${bankMode ? 'AND mode IN (:mode)' : ''}`;
  }

  if (lawyers > 0) {
    const firm = await q.selectOne(
      connections.applicationNew,
      `SELECT cname, lf.name, rlf.representative_id FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm as lf ON c.cname = lf.name LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id = :lawyers LIMIT 1`,
      { lawyers }
    );
    if (firm) {
      let tempQuery = `SELECT lf.law_firm_id FROM db_uspto.law_firm as lf LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE `;
      if (firm.representative_id > 0) {
        tempQuery += ` rlf.representative_id = :representative_id`;
        repl.representative_id = firm.representative_id;
      } else {
        tempQuery += ` lf.name = :name`;
        repl.name = firm.cname;
      }
      tempQuery += ` GROUP BY lf.law_firm_id`;
      sql += ` AND lawfirm_id IN (${tempQuery}) `;
    }
  }
  sql += ` )) GROUP BY appno_doc_num`;
  return { template: sql, repl };
};

// ---- branch: generic non-15 dashboard layouts ----
const genericDashboard = ({ layoutId, companies, customers, assignments, bankMode, familyList }) => {
  const repl = { organisationID: 0, layoutID: layoutId };
  if (bankMode) repl.mode = 1;
  if (companies.length) repl.companies = companies;

  if (layoutId === 38) {
    repl.assetList = familyList;
    const template = `SELECT STRING_COLUMNS FROM (SELECT * FROM (SELECT CASE WHEN grant_doc_num = '' OR grant_doc_num IS NULL THEN CONCAT(SUBSTRING(appno_doc_num, 1, 2), '/', FORMAT(SUBSTRING(grant_doc_num, 3), 0)) ELSE FORMAT(grant_doc_num, 0) END AS format_asset,
      CASE WHEN grant_doc_num = '' OR grant_doc_num IS NULL THEN grant_doc_num ELSE grant_doc_num END AS asset,
      CASE WHEN grant_doc_num = '' OR grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type, appno_doc_num, grant_doc_num, 0 AS child_count, '' AS channel FROM db_patent_application_bibliographic.application_grant WHERE grant_doc_num IN (:assetList) GROUP BY grant_doc_num) AS inner1) AS assets`;
    return { template, repl };
  }

  let sql = `SELECT * FROM (SELECT CASE WHEN patent = '' OR patent IS NULL THEN CONCAT(SUBSTRING(application, 1, 2), '/', FORMAT(SUBSTRING(application, 3), 0)) ELSE FORMAT(patent, 0) END AS format_asset,
    CASE WHEN patent = '' OR patent IS NULL THEN application ELSE TRIM(LEADING '0' FROM patent) END AS asset,
    CASE WHEN patent = '' OR patent IS NULL THEN 1 ELSE 0 END AS asset_type, application AS appno_doc_num, TRIM(LEADING '0' FROM patent) AS grant_doc_num, 0 AS child_count, '' AS channel FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND type = :layoutID ${bankMode ? 'AND mode IN (:mode)' : ''} `;
  if (companies.length) sql += ` AND representative_id IN (:companies) `;

  if (customers.length && (layoutId === 32 || layoutId === 33)) {
    const split = applyCustomerSplit(repl, customers);
    sql += ` AND ${split ? '(' : ''} application IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id IN ( SELECT apt.rf_id FROM db_new_application.activity_parties_transactions AS apt WHERE ( apt.organisation_id = :organisationID OR apt.organisation_id IS NULL ) AND apt.company_id IN (:companies) AND apt.assignor_and_assignee_id IN (:customers) GROUP BY apt.rf_id ) GROUP BY documentid.appno_doc_num) `;
    if (split) sql += inventorUnion(bankMode);
  } else if (customers.length) {
    const split = applyCustomerSplit(repl, customers);
    sql += ` AND ${split ? '(' : ''}`;
    if (layoutId === 41) {
      sql += ` assignor_id IN ( SELECT assignor_and_assignee_id FROM ( SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id IN (:customers) UNION SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE representative_id IN (SELECT representative_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id IN (:customers) AND representative_id > 0)) As tempAssignorAndAssignee GROUP BY assignor_and_assignee_id ) `;
    } else {
      sql += ` assignor_id IN (:customers) `;
    }
    if (split) sql += inventorUnion(bankMode);
  }
  if (assignments.length) {
    repl.assignments = assignments;
    sql += ` AND application IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id IN ( :assignments ) GROUP BY documentid.appno_doc_num) `;
  }
  sql += ` GROUP BY application) AS queryTemp `;
  return { template: `SELECT STRING_COLUMNS FROM (${sql}) AS assets`, repl };
};

// ---- branch: default layout 15 over the assets table ----
const defaultAssets = ({ companies, tabs, customers, assignments, bankMode }) => {
  const repl = { organisationID: 0, layoutID: 15, date: 1999 };
  if (bankMode) repl.mode = 1;
  if (companies.length) repl.companies = companies;
  if (tabs.length) repl.tabs = tabs;
  if (customers.length) repl.customers = customers;
  if (assignments.length) repl.assignments = assignments;

  let sql = `SELECT STRING_COLUMNS FROM db_new_application.assets AS assets WHERE date_format(assets.appno_date, '%Y') > :date AND assets.layout_id = :layoutID AND ( assets.organisation_id = :organisationID OR assets.organisation_id IS NULL ) `;
  if (companies.length) sql += ` AND assets.company_id IN (:companies)`;

  if (assignments.length || tabs.length || customers.length) {
    sql += ` AND assets.appno_doc_num IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id IN ( SELECT apt.rf_id FROM db_new_application.activity_parties_transactions AS apt WHERE ( apt.organisation_id = :organisationID OR apt.organisation_id IS NULL ) `;
    if (companies.length) sql += ` AND apt.company_id IN (:companies) `;
    if (assignments.length) sql += ` AND apt.rf_id IN (:assignments)`;
    if (tabs.length) sql += ` AND apt.activity_id IN (:tabs)`;
    if (customers.length) sql += ` AND apt.assignor_and_assignee_id IN (:customers)`;
    sql += ` GROUP BY apt.rf_id ) GROUP BY documentid.appno_doc_num) `;
  } else if (tabs.length === 0) {
    sql += ` AND assets.appno_doc_num IN ( SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id IN ( SELECT apt.rf_id FROM db_new_application.activity_parties_transactions AS apt WHERE ( apt.organisation_id = :organisationID OR apt.organisation_id IS NULL ) `;
    if (companies.length) sql += ` AND apt.company_id IN (:companies) `;
    sql += ` GROUP BY apt.rf_id ) GROUP BY documentid.appno_doc_num) `;
  }
  sql += ` GROUP BY appno_doc_num`;
  return { template: sql, repl };
};

const familyGrantList = async ({ companies, bankMode }) => {
  const repl = { organisationID: 0, companies, type: 30 };
  if (bankMode) repl.mode = 1;
  const rows = await q.selectAll(
    connections.applicationNew,
    `SELECT grant_doc_num FROM db_uspto.assets_family AS af WHERE grant_doc_num IN ( SELECT patent FROM db_new_application.dashboard_items WHERE organisation_id = :organisationID AND representative_id IN (:companies) AND type = :type ${bankMode ? 'AND mode IN (:mode)' : ''} GROUP BY patent ) AND application_country NOT IN ('WO', 'US', 'EP') GROUP BY grant_doc_num`,
    repl
  );
  return rows.map((r) => `${r.grant_doc_num}`);
};

module.exports = {
  orderClause,
  countAndList,
  forSale,
  maintenance,
  tenantCompanyName,
  ownedApplications,
  fetchPtabProceedings,
  ptabDocuments,
  ownedDashboard,
  lawfirmAssets,
  genericDashboard,
  defaultAssets,
  familyGrantList,
};
