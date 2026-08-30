'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./lawfirm.repository');

const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
};

/**
 * Reproduces the legacy nested shape: each lawfirm carries lawfirm_address[]
 * and companylawfirm[] (each with its representative). When `companies` is
 * given, companylawfirm entries are filtered by representative_id (lawfirms
 * themselves are still all returned — matching the legacy required:false include).
 */
const list = async (tenant, representativeIds) => {
  const lawfirms = await repository.listLawfirms(tenant);
  if (!lawfirms.length) return [];

  const ids = lawfirms.map((l) => l.lawfirm_id);
  const [addresses, companyLawfirms] = await Promise.all([
    repository.listAddressesFor(tenant, ids),
    repository.listCompanyLawfirms(tenant, representativeIds),
  ]);

  const addrByLawfirm = groupBy(addresses, 'lawfirm_id');
  const clByLawfirm = groupBy(companyLawfirms, 'lawfirm_id');

  return lawfirms.map((lf) => ({
    ...lf,
    lawfirm_address: addrByLawfirm.get(lf.lawfirm_id) || [],
    companylawfirm: (clByLawfirm.get(lf.lawfirm_id) || []).map((cl) => ({
      company_lawfirm_id: cl.company_lawfirm_id,
      lawfirm_id: cl.lawfirm_id,
      representative_id: cl.representative_id,
      companylawfirm_representative: cl.rep_id
        ? {
            representative_id: cl.rep_id,
            original_name: cl.original_name,
            representative_name: cl.representative_name,
          }
        : null,
    })),
  }));
};

const create = async (tenant, data) => {
  const created = await repository.create(tenant, data);
  return created.toJSON ? created.toJSON() : created;
};

const update = async (tenant, lawfirmId, data) => {
  const existing = await repository.findById(tenant, lawfirmId);
  if (!existing) throw ApiError.notFound('Lawfirm not found');
  await repository.update(tenant, lawfirmId, data);
  return { ...existing, ...data };
};

const remove = async (tenant, lawfirmId) => {
  const existing = await repository.findById(tenant, lawfirmId);
  if (!existing) throw ApiError.notFound('Lawfirm not found');
  await repository.destroyById(tenant, lawfirmId);
  return { lawfirm_id: lawfirmId, deleted: true };
};

module.exports = { list, create, update, remove };
