'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./professionals.repository');

// Reshape the flat join into the legacy nested lawfirm object.
const toPublic = (row) => ({
  professional_id: row.professional_id,
  first_name: row.first_name,
  last_name: row.last_name,
  email_address: row.email_address,
  telephone: row.telephone,
  telephone1: row.telephone1,
  linkedin_url: row.linkedin_url,
  firm_id: row.firm_id,
  type: row.type,
  lawfirm: row.lawfirm_id ? { id: row.lawfirm_id, name: row.lawfirm_name } : null,
});

const list = async (tenant) => (await repository.listLawyers(tenant)).map(toPublic);

const create = async (tenant, body) => {
  if (!(Number(body.firm_id) > 0)) throw ApiError.badRequest('Please select a lawfirm');
  const created = await repository.create(tenant, {
    first_name: body.first_name,
    last_name: body.last_name,
    email_address: body.email_address,
    telephone: body.telephone,
    telephone1: body.telephone1,
    linkedin_url: body.linkedin_url,
    firm_id: body.firm_id,
    profile_logo: '',
    type: 1,
  });
  return created.toJSON ? created.toJSON() : created;
};

const update = async (tenant, professionalId, body) => {
  const existing = await repository.findById(tenant, professionalId);
  if (!existing) throw ApiError.notFound('Professional not found');

  const data = {
    first_name: body.first_name,
    last_name: body.last_name,
    email_address: body.email_address,
    linkedin_url: body.linkedin_url,
    telephone: body.telephone,
    telephone1: body.telephone1,
  };
  if (body.firm_id !== undefined && body.firm_id !== existing.firm_id) {
    data.firm_id = body.firm_id;
  }
  await repository.update(tenant, professionalId, data);
  return { ...existing, ...data };
};

const remove = async (tenant, professionalId) => {
  const existing = await repository.findById(tenant, professionalId);
  if (!existing) throw ApiError.notFound('Professional not found');
  await repository.destroyById(tenant, professionalId);
  return { professional_id: professionalId, deleted: true };
};

module.exports = { list, create, update, remove };
