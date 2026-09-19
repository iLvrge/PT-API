'use strict';

// PUT /admin/company/cited/:id — attaches cited assignees to an organisation.
//
// The legacy handler declared its result with `const` and then assigned to it:
//
//     const { id } = req.params, data = ''
//     ...
//     data = await AssigneeOrganizations.update(...)   // TypeError
//
// so it threw on every successful call. The throw was swallowed by an empty
// catch and res was never called, leaving the request open until the client
// gave up. The route was not ported to the rewrite at all, so it 404'd instead.

jest.mock('../../src/modules/admin-company-search/admin-company-search.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');
jest.mock('../../src/utils/google');

const repo = require('../../src/modules/admin-company-search/admin-company-search.repository');
const service = require('../../src/modules/admin-company-search/admin-company-search.service');

beforeEach(() => {
  jest.clearAllMocks();
  repo.assignCitedToOrganisation.mockResolvedValue([2]);
});

describe('assignCitedToOrganisation', () => {
  it('moves the given assignees and reports how many', async () => {
    const result = await service.assignCitedToOrganisation({
      assigneeIds: [1, 2], organisationId: 68,
    });
    expect(repo.assignCitedToOrganisation).toHaveBeenCalledWith({
      assigneeIds: [1, 2], organisationId: 68,
    });
    expect(result).toEqual({ updated: 2, organisation_id: 68 });
  });

  it('always answers — the legacy version threw and never responded', async () => {
    await expect(
      service.assignCitedToOrganisation({ assigneeIds: [1], organisationId: 68 })
    ).resolves.toBeDefined();
  });

  it('refuses an empty assignee list rather than updating nothing silently', async () => {
    await expect(
      service.assignCitedToOrganisation({ assigneeIds: [], organisationId: 68 })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.assignCitedToOrganisation).not.toHaveBeenCalled();
  });

  it('refuses a missing organisation rather than orphaning the rows', async () => {
    await expect(
      service.assignCitedToOrganisation({ assigneeIds: [1], organisationId: undefined })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.assignCitedToOrganisation).not.toHaveBeenCalled();
  });

  it('falls back to the requested count when the driver reports none', async () => {
    repo.assignCitedToOrganisation.mockResolvedValue([undefined]);
    const result = await service.assignCitedToOrganisation({
      assigneeIds: [1, 2, 3], organisationId: 68,
    });
    expect(result.updated).toBe(3);
  });
});
