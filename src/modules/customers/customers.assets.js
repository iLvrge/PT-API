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

// The dashboard layouts (30/31/22/45, 38 and the other non-15 layouts) do not
// read the assets table at all: they project a derived table built from
// dashboard_items, which exposes only the columns its inner SELECT names - and
// no organisation_id. LIST_COLS therefore cannot be used over them; asking for
// assets.organisation_id there is "Unknown column 'assets.organisation_id' in
// 'field list'" and a 500 for every one of those layouts.
//
// So those branches spell their projection out and carry no STRING_COLUMNS
// placeholder, which makes countAndList's replace() a deliberate no-op for
// them. That is exactly what the legacy handler did: its dashboard branches
// were plain `SELECT * FROM (...) AS queryTemp`, never had the placeholder,
// and returned this same shape with no organisation_id.
const DERIVED_COLS = ` format_asset, asset, asset_type, appno_doc_num, grant_doc_num, child_count, channel `;

/**
 * Shared count-and-page runner over a STRING_COLUMNS template.
 *
 * The two run together rather than one after the other. Both evaluate the same
 * template, and for a customer of any size that template - not the COUNT, not
 * the LIMIT - is the whole cost: the All Assets list for the test customer
 * measured 11 s for the count and 12 s for the page, so the request took 23 s
 * to do 12 s of work. Overlapping them does not ask the database for anything
 * extra; it just stops the second query waiting for the first.
 *
 * The count used to short-circuit the page query when it came back zero. That
 * saved nothing worth having: a template matching no rows costs the same to
 * count as to page, so the skipped query was already the cheap case.
 */
const countAndList = async (template, repl, { column, direction, limit, offset }) => {
  let sql = template.replace('STRING_COLUMNS', LIST_COLS) + orderClause(column, direction);
  const pageRepl = { ...repl };
  if (parseInt(limit, 10) !== 0) {
    sql += ` LIMIT :offset, :limit`;
    pageRepl.offset = parseInt(offset, 10) || 0;
    pageRepl.limit = parseInt(limit, 10);
  }

  const [total, list] = await Promise.all([
    q.selectValue(
      connections.applicationNew,
      `SELECT COUNT(*) as total_records FROM (${template.replace('STRING_COLUMNS', COUNT_COLS)}) AS temp`,
      repl,
      'total_records',
      0
    ),
    q.selectAll(connections.applicationNew, sql, pageRepl),
  ]);

  if (!total) return { list: [], total_records: 0 };
  return { list, total_records: total };
};

/**
 * Every `x IN (SELECT ...)` in this file is written as a join instead.
 *
 * The legacy shapes nested two of them — `application IN (SELECT appno_doc_num
 * FROM db_uspto.documentid WHERE rf_id IN (SELECT rf_id FROM
 * activity_parties_transactions ...))` — over tables with tens of millions of
 * rows. MySQL materialises that into a temp table per outer row group, which on
 * this data is what takes the server down and kills the app with no error
 * anywhere. Driven as joins, the optimiser starts from
 * activity_parties_transactions' own index instead.
 *
 * Bound scalar lists (`IN (:companies)`, `IN (:customers)`) are left alone:
 * they are a handful of ids, they are not subqueries, and turning them into
 * derived VALUES tables would be slower and far less readable.
 */

/** Applications touched by a transaction involving the requested parties. */
const customerApplications = (scopeCompanies) => `
  SELECT did.appno_doc_num AS application
    FROM db_new_application.activity_parties_transactions AS apt
    INNER JOIN db_uspto.documentid AS did ON did.rf_id = apt.rf_id
   WHERE ( apt.organisation_id = :organisationID OR apt.organisation_id IS NULL )
     ${scopeCompanies ? 'AND apt.company_id IN (:companies)' : ''}
     AND apt.assignor_and_assignee_id IN (:customers)
   GROUP BY did.appno_doc_num`;

/** The two-customer inventor half, as a joinable set (verbatim COLLATEs). */
const inventorApplications = (bankMode) => `
  SELECT tempInventor.appno_doc_num COLLATE utf8mb4_0900_ai_ci AS application
    FROM (
      SELECT inventor.appno_doc_num, inventor.assignor_and_assignee_id
        FROM db_patent_application_bibliographic.inventor AS inventor
        INNER JOIN db_new_application.dashboard_items AS inventorItems
                ON inventorItems.application = inventor.appno_doc_num COLLATE utf8mb4_0900_ai_ci
               AND inventorItems.organisation_id = :organisationID
               AND inventorItems.type = :layoutID
               AND inventorItems.representative_id IN (:companies)
               ${bankMode ? 'AND inventorItems.mode IN (:mode)' : ''}
      UNION
      SELECT inventorNew.appno_doc_num, inventorNew.assignor_and_assignee_id
        FROM db_patent_grant_bibliographic.inventor_new AS inventorNew
        INNER JOIN db_new_application.dashboard_items AS inventorNewItems
                ON inventorNewItems.application = inventorNew.appno_doc_num COLLATE utf8mb4_0900_ai_ci
               AND inventorNewItems.organisation_id = :organisationID
               AND inventorNewItems.type = :layoutID
               AND inventorNewItems.representative_id IN (:companies)
               ${bankMode ? 'AND inventorNewItems.mode IN (:mode)' : ''}
    ) AS tempInventor
   WHERE tempInventor.assignor_and_assignee_id IN (:inventor)
   GROUP BY application`;

/**
 * The party filter over a dashboard_items query aliased `di`.
 * One customer joins straight through; the legacy two-customer form is
 * "customer OR inventor", so both sides become left joins and the OR moves to
 * the WHERE — still join-driven, still no IN subquery.
 */
const partyJoins = ({ split, bankMode, scopeCompanies }) => {
  const customer = `(${customerApplications(scopeCompanies)}) AS customerMatch ON customerMatch.application = di.application`;
  if (!split) return { joins: ` INNER JOIN ${customer} `, where: '' };
  return {
    joins: ` LEFT JOIN ${customer}
             LEFT JOIN (${inventorApplications(bankMode)}) AS inventorMatch ON inventorMatch.application = di.application `,
    where: ` AND ( customerMatch.application IS NOT NULL OR inventorMatch.application IS NOT NULL ) `,
  };
};

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
  // The IN / NOT IN trio here became one join and two anti-joins.
  const sql = `SELECT ma.asset, ma.asset_type, ma.channel, ma.appno_doc_num, ma.grant_doc_num, ma.grant_date,
      date_format(ma.payment_due, '%b %d, %Y') AS payment_due, date_format(ma.payment_grace, '%b %d, %Y') AS payment_grace,
      ma.type, ma.fee_code, ma.fee_amount, ma.fee_code_surcharge, ma.fee_surcharge, ma.remaining_year, ma.source,
      ma.fwd_citation, ma.technology, ma.child_count
    FROM maintainence_assets AS ma
    INNER JOIN dashboard_items AS dueItems
            ON dueItems.application COLLATE utf8mb4_0900_ai_ci = ma.appno_doc_num
           AND dueItems.organisation_id = :organisationID
           AND dueItems.representative_id IN (:representativeIDs)
           AND dueItems.type = 35
           ${bankMode ? 'AND dueItems.mode IN (:mode)' : ''}
    LEFT JOIN db_application.assets_transfer AS movedApplication
           ON movedApplication.appno_doc_num = ma.appno_doc_num
          AND movedApplication.appno_doc_num <> '' AND movedApplication.status = 0
          AND movedApplication.layout_id = :layoutID
          AND ( movedApplication.organisation_id = :organisationID OR movedApplication.organisation_id IS NULL )
    LEFT JOIN db_application.assets_transfer AS movedGrant
           ON movedGrant.grant_doc_num = ma.grant_doc_num
          AND movedGrant.appno_doc_num = '' AND movedGrant.grant_doc_num <> '' AND movedGrant.status = 0
          AND movedGrant.layout_id = :layoutID
          AND ( movedGrant.organisation_id = :organisationID OR movedGrant.organisation_id IS NULL )
    WHERE ma.company_id IN (:representativeIDs)
      AND ( ma.organisation_id = :organisationID OR ma.organisation_id IS NULL )
      AND movedApplication.appno_doc_num IS NULL AND movedGrant.grant_doc_num IS NULL
    GROUP BY ma.grant_doc_num, ma.appno_doc_num, ma.company_id` + orderClause(column, direction);
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

  let joins = '';
  let where = ` di.organisation_id = :organisationID `;
  where += layoutId === 45 ? `${bankMode ? 'AND di.mode IN (:mode)' : ''} ` : `AND di.type = :layoutID ${bankMode ? 'AND di.mode IN (:mode)' : ''} `;
  if (companies.length) where += ` AND di.representative_id IN (:companies) `;

  if (layoutId === 45) {
    // was: AND application NOT IN (SELECT application FROM dashboard_items ... AND type = 34)
    joins += ` LEFT JOIN db_new_application.dashboard_items AS collateralised
                      ON collateralised.application = di.application
                     AND collateralised.organisation_id = :organisationID
                     AND collateralised.type = 34
                     ${companies.length ? 'AND collateralised.representative_id IN (:companies)' : ''}
                     ${customers.length ? 'AND collateralised.assignor_id IN (:customers)' : ''}
                     ${bankMode ? 'AND collateralised.mode IN (:mode)' : ''} `;
    where += ` AND di.type = 30 AND collateralised.application IS NULL `;
  }
  if (customers.length) {
    const split = applyCustomerSplit(repl, customers);
    const party = partyJoins({ split, bankMode, scopeCompanies: companies.length > 0 });
    joins += party.joins;
    where += party.where;
  }

  const sql = `SELECT * FROM (SELECT STRING_COLUMNS_INNER
    FROM db_new_application.dashboard_items AS di ${joins}
    WHERE ${where} GROUP BY di.application) AS queryTemp `;

  // dashboard rows expose application/patent; adapt the shared column templates
  const template = sql.replace(
    'STRING_COLUMNS_INNER',
    `CASE WHEN di.patent = '' OR di.patent IS NULL THEN CONCAT(SUBSTRING(di.application, 1, 2), '/', FORMAT(SUBSTRING(di.application, 3), 0)) ELSE FORMAT(di.patent, 0) END AS format_asset,
     CASE WHEN di.patent = '' OR di.patent IS NULL THEN di.application ELSE di.patent END AS asset,
     CASE WHEN di.patent = '' OR di.patent IS NULL THEN 1 ELSE 0 END AS asset_type, di.application AS appno_doc_num, di.patent AS grant_doc_num, 0 AS child_count, '' AS channel`
  );
  return { template: `SELECT ${DERIVED_COLS} FROM (${template}) AS assets`, repl };
};

// ---- branch: lawfirm assets (layout 40) ----
const lawfirmAssets = async ({ companies, assignments, lawyers, layoutId, bankMode }) => {
  const repl = { organisationID: 0, layoutID: layoutId, date: 1999, companies };
  if (bankMode) repl.mode = 1;

  // The transactions whose documents this firm's assets hang off: either the
  // caller's explicit rf_id list, or the firm's own dashboard rows.
  let joins = ` INNER JOIN db_uspto.documentid AS firmDocs ON firmDocs.appno_doc_num = assets.appno_doc_num `;
  let itemsJoined = false;
  if (assignments.length) {
    repl.assignments = assignments;
    joins += ` AND firmDocs.rf_id IN (:assignments) `;
  } else {
    joins += ` INNER JOIN db_new_application.dashboard_items AS firmItems
                       ON firmItems.rf_id = firmDocs.rf_id
                      AND firmItems.organisation_id = :organisationID
                      AND firmItems.representative_id IN (:companies)
                      AND firmItems.type = :layoutID
                      ${bankMode ? 'AND firmItems.mode IN (:mode)' : ''} `;
    itemsJoined = true;
  }

  let firmWhere = '';
  if (lawyers > 0) {
    const firm = await q.selectOne(
      connections.applicationNew,
      `SELECT cname, lf.name, rlf.representative_id FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm as lf ON c.cname = lf.name LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id = :lawyers LIMIT 1`,
      { lawyers }
    );
    if (firm) {
      // was: AND lawfirm_id IN (SELECT lf.law_firm_id FROM law_firm ...), where
      // lawfirm_id is a dashboard_items column - so the firm filter hangs off
      // that join. (The legacy spliced this inside `rf_id IN ( :assignments ...`
      // when assignments were supplied, producing invalid SQL and a guaranteed
      // 500; joining dashboard_items for the filter is the coherent reading.)
      if (!itemsJoined) {
        joins += ` INNER JOIN db_new_application.dashboard_items AS firmItems
                           ON firmItems.rf_id = firmDocs.rf_id
                          AND firmItems.organisation_id = :organisationID `;
      }
      joins += ` INNER JOIN db_uspto.law_firm AS lawFirm ON lawFirm.law_firm_id = firmItems.lawfirm_id
                 LEFT JOIN db_uspto.representative_law_firm AS firmRep ON firmRep.representative_id = lawFirm.representative_id `;
      if (firm.representative_id > 0) {
        firmWhere = ` AND firmRep.representative_id = :representative_id `;
        repl.representative_id = firm.representative_id;
      } else {
        firmWhere = ` AND lawFirm.name = :name `;
        repl.name = firm.cname;
      }
    }
  }

  const sql = `SELECT STRING_COLUMNS FROM db_new_application.assets AS assets ${joins}
    WHERE ( assets.organisation_id = :organisationID OR assets.organisation_id IS NULL )
      AND assets.company_id IN (:companies) AND assets.layout_id = 15
      AND date_format(assets.appno_date, '%Y') > :date ${firmWhere}
    GROUP BY assets.appno_doc_num`;
  return { template: sql, repl };
};

// ---- branch: generic non-15 dashboard layouts ----
const genericDashboard = ({ layoutId, companies, customers, assignments, bankMode }) => {
  const repl = { organisationID: 0, layoutID: layoutId };
  if (bankMode) repl.mode = 1;
  if (companies.length) repl.companies = companies;

  if (layoutId === 38) {
    // The non-US family members of this company's granted patents. This used to
    // run familyGrantList first and splice its result back in as
    // `grant_doc_num IN (:assetList)` - thousands of numbers in one statement.
    // Joined to assets_family directly it is one query and no IN list.
    repl.familyType = 30;
    const template = `SELECT ${DERIVED_COLS} FROM (SELECT * FROM (SELECT CASE WHEN ag.grant_doc_num = '' OR ag.grant_doc_num IS NULL THEN CONCAT(SUBSTRING(ag.appno_doc_num, 1, 2), '/', FORMAT(SUBSTRING(ag.grant_doc_num, 3), 0)) ELSE FORMAT(ag.grant_doc_num, 0) END AS format_asset,
      CASE WHEN ag.grant_doc_num = '' OR ag.grant_doc_num IS NULL THEN ag.grant_doc_num ELSE ag.grant_doc_num END AS asset,
      CASE WHEN ag.grant_doc_num = '' OR ag.grant_doc_num IS NULL THEN 1 ELSE 0 END AS asset_type, ag.appno_doc_num, ag.grant_doc_num, 0 AS child_count, '' AS channel
      FROM db_patent_application_bibliographic.application_grant AS ag
      INNER JOIN (
        SELECT af.grant_doc_num
          FROM db_uspto.assets_family AS af
          INNER JOIN db_new_application.dashboard_items AS familyItems
                  ON familyItems.patent = af.grant_doc_num
                 AND familyItems.organisation_id = :organisationID
                 AND familyItems.representative_id IN (:companies)
                 AND familyItems.type = :familyType
                 ${bankMode ? 'AND familyItems.mode IN (:mode)' : ''}
         WHERE af.application_country NOT IN ('WO', 'US', 'EP')
         GROUP BY af.grant_doc_num
      ) AS family ON family.grant_doc_num = ag.grant_doc_num
      GROUP BY ag.grant_doc_num) AS inner1) AS assets`;
    return { template, repl };
  }

  let joins = '';
  let where = ` di.organisation_id = :organisationID AND di.type = :layoutID ${bankMode ? 'AND di.mode IN (:mode)' : ''} `;
  if (companies.length) where += ` AND di.representative_id IN (:companies) `;

  if (customers.length && (layoutId === 32 || layoutId === 33)) {
    const split = applyCustomerSplit(repl, customers);
    const party = partyJoins({ split, bankMode, scopeCompanies: true });
    joins += party.joins;
    where += party.where;
  } else if (customers.length) {
    const split = applyCustomerSplit(repl, customers);
    if (layoutId === 41) {
      // was: assignor_id IN (SELECT ... UNION SELECT ... WHERE representative_id IN (SELECT ...))
      const related = `(
        SELECT direct.assignor_and_assignee_id
          FROM db_uspto.assignor_and_assignee AS direct
         WHERE direct.assignor_and_assignee_id IN (:customers)
         UNION
        SELECT sibling.assignor_and_assignee_id
          FROM db_uspto.assignor_and_assignee AS seed
          INNER JOIN db_uspto.assignor_and_assignee AS sibling
                  ON sibling.representative_id = seed.representative_id
         WHERE seed.assignor_and_assignee_id IN (:customers) AND seed.representative_id > 0
      ) AS tempAssignorAndAssignee ON tempAssignorAndAssignee.assignor_and_assignee_id = di.assignor_id`;
      if (split) {
        joins += ` LEFT JOIN ${related}
                   LEFT JOIN (${inventorApplications(bankMode)}) AS inventorMatch ON inventorMatch.application = di.application `;
        where += ` AND ( tempAssignorAndAssignee.assignor_and_assignee_id IS NOT NULL OR inventorMatch.application IS NOT NULL ) `;
      } else {
        joins += ` INNER JOIN ${related} `;
      }
    } else if (split) {
      // assignor_id is a plain bound list here, so only the inventor half needs a join
      joins += ` LEFT JOIN (${inventorApplications(bankMode)}) AS inventorMatch ON inventorMatch.application = di.application `;
      where += ` AND ( di.assignor_id IN (:customers) OR inventorMatch.application IS NOT NULL ) `;
    } else {
      where += ` AND di.assignor_id IN (:customers) `;
    }
  }
  if (assignments.length) {
    repl.assignments = assignments;
    // was: AND application IN (SELECT appno_doc_num FROM db_uspto.documentid WHERE rf_id IN (:assignments))
    joins += ` INNER JOIN db_uspto.documentid AS assignmentDocs
                       ON assignmentDocs.appno_doc_num = di.application
                      AND assignmentDocs.rf_id IN (:assignments) `;
  }

  const sql = `SELECT * FROM (SELECT CASE WHEN di.patent = '' OR di.patent IS NULL THEN CONCAT(SUBSTRING(di.application, 1, 2), '/', FORMAT(SUBSTRING(di.application, 3), 0)) ELSE FORMAT(di.patent, 0) END AS format_asset,
    CASE WHEN di.patent = '' OR di.patent IS NULL THEN di.application ELSE TRIM(LEADING '0' FROM di.patent) END AS asset,
    CASE WHEN di.patent = '' OR di.patent IS NULL THEN 1 ELSE 0 END AS asset_type, di.application AS appno_doc_num, TRIM(LEADING '0' FROM di.patent) AS grant_doc_num, 0 AS child_count, '' AS channel
    FROM db_new_application.dashboard_items AS di ${joins}
    WHERE ${where} GROUP BY di.application) AS queryTemp `;
  return { template: `SELECT ${DERIVED_COLS} FROM (${sql}) AS assets`, repl };
};

// ---- branch: default layout 15 over the assets table ----
const defaultAssets = ({ companies, tabs, customers, assignments, bankMode }) => {
  const repl = { organisationID: 0, layoutID: 15, date: 1999 };
  if (bankMode) repl.mode = 1;
  if (companies.length) repl.companies = companies;
  if (tabs.length) repl.tabs = tabs;
  if (customers.length) repl.customers = customers;
  if (assignments.length) repl.assignments = assignments;

  // was: AND assets.appno_doc_num IN (SELECT appno_doc_num FROM db_uspto.documentid
  //      WHERE rf_id IN (SELECT rf_id FROM activity_parties_transactions ...))
  const filtered = assignments.length || tabs.length || customers.length;
  let transactionFilter = '';
  if (filtered) {
    transactionFilter = `
      ${companies.length ? 'AND apt.company_id IN (:companies)' : ''}
      ${assignments.length ? 'AND apt.rf_id IN (:assignments)' : ''}
      ${tabs.length ? 'AND apt.activity_id IN (:tabs)' : ''}
      ${customers.length ? 'AND apt.assignor_and_assignee_id IN (:customers)' : ''}`;
  } else if (tabs.length === 0) {
    transactionFilter = companies.length ? ' AND apt.company_id IN (:companies) ' : '';
  }
  // db_uspto.documentid is latin1, db_new_application.assets is
  // utf8mb4_0900_ai_ci. Joining them left MySQL to coerce the two implicitly,
  // which it does under utf8mb4's PAD SPACE rules rather than the assets
  // column's own NO PAD ones. Converting the derived side explicitly - never
  // the indexed column, see COLLATION.md - keeps the comparison the one the
  // assets column defines. Verified to select the same 3,997 assets.
  const joins = (filtered || tabs.length === 0)
    ? ` INNER JOIN (
          SELECT CONVERT(did.appno_doc_num USING utf8mb4) COLLATE utf8mb4_0900_ai_ci AS appno_doc_num
            FROM db_new_application.activity_parties_transactions AS apt
            INNER JOIN db_uspto.documentid AS did ON did.rf_id = apt.rf_id
           WHERE ( apt.organisation_id = :organisationID OR apt.organisation_id IS NULL )
             ${transactionFilter}
           GROUP BY did.appno_doc_num
        ) AS transactionMatch ON transactionMatch.appno_doc_num = assets.appno_doc_num `
    : '';

  /*
   * The assets table is reduced to one row per application before the join,
   * not after it.
   *
   * It holds one row per transaction that touched an asset — 57,949 rows for
   * the test customer's 4,273 applications — and joining it directly made
   * MySQL walk that whole fan-out and collapse it afterwards. Reducing first
   * and joining two small sets is the same answer for a fifth of the work:
   * the count went from 2.5 s to 0.5 s and the page from 3.2 s to 0.8 s.
   *
   * MAX(grant_doc_num) rather than a bare column: where an application was
   * granted partway through its transaction history, some of its rows carry
   * the grant number and the earlier ones are empty (7 applications here).
   * Ungrouped, the list showed that asset as granted or as pending depending
   * on which row the join happened to reach first, and it changed whenever the
   * plan did. MAX picks the grant number wherever one exists, which is what
   * the asset is. organisation_id needs no such treatment — the WHERE already
   * fixes it, and no application here carries two values.
   */
  const sql = `SELECT STRING_COLUMNS FROM (
      SELECT assets.organisation_id, assets.appno_doc_num,
             MAX(assets.grant_doc_num) AS grant_doc_num
        FROM db_new_application.assets AS assets
       WHERE date_format(assets.appno_date, '%Y') > :date AND assets.layout_id = :layoutID
         AND ( assets.organisation_id = :organisationID OR assets.organisation_id IS NULL )
         ${companies.length ? 'AND assets.company_id IN (:companies)' : ''}
       GROUP BY assets.appno_doc_num
    ) AS assets ${joins}`;
  return { template: sql, repl };
};

// familyGrantList used to run first for layout 38 and hand its result back as
// `grant_doc_num IN (:assetList)`. genericDashboard now joins assets_family
// directly, so the pre-query (and the thousands-long IN list) are both gone.

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
};
