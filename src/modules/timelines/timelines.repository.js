'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const { POINT_LIMIT } = require('./timelines.constants');

const app = () => connections.application;

// The party's display name: the normalised representative name when we have
// one, otherwise the name as recorded.
const PARTY_NAME = 'CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aaa.name END';
const PARTY_JOIN = `INNER JOIN assignor_and_assignee as aaa
       ON aaa.assignor_and_assignee_id = t.assignor_and_assignee_id
     LEFT JOIN representative as r ON r.representative_id = aaa.representative_id`;

/** GET / — the transaction list, filtered by date, company, tab and party. */
const list = ({ orgId, from, to, companies, tabs, parties, limit, offset }) => {
  const repl = { orgId };
  let sql = `SELECT rf_id AS id, exec_dt, original_name AS customerName,
                    tab AS tab_id, assets_count AS totalAssets
               FROM timeline WHERE organisation_id = :orgId`;

  if (from && to) {
    sql += ` AND exec_dt BETWEEN :from AND :to`;
    repl.from = from;
    repl.to = to;
  } else if (from) {
    sql += ` AND exec_dt >= :from`;
    repl.from = from;
  } else if (to) {
    sql += ` AND exec_dt <= :to`;
    repl.to = to;
  }

  if (companies.length) {
    sql += ` AND representative_id IN (:companies)`;
    repl.companies = companies;
  }
  if (tabs.length) {
    sql += ` AND tab IN (:tabs)`;
    repl.tabs = tabs;
  }
  if (parties.length) {
    sql += ` AND assignor_and_assignee_id IN (:parties)`;
    repl.parties = parties;
  }

  sql += ` ORDER BY exec_dt DESC`;
  if (limit !== null) {
    sql += ` LIMIT :limit OFFSET :offset`;
    repl.limit = limit;
    repl.offset = offset;
  }
  return q.selectAll(app(), sql, repl);
};

/** Points for one conveyance group, most recent first. */
const groupPoints = ({ orgId, conveyTypes, employerAssign }) =>
  q.selectAll(
    app(),
    `SELECT t.rf_id as id, SUBSTRING_INDEX(${PARTY_NAME}, " ", 1) as content,
            "point" as type, t.exec_dt as start
       FROM timeline as t ${PARTY_JOIN}
      WHERE organisation_id = :orgId AND convey_ty IN (:conveyTypes)
        AND employer_assign = :employerAssign
      GROUP BY rf_id ORDER BY t.exec_dt DESC LIMIT :limit`,
    { orgId, conveyTypes, employerAssign, limit: POINT_LIMIT }
  );

/** Points for one activity tab. */
const tabPoints = ({ orgId, tab, truncateNames }) =>
  q.selectAll(
    app(),
    `SELECT t.rf_id as id,
            ${truncateNames ? `SUBSTRING_INDEX(${PARTY_NAME}, " ", 1)` : PARTY_NAME} as content,
            t.exec_dt as start, "point" as type
       FROM timeline as t ${PARTY_JOIN}
      WHERE organisation_id = :orgId AND tab = :tab
      GROUP BY rf_id ORDER BY t.exec_dt DESC LIMIT :limit`,
    { orgId, tab, limit: POINT_LIMIT }
  );

/** How many recordings fall in one candidate window. */
const countInWindow = async ({ orgId, conveyTypes, employerAssign, startDate, endDate }) => {
  const row = await q.selectOne(
    app(),
    `SELECT count(t.rf_id) as counter FROM timeline as t ${PARTY_JOIN}
      WHERE organisation_id = :orgId AND convey_ty IN (:conveyTypes)
        AND employer_assign = :employerAssign AND exec_dt BETWEEN :startDate AND :endDate
      GROUP BY rf_id`,
    { orgId, conveyTypes, employerAssign, startDate, endDate }
  );
  return row ? Number(row.counter) : 0;
};

/** Full rows for a chosen window, as the standalone timeline renders them. */
const standaloneWindow = ({ orgId, conveyTypes, employerAssign, startDate, endDate }) =>
  q.selectAll(
    app(),
    `SELECT t.type, CONCAT(t.assignor_and_assignee_id, t.rf_id) as id, t.rf_id,
            aaa.name as raw_name, r.representative_name as normalize_name,
            t.convey_ty, t.employer_assign, t.exec_dt
       FROM timeline as t ${PARTY_JOIN}
      WHERE organisation_id = :orgId AND convey_ty IN (:conveyTypes)
        AND employer_assign = :employerAssign AND exec_dt BETWEEN :startDate AND :endDate
      ORDER BY t.exec_dt DESC`,
    { orgId, conveyTypes, employerAssign, startDate, endDate }
  );

/** Full rows for a chosen window, as the search timeline renders them. */
const searchWindow = ({ orgId, conveyTypes, employerAssign, startDate, endDate }) =>
  q.selectAll(
    app(),
    `SELECT t.rf_id as id, t.rf_id, t.type,
            SUBSTRING_INDEX(${PARTY_NAME}, " ", 1) as content,
            t.convey_ty, t.exec_dt as start, t.exec_dt
       FROM timeline as t ${PARTY_JOIN}
      WHERE organisation_id = :orgId AND convey_ty IN (:conveyTypes)
        AND employer_assign = :employerAssign AND exec_dt BETWEEN :startDate AND :endDate
      ORDER BY t.exec_dt DESC`,
    { orgId, conveyTypes, employerAssign, startDate, endDate }
  );

/* ------------------------------------------------------ drill-down levels */

// The drill-down queries alias the party table as `aa`, matching the legacy
// projection the client reads.
const DRILL_JOIN = `INNER JOIN assignor_and_assignee as aa
       ON aa.assignor_and_assignee_id = t.assignor_and_assignee_id
     LEFT JOIN representative as r ON r.representative_id = aa.representative_id`;
const DRILL_NAME = 'CASE WHEN r.representative_name <> null THEN r.representative_name ELSE aa.name END';

const drillPoints = ({ predicate, replacements, truncateNames }) =>
  q.selectAll(
    app(),
    `SELECT t.rf_id as id,
            ${truncateNames ? `SUBSTRING_INDEX(${DRILL_NAME}, " ", 1)` : DRILL_NAME} as content,
            "point" as type, t.exec_dt as start
       FROM timeline as t ${DRILL_JOIN}
      WHERE ${predicate} AND t.tab = :tab AND t.organisation_id = :orgId
        AND t.representative_id = :representativeId
      GROUP BY id ORDER BY start ASC`,
    replacements
  );

/** True when the number is a granted patent rather than an application. */
const isGrantNumber = (assetNumber) =>
  q.exists(app(), `SELECT 1 FROM documentid WHERE grant_doc_num = :assetNumber`, { assetNumber });

/** The caller's top-level company in their tenant database. */
const tenantCompany = (tenant, companyName) =>
  q.selectOne(
    tenant,
    `SELECT representative_id FROM representative
      WHERE parent_id = 0 AND (representative_name = :companyName OR original_name = :companyName)
      LIMIT 1`,
    { companyName }
  );

module.exports = {
  list,
  groupPoints,
  tabPoints,
  countInWindow,
  standaloneWindow,
  searchWindow,
  drillPoints,
  isGrantNumber,
  tenantCompany,
};
