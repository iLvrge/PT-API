'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const CompanySelection = require('../../db/models/user-company-selection.model');
const ActivitySelection = require('../../db/models/user-activity-selection.model');

const scope = (userId, orgId) => ({ user_id: userId, organisation_id: orgId });

// ---- company selection ----
const listCompanies = (userId, orgId) =>
  q.selectAll(
    connections.business,
    `SELECT representative_id FROM user_company_selection
      WHERE user_id = :userId AND organisation_id = :orgId
      GROUP BY organisation_id, representative_id`,
    { userId, orgId }
  );

const clearCompanies = (userId, orgId) => CompanySelection.destroy({ where: scope(userId, orgId) });
const bulkCreateCompanies = (rows) => CompanySelection.bulkCreate(rows);

// ---- activity selection ----
const getActivity = (userId, orgId) =>
  q.selectOne(
    connections.business,
    `SELECT activity_id FROM user_activity_selection
      WHERE user_id = :userId AND organisation_id = :orgId LIMIT 1`,
    { userId, orgId }
  );

const clearActivity = (userId, orgId) => ActivitySelection.destroy({ where: scope(userId, orgId) });
const clearActivityOne = (userId, orgId, activityId) =>
  ActivitySelection.destroy({ where: { ...scope(userId, orgId), activity_id: activityId } });
const createActivity = (userId, orgId, activityId) =>
  ActivitySelection.create({ ...scope(userId, orgId), activity_id: activityId });

module.exports = {
  listCompanies,
  clearCompanies,
  bulkCreateCompanies,
  getActivity,
  clearActivity,
  clearActivityOne,
  createActivity,
};
