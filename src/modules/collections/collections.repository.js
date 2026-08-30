'use strict';

const { connections } = require('../../db');
const q = require('../../db/query');
const { tenantModel } = require('../../db/tenant-models');

// ---- tenant reads ----
const listCollections = (tenant) =>
  q.selectAll(tenant, `SELECT collection_id, name FROM collection ORDER BY collection_id`);

const listCompaniesByCollections = (tenant, collectionIds) => {
  if (!collectionIds.length) return Promise.resolve([]);
  return q.selectAll(
    tenant,
    `SELECT collection_company_id, collection_id, name, instances
       FROM collection_company
      WHERE collection_id IN (:collectionIds)`,
    { collectionIds }
  );
};

const findCollectionById = (tenant, collectionId) =>
  q.selectOne(tenant, `SELECT collection_id, name FROM collection WHERE collection_id = :collectionId LIMIT 1`, {
    collectionId,
  });

const findCollectionByName = (tenant, name) =>
  q.selectOne(tenant, `SELECT collection_id, name FROM collection WHERE name = :name LIMIT 1`, { name });

// ---- shared (resources / db_uspto) read ----
// Resolve the display name + instances for the selected assignor/assignee ids.
// Both tables are db_uspto / utf8mb4_0900_ai_ci, so the join needs no coercion.
const resolveCompanies = (assignorIds) => {
  if (!assignorIds.length) return Promise.resolve([]);
  return q.selectAll(
    connections.resources,
    `SELECT aaa.assignor_and_assignee_id,
            aaa.instances,
            CASE WHEN aaa.representative_id > 0 AND r.representative_name IS NOT NULL
                 THEN r.representative_name ELSE aaa.name END AS name
       FROM assignor_and_assignee AS aaa
       LEFT JOIN representative AS r ON r.representative_id = aaa.representative_id
      WHERE aaa.assignor_and_assignee_id IN (:assignorIds)`,
    { assignorIds }
  );
};

// ---- tenant writes ----
const createCollection = (tenant, data) => tenantModel(tenant, 'collection').create(data);
const updateCollectionName = (tenant, collectionId, name) =>
  tenantModel(tenant, 'collection').update({ name }, { where: { collection_id: collectionId } });
const bulkCreateCompanies = (tenant, rows) => tenantModel(tenant, 'collection_company').bulkCreate(rows);
const deleteCompaniesByCollection = (tenant, collectionId) =>
  tenantModel(tenant, 'collection_company').destroy({ where: { collection_id: collectionId } });
const deleteCollection = (tenant, collectionId) =>
  tenantModel(tenant, 'collection').destroy({ where: { collection_id: collectionId } });

module.exports = {
  listCollections,
  listCompaniesByCollections,
  findCollectionById,
  findCollectionByName,
  resolveCompanies,
  createCollection,
  updateCollectionName,
  bulkCreateCompanies,
  deleteCompaniesByCollection,
  deleteCollection,
};
