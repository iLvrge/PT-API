'use strict';

const repository = require('./selections.repository');

// Company selection is a full replace: clear the user's rows, then insert.
const getCompanies = async (userId, orgId) => ({ list: await repository.listCompanies(userId, orgId) });

const setCompanies = async (userId, orgId, representativeIds) => {
  await repository.clearCompanies(userId, orgId);
  if (representativeIds.length) {
    await repository.bulkCreateCompanies(
      representativeIds.map((representative_id) => ({ representative_id, user_id: userId, organisation_id: orgId }))
    );
  }
  return { list: await repository.listCompanies(userId, orgId) };
};

// Activity selection holds a single value per user+org.
const getActivity = (userId, orgId) => repository.getActivity(userId, orgId);

const setActivity = async (userId, orgId, activityId) => {
  if (activityId > 0) {
    await repository.clearActivity(userId, orgId);
    await repository.createActivity(userId, orgId, activityId);
  }
  return repository.getActivity(userId, orgId);
};

const clearActivity = async (userId, orgId, activityId) => {
  if (activityId > 0) {
    await repository.clearActivityOne(userId, orgId, activityId);
  } else if (activityId === 0) {
    await repository.clearActivity(userId, orgId);
  }
  return { cleared: true };
};

module.exports = { getCompanies, setCompanies, getActivity, setActivity, clearActivity };
