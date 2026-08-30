'use strict';

const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

const COLS =
  'address_id, representative_id, street_address, suite, city, state, country, zip_code, telephone, telephone_2, telephone_3';

/**
 * Address data in the tenant DB. The legacy list grouped addresses under their
 * representative and formatted the dates; we return the same fields with dates
 * pre-formatted as YYYY-MM-DD, and the service assembles the grouped shape.
 */
const listByRepresentatives = (tenant, representativeIds) => {
  const hasFilter = Array.isArray(representativeIds) && representativeIds.length > 0;
  return q.selectAll(
    tenant,
    `SELECT ${COLS},
            date_format(created_at, '%Y-%m-%d') AS created_at,
            date_format(updated_at, '%Y-%m-%d') AS updated_at
       FROM address
      WHERE parent_id = 0 ${hasFilter ? 'AND representative_id IN (:representativeIds)' : ''}
      ORDER BY representative_id, address_id`,
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
