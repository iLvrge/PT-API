'use strict';

const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

/**
 * Lawfirm data in the tenant database. Reads are raw SQL; the nested response
 * shape (lawfirm -> lawfirm_address[] + companylawfirm[] -> representative) is
 * assembled in the service. All tables share the tenant connection, so the
 * joins need no cross-charset handling.
 */

const listLawfirms = (tenant) =>
  q.selectAll(
    tenant,
    `SELECT lawfirm_id, name, created_at, updated_at FROM lawfirm ORDER BY lawfirm_id`
  );

const listAddressesFor = (tenant, lawfirmIds) => {
  if (!lawfirmIds.length) return Promise.resolve([]);
  return q.selectAll(
    tenant,
    `SELECT address_id, lawfirm_id, street_address, suite, city, state, country, zip_code, telephone
       FROM lawfirm_address
      WHERE lawfirm_id IN (:lawfirmIds)`,
    { lawfirmIds }
  );
};

const listCompanyLawfirms = (tenant, representativeIds) => {
  const hasFilter = Array.isArray(representativeIds) && representativeIds.length > 0;
  return q.selectAll(
    tenant,
    `SELECT cl.company_lawfirm_id, cl.lawfirm_id, cl.representative_id,
            r.representative_id AS rep_id, r.original_name, r.representative_name
       FROM company_lawfirm AS cl
       LEFT JOIN representative AS r ON r.representative_id = cl.representative_id
      ${hasFilter ? 'WHERE cl.representative_id IN (:representativeIds)' : ''}`,
    hasFilter ? { representativeIds } : {}
  );
};

const findById = (tenant, lawfirmId) =>
  q.selectOne(tenant, `SELECT lawfirm_id, name FROM lawfirm WHERE lawfirm_id = :lawfirmId LIMIT 1`, {
    lawfirmId,
  });

// writes
const create = (tenant, data) => tenantModel(tenant, 'lawfirm').create(data);
const update = (tenant, lawfirmId, data) =>
  tenantModel(tenant, 'lawfirm').update(data, { where: { lawfirm_id: lawfirmId } });
const destroyById = (tenant, lawfirmId) =>
  tenantModel(tenant, 'lawfirm').destroy({ where: { lawfirm_id: lawfirmId } });

module.exports = {
  listLawfirms,
  listAddressesFor,
  listCompanyLawfirms,
  findById,
  create,
  update,
  destroyById,
};
