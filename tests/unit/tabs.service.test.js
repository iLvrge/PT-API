'use strict';

jest.mock('../../src/modules/tabs/tabs.repository');
jest.mock('../../src/db/query', () => {
  const actual = jest.requireActual('../../src/db/query');
  return { ...actual, selectAll: jest.fn() };
});

const q = require('../../src/db/query');
const repo = require('../../src/modules/tabs/tabs.repository');
const service = require('../../src/modules/tabs/tabs.service');

const tenant = { id: 't' };

beforeEach(() => jest.clearAllMocks());

describe('tabs.service.companies', () => {
  it('merges batched asset totals onto the party rows (real org scoping)', async () => {
    q.selectAll.mockResolvedValue([{ representative_id: 9 }, { representative_id: 10 }]);
    repo.companiesOnTab.mockResolvedValue([
      { id: 9, name: 'A', totalCustomers: 3 },
      { id: 10, name: 'B', totalCustomers: 1 },
    ]);
    repo.assetTotalsByCompany.mockResolvedValue([{ representative_id: 9, totalAssets: 42 }]);

    const res = await service.companies(tenant, 118, 4);
    expect(repo.companiesOnTab).toHaveBeenCalledWith([9, 10], 118, 4);
    expect(res.find((r) => r.id === 9).totalAssets).toBe(42);
    expect(res.find((r) => r.id === 10).totalAssets).toBe(0);
  });
});

describe('tabs.service.customers', () => {
  it('expands ids per name and attaches the normalised transaction count', async () => {
    repo.customersByName.mockResolvedValue([{ customer_id: 1, name: 'ACME', transactionCount: 0 }]);
    repo.idsForName.mockResolvedValue([{ assignor_and_assignee_id: 1 }, { assignor_and_assignee_id: 2 }]);
    repo.transactionCountForIds.mockResolvedValue(7);
    const res = await service.customers(118, 4, [9], 100, 0);
    expect(repo.transactionCountForIds).toHaveBeenCalledWith([9], 118, 4, [1, 2]);
    expect(res[0]).toMatchObject({ transactionCount: 7, assetsCount: 0 });
  });
});

describe('tabs.service.customerTransactions', () => {
  it('expands the customer through representative + name matching', async () => {
    repo.customerNames.mockResolvedValue([{ name: 'ACME', representative_id: 5, representative_name: 'ACME CORP' }]);
    repo.customerIdsFor.mockResolvedValue([{ assignor_and_assignee_id: 1 }, { assignor_and_assignee_id: 3 }]);
    repo.customerTransactions.mockResolvedValue([]);
    await service.customerTransactions(118, 4, [9], 1, undefined, undefined);
    const args = repo.customerIdsFor.mock.calls[0][0];
    expect(args.representativeIds).toEqual([5]);
    expect(args.names).toEqual(['ACME', 'ACME CORP']);
    expect(repo.customerTransactions.mock.calls[0][0].customerIds).toEqual([1, 3]);
  });

  it('falls back to the raw customer id when no names resolve', async () => {
    repo.customerNames.mockResolvedValue([]);
    repo.customerTransactions.mockResolvedValue([]);
    await service.customerTransactions(118, 4, [9], 77, undefined, undefined);
    expect(repo.customerTransactions.mock.calls[0][0].customerIds).toEqual([77]);
  });
});
