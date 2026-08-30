'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./address.repository');

const ADDRESS_FIELDS = [
  'street_address', 'suite', 'city', 'state', 'country', 'zip_code',
  'telephone', 'telephone_2', 'telephone_3',
];

/**
 * Grouped list: [{ representative_id, address: [ ...addresses ] }], matching the
 * legacy shape where addresses were nested under their representative.
 */
const listGrouped = async (tenant, representativeIds) => {
  const rows = await repository.listByRepresentatives(tenant, representativeIds);
  const byRep = new Map();
  for (const row of rows) {
    if (!byRep.has(row.representative_id)) {
      byRep.set(row.representative_id, { representative_id: row.representative_id, address: [] });
    }
    const { representative_id, ...address } = row;
    // The LEFT JOIN yields one all-null row for a company with no address; the
    // company still belongs in the response, but with an empty address list.
    if (address.address_id !== null && address.address_id !== undefined) {
      byRep.get(representative_id).address.push(address);
    }
  }
  return [...byRep.values()];
};

const listFlat = (tenant, representativeIds) =>
  repository.listFlatByRepresentatives(tenant, representativeIds);

const create = async (tenant, body) => {
  const created = await repository.create(tenant, body);
  return created.toJSON ? created.toJSON() : created;
};

const update = async (tenant, addressId, body) => {
  const existing = await repository.findById(tenant, addressId);
  if (!existing) throw ApiError.notFound('Address not found');
  const data = {};
  for (const f of ADDRESS_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  await repository.update(tenant, addressId, data);
  return { ...existing, ...data };
};

const remove = async (tenant, addressId) => {
  const existing = await repository.findById(tenant, addressId);
  if (!existing) throw ApiError.notFound('Address not found');
  await repository.destroyById(tenant, addressId);
  return { address_id: addressId, deleted: true };
};

module.exports = { listGrouped, listFlat, create, update, remove };
