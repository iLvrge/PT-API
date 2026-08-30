'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./lawfirm-address.repository');

const listAll = (tenant) => repository.listAll(tenant);
const listByLawfirm = (tenant, lawfirmId) => repository.listByLawfirm(tenant, lawfirmId);

const create = async (tenant, data) => {
  const created = await repository.create(tenant, data);
  return created.toJSON ? created.toJSON() : created;
};

const update = async (tenant, addressId, data) => {
  const existing = await repository.findById(tenant, addressId);
  if (!existing) throw ApiError.notFound('Lawfirm address not found');
  await repository.update(tenant, addressId, data);
  return { ...existing, ...data };
};

const remove = async (tenant, addressId) => {
  const existing = await repository.findById(tenant, addressId);
  if (!existing) throw ApiError.notFound('Lawfirm address not found');
  await repository.destroyById(tenant, addressId);
  return { address_id: addressId, deleted: true };
};

module.exports = { listAll, listByLawfirm, create, update, remove };
