'use strict';

const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

const COLS =
  'address_id, representative_id, street_address, suite, city, state, country, zip_code, telephone, telephone_2, telephone_3';

/**
 * Address data in the tenant DB.
 *
 * The list is driven from `representative`, not `address`: the `parent_id = 0`
 * filter selects top-level companies and lives on that table. A LEFT JOIN keeps
 * companies that have no address yet, matching the legacy Sequelize `include`.
 */
const listByRepresentatives = (tenant, representativeIds) => {
  const hasFilter = Array.isArray(representativeIds) && representativeIds.length > 0;
  return q.selectAll(
    tenant,
    `SELECT r.representative_id,
            a.address_id, a.street_address, a.suite, a.city, a.state, a.country,
            a.zip_code, a.telephone, a.telephone_2, a.telephone_3,
            date_format(a.created_at, '%Y-%m-%d') AS created_at,
            date_format(a.updated_at, '%Y-%m-%d') AS updated_at
       FROM representative AS r
       LEFT JOIN address AS a ON a.representative_id = r.representative_id
      WHERE r.parent_id = 0 ${hasFilter ? 'AND r.representative_id IN (:representativeIds)' : ''}
      ORDER BY r.representative_id, a.address_id`,
    hasFilter ? { representativeIds } : {}
  );
};

// Flat list for the /address/companies endpoint (a subset of columns).
const listFlatByRepresentatives = (tenant, representativeIds) => {
  if (!Array.isArray(representativeIds) || representativeIds.length === 0) {
    return Promise.resolve([]);
  }
  return q.selectAll(
    tenant,
    `SELECT address_id, street_address, suite, city, state, country, zip_code
       FROM address
      WHERE representative_id IN (:representativeIds)`,
    { representativeIds }
  );
};

const findById = (tenant, addressId) =>
  q.selectOne(tenant, `SELECT ${COLS} FROM address WHERE address_id = :addressId LIMIT 1`, {
    addressId,
  });

// writes
const create = (tenant, data) => tenantModel(tenant, 'address').create(data);
const update = (tenant, addressId, data) =>
  tenantModel(tenant, 'address').update(data, { where: { address_id: addressId } });
const destroyById = (tenant, addressId) =>
  tenantModel(tenant, 'address').destroy({ where: { address_id: addressId } });

module.exports = {
  listByRepresentatives,
  listFlatByRepresentatives,
  findById,
  create,
  update,
  destroyById,
};
