'use strict';

jest.mock('../../src/modules/collections/collections.repository');

const repo = require('../../src/modules/collections/collections.repository');
const service = require('../../src/modules/collections/collections.service');

const tenant = { id: 't' };

describe('collections.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('list nests collection_companies under each collection', async () => {
    repo.listCollections.mockResolvedValue([{ collection_id: 1, name: 'A' }, { collection_id: 2, name: 'B' }]);
    repo.listCompaniesByCollections.mockResolvedValue([
      { collection_company_id: 10, collection_id: 1, name: 'Acme', instances: 5 },
    ]);
    const result = await service.list(tenant);
    expect(result.find((c) => c.collection_id === 1).collection_companies).toHaveLength(1);
    expect(result.find((c) => c.collection_id === 2).collection_companies).toEqual([]);
  });

  it('create reuses an existing collection and resolves company names via the shared DB', async () => {
    repo.findCollectionByName.mockResolvedValue({ collection_id: 7, name: 'X' });
    repo.resolveCompanies.mockResolvedValue([{ assignor_and_assignee_id: 99, name: 'Rep Co', instances: 3 }]);
    repo.bulkCreateCompanies.mockResolvedValue([]);
    repo.findCollectionById.mockResolvedValue({ collection_id: 7, name: 'X' });
    repo.listCompaniesByCollections.mockResolvedValue([]);

    await service.create(tenant, 5, { collection_name: 'X', companies: [99] });

    expect(repo.createCollection).not.toHaveBeenCalled();
    const rows = repo.bulkCreateCompanies.mock.calls[0][1];
    expect(rows).toEqual([{ collection_id: 7, name: 'Rep Co', instances: 3 }]);
  });

  it('create makes a new collection with the user id when none exists', async () => {
    repo.findCollectionByName.mockResolvedValue(null);
    repo.createCollection.mockResolvedValue({ collection_id: 8 });
    repo.findCollectionById.mockResolvedValue({ collection_id: 8, name: 'New' });
    repo.listCompaniesByCollections.mockResolvedValue([]);
    await service.create(tenant, 5, { collection_name: 'New', companies: [] });
    expect(repo.createCollection).toHaveBeenCalledWith(tenant, { name: 'New', user_id: 5 });
  });

  it('update 404 when the collection is missing', async () => {
    repo.findCollectionById.mockResolvedValue(null);
    await expect(service.update(tenant, 99, { collection_name: 'z', companies: [] })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('update replaces companies when a non-empty list is given', async () => {
    repo.findCollectionById.mockResolvedValue({ collection_id: 3, name: 'C' });
    repo.resolveCompanies.mockResolvedValue([{ assignor_and_assignee_id: 1, name: 'N', instances: 1 }]);
    repo.bulkCreateCompanies.mockResolvedValue([]);
    repo.listCompaniesByCollections.mockResolvedValue([]);
    await service.update(tenant, 3, { collection_name: 'C2', companies: [1] });
    expect(repo.deleteCompaniesByCollection).toHaveBeenCalledWith(tenant, 3);
    expect(repo.updateCollectionName).toHaveBeenCalledWith(tenant, 3, 'C2');
  });

  it('remove deletes companies then the collection', async () => {
    repo.findCollectionById.mockResolvedValue({ collection_id: 3 });
    await expect(service.remove(tenant, 3)).resolves.toEqual({ collection_id: 3, deleted: true });
    expect(repo.deleteCompaniesByCollection).toHaveBeenCalledWith(tenant, 3);
    expect(repo.deleteCollection).toHaveBeenCalledWith(tenant, 3);
  });
});
