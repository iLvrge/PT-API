'use strict';

jest.mock('../../src/modules/tree/tree.repository');

const repo = require('../../src/modules/tree/tree.repository');
const service = require('../../src/modules/tree/tree.service');

beforeEach(() => jest.clearAllMocks());

describe('tree.service.portfolio', () => {
  it('returns one node per tab, in order, with no queries for an empty portfolio', async () => {
    expect(await service.portfolio(118, [])).toEqual([]);
    expect(repo.tabTotals).not.toHaveBeenCalled();
  });

  it('nests counterparties, transactions and assets under their tab', async () => {
    repo.tabTotals.mockResolvedValue([
      { tab_id: 0, representative_id: 9, totalTransactions: 2, totalAssets: 5 },
      { tab_id: 0, representative_id: 10, totalTransactions: 1, totalAssets: 3 },
    ]);
    repo.parties.mockResolvedValue([
      { tab_id: 0, id: 77, name: 'Counter Co', transaction_count: 3, assets_count: 8 },
    ]);
    repo.transactions.mockResolvedValue([
      { tab_id: 0, assignor_and_assignee_id: 77, rf_id: 500, exec_dt: '2020-01-01', assets_count: 2 },
    ]);
    repo.assetsForTransactions.mockResolvedValue([
      { rf_id: 500, appno_doc_num: '111', grant_doc_num: '999' },
      { rf_id: 500, appno_doc_num: '222', grant_doc_num: '' },
    ]);

    const tree = await service.portfolio(118, [9, 10]);

    expect(tree).toHaveLength(11);
    expect(tree[0].label).toBe('Acquisitions');
    // Totals are summed across every selected company on that tab.
    expect(tree[0].transaction_count).toBe(3);
    expect(tree[0].assets_count).toBe(8);

    const party = tree[0].childeren[0];
    expect(party).toMatchObject({ label: 'Counter Co (3)', id: 77 });

    const txn = party.children[0];
    expect(txn).toMatchObject({ label: '2020-01-01 (2)', rf_id: 500 });
    expect(txn.children).toEqual([
      { appno_doc_num: '111', grant_doc_num: '999' },
      { appno_doc_num: '222', grant_doc_num: '' },
    ]);

    // Empty tabs are still present, so the client can render every column.
    expect(tree[5]).toMatchObject({ label: 'Merger In', transaction_count: 0, childeren: [] });
  });

  it('asks for each transaction only once, however many parties share it', async () => {
    repo.tabTotals.mockResolvedValue([]);
    repo.parties.mockResolvedValue([
      { tab_id: 1, id: 77, name: 'A', transaction_count: 1, assets_count: 1 },
      { tab_id: 1, id: 78, name: 'B', transaction_count: 1, assets_count: 1 },
    ]);
    repo.transactions.mockResolvedValue([
      { tab_id: 1, assignor_and_assignee_id: 77, rf_id: 500, exec_dt: 'd', assets_count: 1 },
      { tab_id: 1, assignor_and_assignee_id: 78, rf_id: 500, exec_dt: 'd', assets_count: 1 },
    ]);
    repo.assetsForTransactions.mockResolvedValue([]);

    await service.portfolio(118, [9]);
    expect(repo.assetsForTransactions).toHaveBeenCalledWith([500]);
  });

  it('keeps a party on its own tab', async () => {
    repo.tabTotals.mockResolvedValue([]);
    repo.parties.mockResolvedValue([
      { tab_id: 2, id: 77, name: 'A', transaction_count: 1, assets_count: 1 },
    ]);
    repo.transactions.mockResolvedValue([
      // Same party id, different tab: must not leak into tab 2.
      { tab_id: 3, assignor_and_assignee_id: 77, rf_id: 501, exec_dt: 'd', assets_count: 1 },
    ]);
    repo.assetsForTransactions.mockResolvedValue([]);

    const tree = await service.portfolio(118, [9]);
    expect(tree[2].childeren[0].children).toEqual([]);
    expect(tree[3].childeren).toEqual([]);
  });
});
