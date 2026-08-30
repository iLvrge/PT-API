'use strict';

const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

const ADDRESS_COLS =
  'address_id, lawfirm_id, street_address, suite, city, state, country, zip_code, telephone, created_at, updated_at';

// reads
const listAll = (tenant) =>
  q.selectAll(tenant, `SELECT ${ADDRESS_COLS} FROM lawfirm_address ORDER BY address_id`);

const listByLawfirm = (tenant, lawfirmId) =>
  q.selectAll(tenant, `SELECT ${ADDRESS_COLS} FROM lawfirm_address WHERE lawfirm_id = :lawfirmId`, {
    lawfirmId,
  });

const findById = (tenant, addressId) =>
  q.selectOne(tenant, `SELECT ${ADDRESS_COLS} FROM lawfirm_address WHERE address_id = :addressId LIMIT 1`, {
    addressId,
  });

// writes
const create = (tenant, data) => tenantModel(tenant, 'lawfirm_address').create(data);
const update = (tenant, addressId, data) =>
  tenantModel(tenant, 'lawfirm_address').update(data, { where: { address_id: addressId } });
const destroyById = (tenant, addressId) =>
  tenantModel(tenant, 'lawfirm_address').destroy({ where: { address_id: addressId } });

module.exports = { listAll, listByLawfirm, findById, create, update, destroyById };
