'use strict';

/**
 * Reads one recorded USPTO assignment (rf_id) and everything hanging off it:
 * the assignors, the assignees, the assignment record itself, the properties
 * it covers, and the release transaction that later discharged it.
 *
 * Shared because the illustration, events and family modules all render from
 * the same shape. Ported from helpers/helper.js (assignorData / assigneeData /
 * assignmentData / documentData / getAssignmentDataByrfID).
 */

const { connections } = require('../db');
const q = require('../db/query');

// The most recent recorded spelling of a party's normalised name. Correlated on
// aaa.representative_id, so it resolves per row.
const REPRESENTATIVE_ORIGINAL_NAME = (table, order) => `(SELECT original_name FROM ${table}
    WHERE assignor_and_assignee_id IN (
      SELECT assignor_and_assignee_id FROM assignor_and_assignee
       WHERE representative_id = aaa.representative_id
         AND assignor_and_assignee.representative_id <> 0
         AND assignor_and_assignee.name = r.representative_name
       GROUP BY assignor_and_assignee_id)
    ORDER BY ${order} DESC LIMIT 1) AS representative_original_name`;

const assignors = (rfId) =>
  q.selectAll(
    connections.resources,
    `SELECT a.original_name AS original_name, aaa.name as or_name,
            r.representative_name as normalize_name,
            ${REPRESENTATIVE_ORIGINAL_NAME('assignor', 'exec_dt')},
            date_format(MAX(a.exec_dt),"%Y-%m-%d %h:%i:%s") as exec_dt,
            aaa.assignor_and_assignee_id as id
       FROM assignor as a
       INNER JOIN assignor_and_assignee as aaa
               ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id
       LEFT JOIN representative as r ON r.representative_id = aaa.representative_id
      WHERE a.rf_id = :rfId
      GROUP BY aaa.name, normalize_name ORDER BY a.exec_dt ASC`,
    { rfId }
  );

const assignees = (rfId) =>
  q.selectAll(
    connections.resources,
    `SELECT a.*, aaa.name as ee_name, r.representative_name as normalize_name,
            ${REPRESENTATIVE_ORIGINAL_NAME('assignee', 'rf_id')},
            aaa.assignor_and_assignee_id as id
       FROM assignee as a
       INNER JOIN assignor_and_assignee as aaa
               ON aaa.assignor_and_assignee_id = a.assignor_and_assignee_id
       LEFT JOIN representative as r ON r.representative_id = aaa.representative_id
      WHERE a.rf_id = :rfId
      GROUP BY aaa.name, normalize_name`,
    { rfId }
  );

const assignment = (rfId) =>
  q.selectOne(
    connections.resources,
    `SELECT ac.*, acc.convey_ty, acc.employer_assign
       FROM assignment as ac
       INNER JOIN representative_assignment_conveyance as acc ON acc.rf_id = ac.rf_id
      WHERE ac.rf_id = :rfId LIMIT 1`,
    { rfId }
  );

const properties = (rfId) =>
  q.selectAll(
    connections.resources,
    `SELECT * FROM documentid WHERE rf_id = :rfId GROUP BY appno_doc_num`,
    { rfId }
  );

const releaseRfId = async (rfId) => {
  const row = await q.selectOne(
    connections.resources,
    `SELECT release_rf_id FROM db_new_application.activity_parties_transactions
      WHERE rf_id = :rfId LIMIT 1`,
    { rfId }
  );
  return row && row.release_rf_id > 0 ? row.release_rf_id : null;
};

/**
 * @param {number|string} rfId
 * @param {boolean} withProperties false skips the (potentially large) property
 *   list — the legacy `t` flag.
 */
const byRfId = async (rfId, withProperties = true) => {
  const [assignor, assignee, assignmentRow, propertyRows, releaseId] = await Promise.all([
    assignors(rfId),
    assignees(rfId),
    assignment(rfId),
    withProperties ? properties(rfId) : Promise.resolve([]),
    releaseRfId(rfId),
  ]);

  const base = {
    assignee,
    assignor,
    assignment: assignmentRow,
    properties: propertyRows,
    releaseAssignor: [],
    releaseAssignee: [],
    releaseAssignment: [],
    releaseProperties: [],
  };
  if (!releaseId) return base;

  const [releaseAssignor, releaseAssignee, releaseAssignment, releaseProperties] = await Promise.all([
    assignors(releaseId),
    assignees(releaseId),
    assignment(releaseId),
    withProperties ? properties(releaseId) : Promise.resolve([]),
  ]);
  return { ...base, releaseAssignor, releaseAssignee, releaseAssignment, releaseProperties };
};

module.exports = { byRfId, assignors, assignees, assignment, properties, releaseRfId };
