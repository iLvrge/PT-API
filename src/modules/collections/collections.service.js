'use strict';

const ApiError = require('../../utils/api-error');
const repository = require('./collections.repository');

const nestCompanies = (collections, companies) => {
  const byCollection = new Map();
  for (const c of companies) {
    if (!byCollection.has(c.collection_id)) byCollection.set(c.collection_id, []);
    byCollection.get(c.collection_id).push({
      collection_company_id: c.collection_company_id,
      name: c.name,
      instances: c.instances,
    });
  }
  return collections.map((col) => ({
    collection_id: col.collection_id,
    name: col.name,
    collection_companies: byCollection.get(col.collection_id) || [],
  }));
};

const list = async (tenant) => {
  const collections = await repository.listCollections(tenant);
  if (!collections.length) return [];
  const companies = await repository.listCompaniesByCollections(
    tenant,
    collections.map((c) => c.collection_id)
  );
  return nestCompanies(collections, companies);
};

const getOne = async (tenant, collectionId) => {
  const collection = await repository.findCollectionById(tenant, collectionId);
  if (!collection) return null;
  const companies = await repository.listCompaniesByCollections(tenant, [collectionId]);
  return nestCompanies([collection], companies)[0];
};

// Turn selected assignor ids into collection_company rows for a collection.
const attachCompanies = async (tenant, collectionId, assignorIds) => {
  if (!assignorIds.length) return;
  const resolved = await repository.resolveCompanies(assignorIds);
  if (!resolved.length) return;
  await repository.bulkCreateCompanies(
    tenant,
    resolved.map((c) => ({ collection_id: collectionId, name: c.name, instances: c.instances }))
  );
};

const create = async (tenant, userId, { collection_name, companies }) => {
  const existing = await repository.findCollectionByName(tenant, collection_name);
  const collection =
    existing || (await repository.createCollection(tenant, { name: collection_name, user_id: userId }));
  const collectionId = collection.collection_id;
  if (!collectionId) throw ApiError.internal('Unable to create collection');

  await attachCompanies(tenant, collectionId, companies);
  return getOne(tenant, collectionId);
};

const update = async (tenant, collectionId, { collection_name, companies }) => {
  const existing = await repository.findCollectionById(tenant, collectionId);
  if (!existing) throw ApiError.notFound('Collection not found');

  if (collection_name !== undefined) {
    await repository.updateCollectionName(tenant, collectionId, collection_name);
  }
  if (Array.isArray(companies) && companies.length) {
    await repository.deleteCompaniesByCollection(tenant, collectionId);
    await attachCompanies(tenant, collectionId, companies);
  }
  return getOne(tenant, collectionId);
};

const remove = async (tenant, collectionId) => {
  const existing = await repository.findCollectionById(tenant, collectionId);
  if (!existing) throw ApiError.notFound('Collection not found');
  await repository.deleteCompaniesByCollection(tenant, collectionId);
  await repository.deleteCollection(tenant, collectionId);
  return { collection_id: collectionId, deleted: true };
};

module.exports = { list, getOne, create, update, remove };
