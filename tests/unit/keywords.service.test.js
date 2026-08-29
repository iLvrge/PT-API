'use strict';

jest.mock('../../src/modules/keywords/keywords.repository');

const repository = require('../../src/modules/keywords/keywords.repository');
const service = require('../../src/modules/keywords/keywords.service');

describe('keywords.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists keywords', async () => {
    repository.list.mockResolvedValue([{ id: 1, keyword: 'software' }]);
    await expect(service.list()).resolves.toEqual([{ id: 1, keyword: 'software' }]);
  });

  it('creates a keyword and returns the shaped record', async () => {
    repository.create.mockResolvedValue({ keyword_id: 5, keyword_name: 'ai' });
    await expect(service.create('ai')).resolves.toEqual({ id: 5, keyword: 'ai' });
  });

  it('updates an existing keyword', async () => {
    repository.findById.mockResolvedValue({ id: 5, keyword: 'ai' });
    repository.updateName.mockResolvedValue([1]);
    await expect(service.update(5, 'ml')).resolves.toEqual({ id: 5, keyword: 'ml' });
  });

  it('404 on update when the keyword is missing', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.update(99, 'x')).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.updateName).not.toHaveBeenCalled();
  });

  it('removes an existing keyword', async () => {
    repository.findById.mockResolvedValue({ id: 5, keyword: 'ai' });
    repository.destroyById.mockResolvedValue(1);
    await expect(service.remove(5)).resolves.toEqual({ id: 5, deleted: true });
  });

  it('404 on remove when missing', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.remove(99)).rejects.toMatchObject({ statusCode: 404 });
  });
});
