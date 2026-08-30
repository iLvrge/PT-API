'use strict';

/**
 * Timeline query builders — a faithful port of the six GET /customers/timeline
 * branches, selected by layout. SQL transcribed from the legacy route with two
 * fixes: the " ANDdd. mode" typo that produced a syntax error for bank-mode
 * users on layout 26, and the duplicated companies condition in the default
 * branch (a no-op, removed). All joins here are INT or latin1-local; the only
 * collation handling is the explicit logo-join wrapper, kept verbatim.
 */

const { connections } = require('../../db');
const q = require('../../db/query');

// Shared tail: date window (explicit range or year floor) + grouping/limit.
const dateWindow = (start, end, column) =>
  start && end ? ` AND ${column} BETWEEN :start AND :end ` : ` AND date_format(${column}, '%Y') > :year `;

// dashboard_items applications for layout 34's pre-query.
const collateralizedAssets = async ({ companies, organisationId, layoutId, bankMode }) => {
  const rows = await q.selectAll(
    connections.applicationNew,
    `SELECT di.application FROM dashboard_items AS di
      WHERE di.organisation_id = :organisationId AND di.representative_id IN (:companies)
        AND di.type = :layoutId ${bankMode ? 'AND mode IN (:mode)' : ''}`,
    bankMode
      ? { organisationId, companies, layoutId, mode: 1 }
      : { organisationId, companies, layoutId }
  );
  return rows.map((r) => `${r.application}`);
};

// The law firm recorded on an rf_id (layout 40's optional filter).
const lawfirmFilterFor = (rfId) =>
  q.selectOne(
    connections.applicationNew,
    `SELECT cname, lf.name, rlf.representative_id, rlf.representative_name
       FROM db_uspto.correspondent AS c
       LEFT JOIN db_uspto.law_firm AS lf ON c.cname = lf.name
       LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id
      WHERE c.rf_id = :rfId LIMIT 1`,
    { rfId }
  );

// ---- branch builders: each returns { sql, repl } ----

const branchCollateralized = ({ companies, assets, start, end, organisationId }) => {
  const sql = `SELECT apt.rf_id as id, aor.exec_dt, release_rf_id, release_exec_dt, apt.full_match AS partial_transaction, all_release_ids, apt.total_assets AS releaseAssets, assign1.reel_no AS release_reel_no, assign1.frame_no AS release_frame_no, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS customerName, assignor_and_assignee.assignor_and_assignee_id AS name_id, representative.representative_id as repID, 5 AS tab_id, '' AS \`group\`, '' AS \`company\`, COUNT(DISTINCT doc.appno_doc_num) AS totalAssets FROM db_new_application.activity_parties_transactions AS apt LEFT JOIN db_uspto.assignment AS assign1 ON assign1.rf_id = apt.release_rf_id INNER JOIN db_uspto.documentid AS doc ON doc.rf_id = apt.rf_id INNER JOIN db_uspto.representative_assignment_conveyance AS rac ON rac.rf_id = apt.rf_id INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = apt.rf_id INNER JOIN db_uspto.assignee AS ee ON ee.rf_id = apt.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = ee.assignor_and_assignee_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL) AND apt.company_id IN (:companies) AND rac.convey_ty IN (:conveyTy) AND doc.appno_doc_num IN (:assets)${dateWindow(start, end, 'aor.exec_dt')} GROUP BY apt.rf_id ORDER BY aor.exec_dt DESC LIMIT 0, 500`;
  const repl = { organisationId, companies, conveyTy: ['security', 'restatedsecurity'], assets, year: 1999 };
  if (start && end) Object.assign(repl, { start, end });
  return { sql, repl };
};

const branchLawfirm = ({ companies, layoutId, bankMode, start, end, organisationId, firm }) => {
  let sql = `Select apt.rf_id as id, MAX(apt.exec_dt) AS exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, all_release_ids, total_assets AS releaseAssets, di.lawfirm, lf.law_firm_id AS name_id, rlf.representative_id AS repID, '' AS customerName, apt.activity_id AS tab_id, '' AS \`group\`, '' AS company, 0 AS totalAssets FROM db_new_application.activity_parties_transactions AS apt INNER JOIN db_new_application.dashboard_items AS di ON di.rf_id = apt.rf_id INNER JOIN db_uspto.correspondent AS c ON c.rf_id = apt.rf_id LEFT JOIN db_uspto.law_firm as lf ON c.cname = lf.name LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE (apt.organisation_id = :organisationId OR apt.organisation_id IS NULL) AND apt.company_id IN (:companies) AND di.organisation_id = :organisationId AND di.representative_id IN (:companies) AND di.type = :layoutId ${bankMode ? 'AND mode IN (:mode)' : ''}${dateWindow(start, end, 'apt.exec_dt')}`;
  const repl = { organisationId, companies, layoutId, year: 1999 };
  if (bankMode) repl.mode = 1;
  if (start && end) Object.assign(repl, { start, end });

  if (firm) {
    let tempQuery = `SELECT c.rf_id FROM db_uspto.correspondent AS c LEFT JOIN db_uspto.law_firm as lf ON c.cname = lf.name LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id WHERE c.rf_id IN (SELECT rf_id FROM db_new_application.activity_parties_transactions WHERE (organisation_id = :organisationId OR organisation_id IS NULL) AND company_id IN (:companies))`;
    if (firm.representative_id > 0) {
      tempQuery += ` AND rlf.representative_id = :representativeId`;
      repl.representativeId = firm.representative_id;
    } else {
      tempQuery += ` AND c.cname = :cname`;
      repl.cname = firm.cname;
    }
    tempQuery += ` GROUP BY c.rf_id`;
    sql += ` AND apt.rf_id IN (${tempQuery})`;
  }

  sql += ` GROUP BY apt.rf_id ORDER BY apt.exec_dt DESC LIMIT 0, 500`;
  return { sql, repl };
};

const branchInventors = ({ companies, customers, layoutId, bankMode, start, end, organisationId }) => {
  let sql = `Select di.application AS id, di.application, di.patent, IF (ag.appno_date = null, ap.appno_date, ag.appno_date) AS exec_dt, '' AS release_rf_id, '' AS release_exec_dt, 0 AS partial_transaction, '' AS all_release_ids, 0 AS releaseAssets, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS customerName, assignor_and_assignee.assignor_and_assignee_id AS name_id, representative.representative_id as repID, 10 AS tab_id, '' AS \`group\`, '' AS company, 0 AS totalAssets, GROUP_CONCAT(IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name)) AS all_inventors FROM db_new_application.dashboard_items AS di LEFT JOIN db_patent_application_bibliographic.application_grant AS ag ON ag.appno_doc_num = di.application LEFT JOIN db_patent_grant_bibliographic.application_publication AS ap ON ap.appno_doc_num = di.application INNER JOIN db_patent_application_bibliographic.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = di.assignor_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE di.organisation_id = :organisationId AND di.representative_id IN (:companies) AND di.type = :layoutId ${bankMode ? 'AND mode IN (:mode)' : ''}`;
  const repl = { organisationId, companies, layoutId, year: 1999 };
  if (bankMode) repl.mode = 1;
  if (customers.length) {
    sql += ` AND di.assignor_id IN (:customers)`;
    repl.customers = customers;
  }
  if (start && end) {
    sql += ` AND ((ag.appno_date BETWEEN :start AND :end) OR (ap.appno_date BETWEEN :start AND :end))`;
    Object.assign(repl, { start, end });
  } else {
    sql += ` AND (date_format(ag.appno_date, '%Y') > :year OR date_format(ap.appno_date, '%Y') > :year)`;
  }
  sql += ` GROUP BY di.application ORDER BY exec_dt DESC LIMIT 0, 500`;
  return { sql, repl };
};

const branchLenders = ({ companies, layoutId, bankMode, start, end, organisationId }) => {
  const sql = `SELECT assignment.rf_id as id, MAX(apt.exec_dt) AS exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, all_release_ids, total_assets AS releaseAssets, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS customerName, assignor_and_assignee.assignor_and_assignee_id AS name_id, representative.representative_id as repID, apt.activity_id AS tab_id, '' AS \`group\`, '' AS company, (SELECT count(asset) FROM (SELECT dd.appno_doc_num AS asset FROM db_uspto.documentid AS dd WHERE dd.rf_id = assignment.rf_id GROUP BY asset) AS temp) AS totalAssets FROM db_uspto.assignment INNER JOIN activity_parties_transactions AS apt ON apt.rf_id = assignment.rf_id INNER JOIN dashboard_items AS di ON assignment.rf_id = di.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = di.assignor_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE apt.activity_id IN (:activityId) AND di.organisation_id = :organisationId AND di.representative_id IN (:companies) AND di.type = :layoutId ${bankMode ? 'AND mode IN (:mode)' : ''}${dateWindow(start, end, 'apt.exec_dt')} GROUP BY assignment.rf_id ORDER BY apt.exec_dt DESC LIMIT 0, 500`;
  const repl = { organisationId, companies, layoutId, activityId: [5, 12], year: 1999 };
  if (bankMode) repl.mode = 1;
  if (start && end) Object.assign(repl, { start, end });
  return { sql, repl };
};

const branchGenericLayout = ({ companies, layoutId, bankMode, start, end, organisationId }) => {
  let sql = `SELECT assignment.rf_id as id, CASE WHEN representative_law_firm.representative_name <> '' THEN representative_law_firm.representative_name WHEN law_firm.name <> '' THEN law_firm.name ELSE correspondent.cname END AS recorded_by, assignment.record_dt, ${layoutId === 25 ? 'MIN(aor.exec_dt)' : 'MAX(aor.exec_dt)'} AS exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, all_release_ids, total_assets AS releaseAssets, ${layoutId === 26 ? 'assign1.reel_no AS release_reel_no, assign1.frame_no AS release_frame_no,' : ''} IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS customerName, GROUP_CONCAT(DISTINCT aor.or_name) AS assignors, assignor_and_assignee.assignor_and_assignee_id AS name_id, representative.representative_id as repID, apt.activity_id AS tab_id, '' AS company, `;
  if (layoutId === 26) {
    // legacy had " ANDdd. mode" here - a syntax error for bank mode; fixed.
    sql += `(SELECT count(asset) FROM (SELECT dd.application AS asset FROM db_new_application.dashboard_items AS dd WHERE dd.rf_id = assignment.rf_id AND type = :layoutId AND organisation_id = :organisationId ${bankMode ? 'AND dd.mode IN (:mode)' : ''} AND representative_id IN (:companies) GROUP BY asset) AS temp) AS totalAssets `;
  } else {
    sql += `(SELECT count(asset) FROM (SELECT dd.appno_doc_num AS asset FROM db_uspto.documentid AS dd WHERE dd.rf_id = assignment.rf_id GROUP BY asset) AS temp) AS totalAssets `;
  }
  sql += `FROM db_uspto.assignment INNER JOIN activity_parties_transactions AS apt ON apt.rf_id = assignment.rf_id ${layoutId === 26 ? 'LEFT JOIN db_uspto.assignment AS assign1 ON assign1.rf_id = apt.release_rf_id' : ''} INNER JOIN db_uspto.correspondent AS correspondent ON correspondent.rf_id = assignment.rf_id LEFT JOIN db_uspto.law_firm AS law_firm ON law_firm.name = correspondent.cname LEFT JOIN db_uspto.representative_law_firm AS representative_law_firm ON representative_law_firm.representative_id = law_firm.representative_id INNER JOIN db_uspto.assignee AS ass ON ass.rf_id = assignment.rf_id INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = assignment.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = ass.assignor_and_assignee_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE assignment.rf_id IN (SELECT rf_id FROM dashboard_items WHERE organisation_id = :organisationId ${bankMode ? 'AND mode IN (:mode)' : ''} AND representative_id IN (:companies) AND type = :layoutId GROUP BY rf_id)${dateWindow(start, end, 'aor.exec_dt')} GROUP BY assignment.rf_id ORDER BY aor.exec_dt DESC LIMIT 0, 500`;
  const repl = { organisationId, companies, layoutId, year: 1999 };
  if (bankMode) repl.mode = 1;
  if (start && end) Object.assign(repl, { start, end });
  return { sql, repl };
};

const branchDefault = ({ companies, tabs, customers, rfIds, exclude, start, end, organisationId }) => {
  let sql = `SELECT activity_parties_transactions.rf_id as id, CASE WHEN representative_law_firm.representative_name <> '' THEN representative_law_firm.representative_name WHEN law_firm.name <> '' THEN law_firm.name ELSE correspondent.cname END AS recorded_by, assignment.record_dt, activity_parties_transactions.exec_dt, release_rf_id, release_exec_dt, full_match AS partial_transaction, total_assets AS releaseAssets, all_release_ids, IF(representative.representative_name <> '', representative.representative_name, assignor_and_assignee.name) AS customerName, GROUP_CONCAT(DISTINCT aor.or_name) AS assignors, assignor_and_assignee.assignor_and_assignee_id AS name_id, representative.representative_id as repID, activity_id AS tab_id, (CASE WHEN (activity_id = 8 OR activity_id = 9 OR activity_id = 14) THEN 1 WHEN (activity_id = 5 OR activity_id = 11 OR activity_id = 12 OR activity_id = 13 OR activity_id = 16) THEN 2 WHEN (activity_id = 3 OR activity_id = 4) THEN 3 WHEN (activity_id = 1 OR activity_id = 2 OR activity_id = 6 OR activity_id = 7) THEN 4 WHEN (activity_id = 10) THEN 5 END) AS \`group\`, company_id AS \`company\`, (SELECT count(asset) FROM (SELECT dd.appno_doc_num AS asset FROM db_uspto.documentid AS dd WHERE dd.rf_id = activity_parties_transactions.rf_id GROUP BY asset) AS temp) AS totalAssets FROM activity_parties_transactions INNER JOIN db_uspto.assignment AS assignment ON activity_parties_transactions.rf_id = assignment.rf_id INNER JOIN db_uspto.correspondent AS correspondent ON correspondent.rf_id = assignment.rf_id LEFT JOIN db_uspto.law_firm AS law_firm ON law_firm.name = correspondent.cname LEFT JOIN db_uspto.representative_law_firm AS representative_law_firm ON representative_law_firm.representative_id = law_firm.representative_id INNER JOIN db_uspto.assignor AS aor ON aor.rf_id = assignment.rf_id INNER JOIN db_uspto.assignor_and_assignee AS assignor_and_assignee ON assignor_and_assignee.assignor_and_assignee_id = activity_parties_transactions.assignor_and_assignee_id LEFT JOIN db_uspto.representative AS representative ON representative.representative_id = assignor_and_assignee.representative_id WHERE (activity_parties_transactions.organisation_id = :organisationId OR activity_parties_transactions.organisation_id IS NULL)`;
  const repl = { organisationId, year: 1999 };

  if (companies.length) {
    sql += ` AND activity_parties_transactions.company_id IN (:companies)`;
    repl.companies = companies;
  }
  if (tabs.length) {
    sql += ` AND activity_parties_transactions.activity_id IN (:tabs)`;
    repl.tabs = tabs;
  }
  if ((tabs.length === 0 || !tabs.includes(10)) && exclude !== 'true') {
    sql += ` AND activity_parties_transactions.activity_id <> 10`;
  }
  if (customers.length) {
    sql += ` AND activity_parties_transactions.assignor_and_assignee_id IN (:customers)`;
    repl.customers = customers;
  }
  if (rfIds.length) {
    sql += ` AND activity_parties_transactions.rf_id IN (:rfIds)`;
    repl.rfIds = rfIds;
  }

  sql += `${dateWindow(start, end, 'aor.exec_dt')} GROUP BY activity_parties_transactions.rf_id ORDER BY exec_dt DESC LIMIT 0, 500`;
  if (start && end) Object.assign(repl, { start, end });
  return { sql, repl };
};

// Layout names whose timeline joins organisation logos (verbatim legacy wrapper).
const LOGO_LAYOUTS = new Set([
  'acquisition_transactions', 'divestitures_transactions', 'licensing_transactions',
  'collateralization_transactions', 'litigation_transactions', 'due_dilligence',
  'collaterlized', 'deflated_collaterals',
]);

const wrapWithLogos = (sql) => `
  SELECT temp.*, ao.logo_optimize AS logo
  FROM (${sql}) AS temp
  LEFT JOIN db_new_application.organisations AS ao
  ON ao.organisation_name COLLATE utf8mb4_general_ci = temp.customerName COLLATE utf8mb4_general_ci
  OR (REPLACE(REPLACE(ao.organisation_name, ',', ''), '.', '') COLLATE utf8mb4_general_ci =
      REPLACE(REPLACE(temp.customerName, ',', ''), '.', '') COLLATE utf8mb4_general_ci)
  OR (REPLACE(ao.organisation_name, 'Corporation', 'Corp') COLLATE utf8mb4_general_ci =
      REPLACE(temp.customerName, 'Corporation', 'Corp') COLLATE utf8mb4_general_ci)`;

const run = ({ sql, repl }) => q.selectAll(connections.applicationNew, sql, repl);

// ---- /timeline/filling_assets chain ----

const tenantRepresentativeNames = async (tenant, companyIds) => {
  const rows = await q.selectAll(
    tenant,
    `SELECT representative_name FROM representative WHERE company_id IN (:companyIds)`,
    { companyIds }
  );
  return rows.map((r) => r.representative_name).filter(Boolean);
};

const representativeIdsByNames = async (names) => {
  if (!names.length) return [];
  const rows = await q.selectAll(
    connections.applicationNew,
    `SELECT representative_id FROM db_uspto.representative
      WHERE representative_name IN (:names) GROUP BY representative_id`,
    { names }
  );
  return rows.map((r) => r.representative_id);
};

// Filed applications for the companies (biblio assignee join), newest first.
const fillingAssets = async ({ companyNames, representativeIds, start, end }) => {
  let inner = `SELECT a.appno_doc_num, ap.appno_date
    FROM db_patent_application_bibliographic.assignee AS a
    INNER JOIN db_patent_application_bibliographic.assignor_and_assignee AS aaa
            ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id
    INNER JOIN db_patent_grant_bibliographic.application_publication AS ap
            ON ap.appno_doc_num = a.appno_doc_num
    WHERE (aaa.name IN (:companyNames)`;
  if (representativeIds.length) inner += ` OR aaa.representative_id IN (:representativeIds)`;
  inner += `)`;

  let sql = `SELECT * FROM (${inner}) AS tempTable`;
  const repl = { companyNames, representativeIds };
  if (start && end) {
    sql += ` WHERE appno_date BETWEEN :start AND :end`;
    Object.assign(repl, { start, end });
  }
  sql += ` GROUP BY appno_doc_num`;
  if (start && end) sql += ` ORDER BY appno_date DESC`;
  sql += ` LIMIT 500`;

  const rows = await q.selectAll(connections.applicationNew, sql, repl);
  return rows.map((r) => `${r.appno_doc_num}`);
};

// Law-firm names on the dashboard (type 40) for the companies.
const lawfirmNames = async ({ companies, assignments, bankMode, organisationId }) => {
  let sql = `SELECT lawfirm FROM dashboard_items
    WHERE organisation_id = :organisationId AND representative_id IN (:companies) AND type = :type
    ${bankMode ? 'AND mode IN (:mode)' : ''}`;
  const repl = { organisationId, companies, type: 40 };
  if (bankMode) repl.mode = 1;
  if (assignments.length) {
    sql += ` AND rf_id IN (:assignments)`;
    repl.assignments = assignments;
  }
  sql += ` GROUP BY lawfirm`;
  const rows = await q.selectAll(connections.applicationNew, sql, repl);
  return rows.map((r) => `${r.lawfirm}`);
};

// Filing timeline rows for those firms over the filed applications.
const fillingLawfirmTimeline = ({ applications, lawfirmName, start, end }) => {
  let sql = `SELECT temp.*, IF(exec_dt IS NULL, another_exec_dt, exec_dt) AS exec_dt FROM (
    SELECT l.id, l.id AS name_id, l.id AS law_firm_id, l.name AS lawfirm, 0 AS repID, l.appno_doc_num,
      (SELECT appno_date FROM db_patent_grant_bibliographic.application_publication AS ap
        WHERE ap.appno_doc_num = l.appno_doc_num LIMIT 1) AS exec_dt,
      (SELECT appno_date FROM db_patent_application_bibliographic.application_grant AS ap
        WHERE ap.appno_doc_num = l.appno_doc_num LIMIT 1) AS another_exec_dt,
      '' AS release_rf_id, '' AS release_exec_dt, '' AS partial_transaction, '' AS all_release_ids,
      0 AS releaseAssets, '' AS customerName, 0 AS tab_id, '' AS 'group', '' AS company,
      0 AS asset, 1 AS type, '' AS patent, '' AS title
    FROM db_patent_application_bibliographic.lawfirm AS l
    WHERE l.appno_doc_num IN (:applications)
      AND (TRIM(BOTH '.' FROM l.name) IN (:lawfirmName) OR l.name IN (:lawfirmName))
    GROUP BY l.appno_doc_num) AS temp`;
  const repl = { applications, lawfirmName };
  if (start && end) {
    sql += ` WHERE exec_dt BETWEEN :start AND :end`;
    Object.assign(repl, { start, end });
  }
  sql += ` ORDER BY exec_dt DESC LIMIT 0, 500`;
  return q.selectAll(connections.applicationNew, sql, repl);
};

const titlesForApplications = (applications) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT MAX(appno_doc_num) AS application, MAX(grant_doc_num) AS patent, title
       FROM db_uspto.documentid WHERE appno_doc_num IN (:applications) GROUP BY appno_doc_num`,
    { applications }
  );

module.exports = {
  collateralizedAssets,
  lawfirmFilterFor,
  branchCollateralized,
  branchLawfirm,
  branchInventors,
  branchLenders,
  branchGenericLayout,
  branchDefault,
  LOGO_LAYOUTS,
  wrapWithLogos,
  run,
  tenantRepresentativeNames,
  representativeIdsByNames,
  fillingAssets,
  lawfirmNames,
  fillingLawfirmTimeline,
  titlesForApplications,
};
