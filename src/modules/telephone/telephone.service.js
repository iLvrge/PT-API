'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./telephone.repository');

const list = (tenant, representativeIds) =>
  repository.listByRepresentatives(tenant, representativeIds);

const create = async (tenant, { representative_id, telephone_number }) => {
  const created = await repository.create(tenant, { representative_id, telephone_number });
  return created.toJSON ? created.toJSON() : created;
};

const remove = async (tenant, telephoneId) => {
  const existing = await repository.findById(tenant, telephoneId);
  if (!existing) throw ApiError.notFound('Telephone not found');
  await repository.destroyById(tenant, telephoneId);
  return { telephone_id: telephoneId, deleted: true };
};

module.exports = { list, create, remove };
