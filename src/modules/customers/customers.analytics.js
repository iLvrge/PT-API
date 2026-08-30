'use strict';

/**
 * Analytics POST queries — ports of /asset_types/assets/agents, /assets/family
 * and /inventors/location. SQL transcribed from legacy; grouped-by-name/year
 * row shapes preserved (agents returns raw rows, family/inventors return
 * Google-Charts arrays headed ['Country','Assets']).
 */

const { connections } = require('../../db');
const q = require('../../db/query');

// Law firm names for a set of rf_ids (agents' optional filter, dedup like legacy).
const lawfirmNamesForRfIds = async (rfIds) => {
  const rows = await q.selectAll(
    connections.applicationNew,
    `SELECT cname, lf.name, rlf.representative_id, rlf.representative_name
       FROM db_uspto.correspondent AS c
       LEFT JOIN db_uspto.law_firm AS lf ON c.cname = lf.name
       LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id
      WHERE c.rf_id IN (:rfIds)`,
    { rfIds }
  );
  const names = [];
  for (const item of rows) {
    if (item.name && !names.includes(item.name)) names.push(item.name);
    if (item.name) names.push(item.name); // legacy pushed twice; harmless in IN()
    if (item.representative_name && !names.includes(item.representative_name)) {
      names.push(item.representative_name);
    }
  }
  return names;
};

const lawfirmForRf = (rfId) =>
  q.selectOne(
    connections.applicationNew,
    `SELECT cname, lf.name, rlf.representative_id, rlf.representative_name
       FROM db_uspto.correspondent AS c
       LEFT JOIN db_uspto.law_firm AS lf ON c.cname = lf.name
       LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = lf.representative_id
      WHERE c.rf_id = :rfId LIMIT 1`,
    { rfId }
  );

// data_type 1: filings per law firm per year over the asset set.
const agentsFilling = ({ assets, lawfirms, checkMode, bankMode, companies, year }) => {
  let sql;
  if (checkMode) {
    sql = `SELECT name, year, COUNT(appno_doc_num) AS counter FROM (
      SELECT name, appno_doc_num, appYear AS year FROM (
        SELECT l.name, l.appno_doc_num, date_format(ap.appno_date, '%Y') AS appYear
          FROM db_patent_application_bibliographic.lawfirm AS l
          LEFT JOIN db_patent_grant_bibliographic.application_publication AS ap ON ap.appno_doc_num = l.appno_doc_num
         WHERE l.appno_doc_num <> ''`;
  } else {
    sql = `SELECT name, year, COUNT(appno_doc_num) AS counter FROM (
      SELECT name, appno_doc_num, appYear AS year FROM (
        SELECT l.name, l.appno_doc_num, date_format(ap.appno_date, '%Y') AS appYear
          FROM db_patent_application_bibliographic.lawfirm AS l
          LEFT JOIN db_patent_grant_bibliographic.application_publication AS ap ON ap.appno_doc_num = l.appno_doc_num
         WHERE (TRIM(BOTH '.' FROM l.name) IN (
                 SELECT lawfirm FROM db_new_application.dashboard_items
                  WHERE organisation_id = :organisationID AND representative_id = :company_id
                    ${bankMode ? 'AND mode IN (:mode)' : ''} AND type = :lawfirmType GROUP BY lawfirm)
             OR l.name IN (
                 SELECT lawfirm FROM db_new_application.dashboard_items
                  WHERE organisation_id = :organisationID AND representative_id = :company_id
                    ${bankMode ? 'AND mode IN (:mode)' : ''} AND type = :lawfirmType GROUP BY lawfirm))`;
  }
  const repl = { organisationID: 0, company_id: companies, lawfirmType: 40, assets, year };
  if (bankMode) repl.mode = 1;
  if (lawfirms && lawfirms.length) {
    sql += ` AND (TRIM(BOTH '.' FROM l.name) IN (:lawfirms) OR l.name IN (:lawfirms))`;
    repl.lawfirms = lawfirms;
  }
  sql += ` AND l.appno_doc_num IN (:assets) AND date_format(ap.appno_date, '%Y') > :year) AS tempData
    ) AS temp GROUP BY name, year`;
  return q.selectAll(connections.application, sql, repl);
};

// data_type 3: lenders per year (activity 5/12/11/13), optional customer expansion.
const agentsLenders = ({ companies, bankMode, customers, year }) => {
  let sql = `SELECT name, year, COUNT(rf_id) AS counter FROM (
    Select IF(r.representative_name <> '', r.representative_name, aaa.name) AS name,
           date_format(apt.exec_dt, '%Y') AS year, apt.rf_id
      from db_new_application.activity_parties_transactions AS apt
      INNER JOIN db_uspto.representative_assignment_conveyance as cor ON cor.rf_id = apt.rf_id
      INNER JOIN db_new_application.dashboard_items AS di ON di.rf_id = apt.rf_id
      INNER JOIN db_uspto.assignor_and_assignee AS aaa ON aaa.assignor_and_assignee_id = di.assignor_id
      LEFT JOIN db_uspto.representative AS r ON r.representative_id = aaa.representative_id
     Where (apt.organisation_id = :organisationID OR apt.organisation_id IS NULL)
       AND apt.company_id = :company_id AND date_format(apt.exec_dt, '%Y') > :year
       AND di.organisation_id = :organisationID AND di.representative_id = :company_id
       ${bankMode ? 'AND di.mode IN (:mode)' : ''} AND di.type = :ownedType AND apt.activity_id IN (:activity_id)`;
  const repl = { organisationID: 0, company_id: companies, ownedType: 41, activity_id: [5, 12, 11, 13], year };
  if (bankMode) repl.mode = 1;
  if (customers.length) {
    repl.customers = customers;
    sql += ` AND assignor_id IN (SELECT assignor_and_assignee_id FROM (
        SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id = :customers
        UNION
        SELECT assignor_and_assignee_id FROM db_uspto.assignor_and_assignee WHERE representative_id IN (
          SELECT representative_id FROM db_uspto.assignor_and_assignee WHERE assignor_and_assignee_id = :customers
        )) AS tempParties)`;
  }
  sql += ` GROUP BY cor.convey_ty, apt.rf_id) AS temp GROUP BY name, year`;
  return q.selectAll(connections.application, sql, repl);
};

// default: law-firm recordings per year; three sub-variants (assets IN, by
// assignments' conveyance, or by company with optional firm filter).
const agentsRecordings = ({ variant, assets, assignments, companies, ownedType, bankMode, firmFilter, year }) => {
  const repl = { organisationID: 0, company_id: companies, lawfirmType: 40, ownedType, year };
  if (bankMode) repl.mode = 1;
  let sql;

  if (variant === 'assets') {
    repl.assets = assets;
    sql = `SELECT name, year, COUNT(DISTINCT rf_id) AS counter FROM (
      Select IF(MAX(rlf.representative_name) <> '', MAX(rlf.representative_name), l.name) AS name, di.rf_id,
             date_format(MAX(apt.exec_dt), '%Y') AS year
        from db_new_application.activity_parties_transactions AS apt
        INNER JOIN db_new_application.dashboard_items AS di ON di.rf_id = apt.rf_id
        INNER JOIN db_uspto.correspondent as cor ON cor.rf_id = apt.rf_id
        INNER JOIN db_uspto.law_firm AS l ON l.name = cor.cname
        LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = l.representative_id
       Where di.application IN (:assets) ${bankMode ? 'AND di.mode IN (:mode)' : ''}
         AND date_format(apt.exec_dt, '%Y') > :year`;
  } else if (variant === 'assignments') {
    repl.assignments = assignments;
    return q.selectAll(
      connections.application,
      `SELECT name, year, COUNT(rf_id) AS counter FROM (
        Select CASE WHEN cor.convey_ty = 'assignment' THEN 'Acquisitions'
                    WHEN cor.convey_ty = 'correct' THEN 'Corrections'
                    WHEN cor.convey_ty = 'employee' THEN 'Employees'
                    ELSE cor.convey_ty END AS name,
               date_format(MAX(apt.exec_dt), '%Y') AS year, apt.rf_id
          from db_new_application.activity_parties_transactions AS apt
          INNER JOIN db_uspto.representative_assignment_conveyance as cor ON cor.rf_id = apt.rf_id
         Where cor.rf_id IN (:assignments) AND (apt.organisation_id = :organisationID OR apt.organisation_id IS NULL)
           AND apt.company_id = :company_id AND date_format(apt.exec_dt, '%Y') > :year
         GROUP BY cor.convey_ty, apt.rf_id) AS temp GROUP BY name, year`,
      repl
    );
  } else {
    sql = `SELECT name, year, COUNT(DISTINCT rf_id) AS counter FROM (
      Select IF(MAX(rlf.representative_name) <> '', MAX(rlf.representative_name), l.name) AS name, di.rf_id,
             date_format(MAX(apt.exec_dt), '%Y') AS year
        from db_new_application.activity_parties_transactions AS apt
        INNER JOIN db_new_application.dashboard_items AS di ON di.rf_id = apt.rf_id
        INNER JOIN db_uspto.correspondent as cor ON cor.rf_id = apt.rf_id
        INNER JOIN db_uspto.law_firm AS l ON l.name = cor.cname
        LEFT JOIN db_uspto.representative_law_firm AS rlf ON rlf.representative_id = l.representative_id
       Where (apt.organisation_id = :organisationID OR apt.organisation_id IS NULL)
         AND apt.company_id = :company_id AND di.organisation_id = :organisationID
         AND di.representative_id IN (:company_id) ${bankMode ? 'AND di.mode IN (:mode)' : ''}
         AND date_format(apt.exec_dt, '%Y') > :year
         AND di.type = ${ownedType === 25 ? ':ownedType' : ':lawfirmType'}`;
    if (firmFilter) {
      if (firmFilter.representative_id > 0) {
        sql += ` AND l.representative_id IN (:lrepresentative)`;
        repl.lrepresentative = firmFilter.representative_id;
      } else {
        sql += ` AND l.name IN (:lname)`;
        repl.lname = firmFilter.cname;
      }
    }
  }
  sql += ` GROUP BY di.rf_id) AS temp where name IS NOT NULL GROUP BY name, year`;
  return q.selectAll(connections.application, sql, repl);
};

// family: grant sets feeding the country distribution
const biblioGrantsForApps = async (list, year) => {
  const rows = await q.selectAll(
    connections.application,
    `SELECT ag.grant_doc_num FROM db_patent_application_bibliographic.application_grant AS ag
      WHERE ag.appno_doc_num IN (:list) AND date_format(ag.appno_date, '%Y') > :year
      GROUP BY ag.grant_doc_num`,
    { list, year }
  );
  return rows.map((r) => `${r.grant_doc_num}`);
};

const unionGrantsForApps = async (list, year) => {
  const rows = await q.selectAll(
    connections.application,
    `SELECT * FROM (
      SELECT grant_doc_num FROM db_uspto.documentid
       WHERE appno_doc_num IN (:list) AND grant_doc_num <> '' AND date_format(appno_date, '%Y') > :year
       GROUP BY grant_doc_num
      UNION
      SELECT grant_doc_num FROM db_patent_application_bibliographic.application_grant
       WHERE appno_doc_num IN (:list) AND grant_doc_num <> '' AND date_format(appno_date, '%Y') > :year
       GROUP BY grant_doc_num) AS tempAssets GROUP BY grant_doc_num`,
    { list, year }
  );
  return rows.map((r) => `${r.grant_doc_num}`);
};

// country distribution over a grant set (family variant counts per application+country)
const familyCountries = (list, year) =>
  q.selectAll(
    connections.application,
    `SELECT name, COUNT(application_country) AS number FROM (
      SELECT grant_doc_num, application_number, application_country, cwc.name AS name
        FROM db_uspto.assets_family AS af
        INNER JOIN db_uspto.country_with_codes AS cwc ON cwc.country_code = af.application_country
       WHERE grant_doc_num IN (:list) AND application_country NOT IN ('WO', 'EP')
       GROUP BY application_number, application_country) AS temp GROUP BY name`,
    { list, year }
  );

// inventors/location: same shape but grants resolved inline from documentid
// and grouped only by application_number (legacy difference).
const inventorCountries = (list, year) =>
  q.selectAll(
    connections.application,
    `SELECT name, COUNT(application_country) AS number FROM (
      SELECT grant_doc_num, application_number, application_country, cwc.name AS name
        FROM db_uspto.assets_family AS af
        INNER JOIN db_uspto.country_with_codes AS cwc ON cwc.country_code = af.application_country
       WHERE grant_doc_num IN (
         SELECT grant_doc_num FROM db_uspto.documentid
          WHERE appno_doc_num IN (:list) AND grant_doc_num <> '' AND date_format(appno_date, '%Y') > :year
          GROUP BY grant_doc_num)
         AND application_country NOT IN ('WO', 'EP')
       GROUP BY application_number) AS temp GROUP BY name`,
    { list, year }
  );

module.exports = {
  lawfirmNamesForRfIds,
  lawfirmForRf,
  agentsFilling,
  agentsLenders,
  agentsRecordings,
  biblioGrantsForApps,
  unionGrantsForApps,
  familyCountries,
  inventorCountries,
};
