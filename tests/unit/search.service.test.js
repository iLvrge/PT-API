'use strict';

jest.mock('../../src/modules/search/search.repository');

const repo = require('../../src/modules/search/search.repository');
const service = require('../../src/modules/search/search.service');

beforeEach(() => jest.clearAllMocks());

describe('search.service.transactions', () => {
  it('merges the three sources and de-duplicates by rf_id', async () => {
    repo.byParty.mockResolvedValue([{ rf_id: 1, date: 'a', assets: 2 }]);
    repo.byCorrespondent.mockResolvedValue([{ rf_id: 1, date: 'a', assets: 2 }, { rf_id: 2 }]);
    repo.byDocument.mockResolvedValue([{ rf_id: 3 }]);

    const res = await service.transactions('acme');
    expect(res.list.map((r) => r.rf_id)).toEqual([1, 2, 3]);
    expect(res.total_records).toBe(3);
    expect(res.txn_ids).toEqual([1, 2, 3]);
  });

  it('treats a numeric term as an id lookup', async () => {
    repo.byParty.mockResolvedValue([]);
    repo.byCorrespondent.mockResolvedValue([]);
    repo.byDocument.mockResolvedValue([]);

    await service.transactions('12345');
    expect(repo.byParty).toHaveBeenCalledWith('12345', true);
    expect(repo.byDocument).toHaveBeenCalledWith('12345', true);
  });

  it('treats a text term as a full-text search', async () => {
    repo.byParty.mockResolvedValue([]);
    repo.byCorrespondent.mockResolvedValue([]);
    repo.byDocument.mockResolvedValue([]);

    await service.transactions('acme corp');
    expect(repo.byParty).toHaveBeenCalledWith('acme corp', false);
    expect(repo.byDocument).toHaveBeenCalledWith('acme corp', false);
  });
});
