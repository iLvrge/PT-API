'use strict';

/**
 * Asset-set resolvers shared by the analytics POSTs — ports of the legacy
 * helpers findFilterAssets and findFillingAssets (both variants), returning
 * plain arrays of application-number strings.
 */

const { connections } = require('../../db');
const q = require('../../db/query');
const { findLayout } = require('./customers.constants');

const DEFAULT_YEAR_FLOOR = () => new Date().getFullYear() - 24; // connection.DEFAULT_YEAR

/**
 * Port of helpers.findFilterAssets. `fType` mirrors the legacy second argument:
 * when absent AND tabs is an empty array, the exclude-employees subquery is
 * added to the assets branch.
 */
const filterAssets = async ({
  list, total, type, companies, tabs, customers, assignments,
  dataType, otherMode, sale, license, orgId, orgType, fType,
}) => {
  const bankMode = orgType === 2;
  const where = { year: DEFAULT_YEAR_FLOOR(), organisationID: 0, otherORGID: orgId };
  if (bankMode) where.mode = 1;
  if (companies.length) where.company_id = companies;

  let sql = '';
  if (dataType === 1) {
    sql = `SELECT appno_doc_num FROM owned_assets
      WHERE (organisation_id = :organisationID OR organisation_id IS NULL) AND company_id IN (:company_id)`;
  } else if (parseInt(total, 10) !== list.length || list.length === 0) {
    if (otherMode === 'true' || sale !== undefined || license !== undefined) {
      sql = `SELECT appno_doc_num FROM db_new_application.assets_for_sale AS assets
        WHERE assets.organisation_id = :otherORGID`;
      if (sale !== undefined || license !== undefined) {
        sql += ` AND type = :saleLicenceType`;
        where.saleLicenceType = sale !== undefined && Number(sale) === 1 ? 2 : 4;
      }
      sql += ` GROUP BY appno_doc_num`;
    } else {
      let layoutID = type !== undefined ? findLayout(type) : 15;
      if (layoutID > 15 || layoutID === 3) {
        if (layoutID === 38) layoutID = 30;
        where.layoutID = layoutID;
        sql = `SELECT application AS appno_doc_num FROM db_new_application.dashboard_items
          WHERE organisation_id = :organisationID AND type = :layoutID ${bankMode ? 'AND mode IN (:mode)' : ''}`;
        if (companies.length) sql += ` AND representative_id IN (:company_id)`;
        if (layoutID === 39 && customers.length) {
          where.customers = customers;
          sql += ` AND assignor_id IN (:customers)`;
        }
        sql += ` GROUP BY application`;
      } else {
        where.layoutID = layoutID;
        if (tabs.length) where.tabs = tabs;
        if (customers.length) where.customers = customers;
        if (assignments.length) where.assignments = assignments;

        sql = `SELECT appno_doc_num FROM db_new_application.assets AS assets
          WHERE date_format(assets.appno_date, '%Y') > :year AND assets.layout_id = :layoutID
            AND (assets.organisation_id = :organisationID OR assets.organisation_id IS NULL)`;
        if (companies.length) sql += ` AND assets.company_id IN (:company_id)`;

        if (assignments.length || tabs.length || customers.length) {
          sql += ` AND assets.appno_doc_num IN (
            SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id IN (
              SELECT apt.rf_id FROM db_new_application.activity_parties_transactions AS apt
               WHERE (apt.organisation_id = :organisationID OR apt.organisation_id IS NULL)`;
          if (companies.length) sql += ` AND apt.company_id IN (:company_id)`;
          if (assignments.length) sql += ` AND apt.rf_id IN (:assignments)`;
          if (tabs.length) sql += ` AND apt.activity_id IN (:tabs)`;
          else sql += ` AND apt.activity_id <> 10`;
          if (customers.length) sql += ` AND apt.assignor_and_assignee_id IN (:customers)`;
          sql += ` GROUP BY apt.rf_id) GROUP BY documentid.appno_doc_num)`;
        } else if (tabs.length === 0 && fType === undefined) {
          sql += ` AND assets.appno_doc_num IN (
            SELECT documentid.appno_doc_num FROM db_uspto.documentid WHERE rf_id IN (
              SELECT apt.rf_id FROM db_new_application.activity_parties_transactions AS apt
               WHERE (apt.organisation_id = :organisationID OR apt.organisation_id IS NULL)
                 AND apt.activity_id <> 10`;
          if (companies.length) sql += ` AND apt.company_id IN (:company_id)`;
          sql += ` GROUP BY apt.rf_id) GROUP BY documentid.appno_doc_num)`;
        }
        sql += ` GROUP BY appno_doc_num`;
      }
    }
  }

  if (!sql) return list;
  const rows = await q.selectAll(connections.applicationNew, sql, where);
  return rows.length ? rows.map((r) => `${r.appno_doc_num}`) : list;
};

// Grant numbers already present in db_uspto.assets_family; the caller diffs.
const missingGrantNumbers = async (list) => {
  if (!list.length) return [];
  const rows = await q.selectAll(
    connections.applicationNew,
    `SELECT grant_doc_num FROM db_uspto.assets_family WHERE grant_doc_num IN (:list)`,
    { list }
  );
  const existing = new Set(rows.map((r) => r.grant_doc_num));
  return list.filter((g) => !existing.has(g));
};

module.exports = { filterAssets, missingGrantNumbers, DEFAULT_YEAR_FLOOR };
