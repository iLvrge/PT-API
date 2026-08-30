'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./profile.repository');

// Legacy label mapping — spellings preserved to keep the client contract.
const ORG_TYPE_LABELS = {
  2: 'Bank',
  3: 'Law Firm',
  4: 'University',
  5: 'Goverment',
};
const orgTypeLabel = (type) => ORG_TYPE_LABELS[Number(type)] || 'Company';

const getProfile = async (userId) => {
  const row = await repository.findProfile(userId);
  if (!row) throw ApiError.unauthorized('Invalid token');

  return {
    user: {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      email_address: row.email_address,
      logo: row.logo,
      job_title: row.job_title,
      role: { name: row.role_name },
      organisation: {
        organisation_id: row.organisation_id,
        name: row.organisation_name,
        subscribtion: row.subscribtion,
        logo: row.organisation_logo,
        organisation_type: orgTypeLabel(row.organisation_type),
      },
    },
  };
};

module.exports = { getProfile, orgTypeLabel };
