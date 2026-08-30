'use strict';

jest.mock('../../src/modules/selections/selections.repository');

const repo = require('../../src/modules/selections/selections.repository');
const service = require('../../src/modules/selections/selections.service');

describe('selections.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('setCompanies clears then bulk-inserts and returns the list', async () => {
    repo.clearCompanies.mockResolvedValue(3);
    repo.bulkCreateCompanies.mockResolvedValue([]);
    repo.listCompanies.mockResolvedValue([{ representative_id: 9 }]);
    const result = await service.setCompanies(5, 118, [9, 10]);
    expect(repo.clearCompanies).toHaveBeenCalledWith(5, 118);
    expect(repo.bulkCreateCompanies.mock.calls[0][0]).toEqual([
      { representative_id: 9, user_id: 5, organisation_id: 118 },
      { representative_id: 10, user_id: 5, organisation_id: 118 },
    ]);
    expect(result.list).toEqual([{ representative_id: 9 }]);
  });

  it('setCompanies with an empty list only clears', async () => {
    repo.clearCompanies.mockResolvedValue(1);
    repo.listCompanies.mockResolvedValue([]);
    await service.setCompanies(5, 118, []);
    expect(repo.bulkCreateCompanies).not.toHaveBeenCalled();
  });

  it('setActivity replaces the single selection', async () => {
    repo.getActivity.mockResolvedValue({ activity_id: 7 });
    await service.setActivity(5, 118, 7);
    expect(repo.clearActivity).toHaveBeenCalledWith(5, 118);
    expect(repo.createActivity).toHaveBeenCalledWith(5, 118, 7);
  });

  it('clearActivity(0) clears all; a positive id clears just that one', async () => {
    await service.clearActivity(5, 118, 0);
    expect(repo.clearActivity).toHaveBeenCalledWith(5, 118);
    jest.clearAllMocks();
    await service.clearActivity(5, 118, 3);
    expect(repo.clearActivityOne).toHaveBeenCalledWith(5, 118, 3);
  });
});
