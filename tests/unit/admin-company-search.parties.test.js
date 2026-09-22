'use strict';

/*
 * The console's Lenders and Borrowers lists - GET /admin/all/transactions/:side.
 *
 * Both came back empty: the port read `:side` as a conveyance type and filtered
 * `convey_ty = 'lenders'`, which matches nothing. The legacy handler built the
 * lists from the parties on security agreements and releases, with a query the
 * optimiser drove from a 12M-row full scan of assignee - five to seven minutes
 * a click. The rewrite keeps the legacy shape and the legacy row set (33,644
 * lenders, measured) and pins the plan with STRAIGHT_JOIN.
 */

jest.mock('../../src/modules/admin-company-search/admin-company-search.repository', () => ({
  partiesOnConveyances: jest.fn(),
}));

const repository = require('../../src/modules/admin-company-search/admin-company-search.repository');
const service = require('../../src/modules/admin-company-search/admin-company-search.service');

const row = (id, name, counter, extra = {}) => ({
  assignor_and_assignee_id: id, name, counter, normalize_name: null, representative_company: null, ...extra,
});

describe('partiesForSide', () => {
  beforeEach(() => repository.partiesOnConveyances.mockReset());

  it('builds lenders from assignees on security and assignors on releases', async () => {
    repository.partiesOnConveyances
      .mockResolvedValueOnce([row(1, 'Bank A', 5), row(2, 'Bank B', 2)]) // security / assignee
      .mockResolvedValueOnce([row(1, 'Bank A', 3)]); // release / assignor

    const list = await service.partiesForSide('lenders');

    expect(repository.partiesOnConveyances).toHaveBeenCalledWith({
      party: 'assignee', conveyanceTypes: ['security', 'restatedsecurity'],
    });
    expect(repository.partiesOnConveyances).toHaveBeenCalledWith({
      party: 'assignor', conveyanceTypes: ['release'],
    });
    // The same bank on both ends of a loan's life is one row, counts summed.
    expect(list).toHaveLength(2);
    expect(list.find((r) => r.assignor_and_assignee_id === 1)).toMatchObject({ id: 1, name: 'Bank A', counter: 8 });
    expect(list.find((r) => r.assignor_and_assignee_id === 2)).toMatchObject({ id: 2, name: 'Bank B', counter: 2 });
  });

  it('sums counters that arrive as strings', async () => {
    repository.partiesOnConveyances
      .mockResolvedValueOnce([row(1, 'Bank A', '5')])
      .mockResolvedValueOnce([row(1, 'Bank A', '3')]);
    const [only] = await service.partiesForSide('lenders');
    expect(only.counter).toBe(8);
  });

  it('builds borrowers from assignors on security agreements only', async () => {
    repository.partiesOnConveyances.mockResolvedValueOnce([row(9, 'Widget Co', 4)]);

    const list = await service.partiesForSide('borrowers');

    expect(repository.partiesOnConveyances).toHaveBeenCalledTimes(1);
    expect(repository.partiesOnConveyances).toHaveBeenCalledWith({
      party: 'assignor', conveyanceTypes: ['security', 'restatedsecurity'],
    });
    // The borrowers grid reads a count_assets column the query does not produce.
    expect(list).toEqual([expect.objectContaining({ name: 'Widget Co', counter: 4, count_assets: '0' })]);
  });

  it('rejects a side it does not know rather than running an empty query', async () => {
    await expect(service.partiesForSide('security')).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.partiesOnConveyances).not.toHaveBeenCalled();
  });
});
