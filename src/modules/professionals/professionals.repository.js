'use strict';

const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

// read: professionals (type 1) with their lawfirm joined. Both tables are in
// the tenant DB, so a plain LEFT JOIN is correct.
const listLawyers = (tenant) =>
  q.selectAll(
    tenant,
    `SELECT p.professional_id, p.first_name, p.last_name, p.email_address,
            p.telephone, p.telephone1, p.linkedin_url, p.firm_id, p.type,
            l.lawfirm_id AS lawfirm_id, l.name AS lawfirm_name
       FROM professional AS p
       LEFT JOIN lawfirm AS l ON l.lawfirm_id = p.firm_id
      WHERE p.type = 1
      ORDER BY p.professional_id`
  );

const findById = (tenant, professionalId) =>
  q.selectOne(
    tenant,
    `SELECT professional_id, first_name, last_name, email_address, telephone,
            telephone1, linkedin_url, firm_id, type
       FROM professional WHERE professional_id = :professionalId LIMIT 1`,
    { professionalId }
  );

// writes
const create = (tenant, data) => tenantModel(tenant, 'professional').create(data);
const update = (tenant, professionalId, data) =>
  tenantModel(tenant, 'professional').update(data, { where: { professional_id: professionalId } });
const destroyById = (tenant, professionalId) =>
  tenantModel(tenant, 'professional').destroy({ where: { professional_id: professionalId } });

module.exports = { listLawyers, findById, create, update, destroyById };
