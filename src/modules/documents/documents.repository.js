'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');
const { Templates, Repositories } = require('../../db/models/document-workspace.models');

// ---- layouts / templates / repositories (db_new_application) ----
const layoutsWithTemplates = async (userAccount, orgId, layoutIds) => {
  const layouts = await q.selectAll(
    connections.applicationNew,
    `SELECT layout_id, layout_name FROM layouts ${layoutIds ? 'WHERE layout_id IN (:layoutIds)' : ''}`,
    layoutIds ? { layoutIds } : {}
  );
  if (!layouts.length) return layouts;
  const templates = await q.selectAll(
    connections.applicationNew,
    `SELECT template_id, layout_id, container_name, container_id FROM templates
      WHERE user_account = :userAccount AND organisation_id = :orgId AND layout_id IN (:ids)`,
    { userAccount, orgId, ids: layouts.map((l) => l.layout_id) }
  );
  const byLayout = new Map();
  for (const t of templates) {
    if (!byLayout.has(t.layout_id)) byLayout.set(t.layout_id, []);
    byLayout.get(t.layout_id).push(t);
  }
  return layouts.map((l) => ({ ...l, templates: byLayout.get(l.layout_id) || [] }));
};

const templatesForLayout = (orgId, layoutId, userAccount) =>
  q.selectAll(
    connections.applicationNew,
    `SELECT * FROM templates WHERE organisation_id = :orgId AND layout_id = :layoutId AND user_account = :userAccount`,
    { orgId, layoutId, userAccount }
  );

const layoutsExist = (layoutIds) =>
  q.selectAll(connections.applicationNew, `SELECT layout_id FROM layouts WHERE layout_id IN (:layoutIds)`, { layoutIds });

const bulkCreateTemplates = (rows) => Templates.bulkCreate(rows, { ignoreDuplicates: true });

const findTemplateMapping = (where) => Templates.findOne({ where });

const destroyTemplates = (where) => Templates.destroy({ where });

const findRepository = (orgId, userAccount) =>
  Repositories.findOne({ where: { organisation_id: orgId, user_account: userAccount } });

const createRepository = (data) => Repositories.create(data);

// ---- tenant documents ----
const listDocuments = (tenant) =>
  q.selectAll(
    tenant,
    `SELECT title AS name, document_id, file, description FROM document WHERE status = 0 ORDER BY title ASC`
  );

const isTenantAdmin = (tenant, userId) =>
  q.exists(tenant, `SELECT 1 FROM user WHERE user_id = :userId AND role_id = 1`, { userId });

const findDocument = (tenant, documentId) =>
  q.selectOne(tenant, `SELECT * FROM document WHERE document_id = :documentId LIMIT 1`, { documentId });

const createDocument = (tenant, data) => tenantModel(tenant, 'document').create(data);
const updateDocument = (tenant, documentId, data) =>
  tenantModel(tenant, 'document').update(data, { where: { document_id: documentId } });
const destroyDocument = (tenant, documentId) =>
  tenantModel(tenant, 'document').destroy({ where: { document_id: documentId } });

module.exports = {
  layoutsWithTemplates,
  templatesForLayout,
  layoutsExist,
  bulkCreateTemplates,
  findTemplateMapping,
  destroyTemplates,
  findRepository,
  createRepository,
  listDocuments,
  isTenantAdmin,
  findDocument,
  createDocument,
  updateDocument,
  destroyDocument,
};
