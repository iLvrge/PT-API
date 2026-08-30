'use strict';

const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

/**
 * Telephone records live in the tenant database, so every method takes the
 * per-request tenant connection (req.tenant). Reads are raw SQL; writes go
 * through the cached tenant model.
 */

// reads (raw SQL against the tenant connection)
const listByRepresentatives = (tenant, representativeIds) => {
  const hasFilter = Array.isArray(representativeIds) && representativeIds.length > 0;
  return q.selectAll(
    tenant,
    `SELECT telephone_id, representative_id, telephone_number, created_at, updated_at
       FROM telephone
      ${hasFilter ? 'WHERE representative_id IN (:representativeIds)' : ''}
      ORDER BY representative_id, telephone_id`,
    hasFilter ? { representativeIds } : {}
  );
};

const findById = (tenant, telephoneId) =>
  q.selectOne(
    tenant,
    `SELECT telephone_id, representative_id, telephone_number FROM telephone WHERE telephone_id = :telephoneId LIMIT 1`,
    { telephoneId }
  );

// writes (Sequelize tenant model)
const create = (tenant, data) => tenantModel(tenant, 'telephone').create(data);

const destroyById = (tenant, telephoneId) =>
  tenantModel(tenant, 'telephone').destroy({ where: { telephone_id: telephoneId } });

module.exports = { listByRepresentatives, findById, create, destroyById };
