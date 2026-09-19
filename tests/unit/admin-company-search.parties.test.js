'use strict';

// The cited-assignee and party grids in the admin console.
//
// Two separate problems. GET /admin/company/cited/:id existed but answered a
// bare array, while the console reads `citedAssignees`, `organizations` and
// `total_records` off the response — so the panel stayed empty and no error was
// raised anywhere. The three party endpoints were missing outright (404).
//
// Both grids take sort_by / sort_direction / rows_per_page / current_page from
// the query string, and the legacy handlers spliced all four straight into the
// SQL; the ordering and paging is asserted here as well.

jest.mock('../../src/modules/admin-company-search/admin-company-search.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');

const repo = require('../../src/modules/admin-company-search/admin-company-search.repository');
const tenants = require('../../src/db/tenant-connections');
const q = require('../../src/db/query');
const service = require('../../src/modules/admin-company-search/admin-company-search.service');

const GRID = {
  organisationId: 146, portfolios: [], sortBy: 'occurences', sortDirection: 'desc',
  rowsPerPage: 10, currentPage: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  tenants.getConnection.mockResolvedValue({ name: 'tenant' });
  q.selectAll.mockResolvedValue([{ company_id: 1 }, { company_id: 2 }]);
  repo.citedAssigneesCount.mockResolvedValue(2336);
  repo.citedAssigneesPage.mockResolvedValue([{ assignee_id: 110726 }]);
  repo.partyNamesForCompanies.mockResolvedValue([{ partyName: 'Acme Inc' }]);
  repo.rememberPartyNames.mockResolvedValue([]);
  repo.partiesCount.mockResolvedValue(1376);
  repo.partiesPage.mockResolvedValue([{ assignee_id: 11476976 }]);
});

describe('citedOrganisations', () => {
  it('answers the three keys the console reads, not a bare array', async () => {
    const result = await service.citedOrganisations(GRID);
    expect(Array.isArray(result)).toBe(false);
    expect(Object.keys(result).sort()).toEqual(['citedAssignees', 'organizations', 'total_records']);
    expect(result.total_records).toBe(2336);
    expect(result.citedAssignees).toHaveLength(1);
  });

  it('scopes to the chosen portfolio without consulting the tenant', async () => {
    await service.citedOrganisations({ ...GRID, portfolios: [7] });
    expect(tenants.getConnection).not.toHaveBeenCalled();
    expect(repo.citedAssigneesCount).toHaveBeenCalledWith(
      expect.objectContaining({ companyIds: [7] })
    );
  });

  it('falls back to every company in the tenant when no portfolio is chosen', async () => {
    await service.citedOrganisations(GRID);
    expect(repo.citedAssigneesCount).toHaveBeenCalledWith(
      expect.objectContaining({ companyIds: [1, 2] })
    );
  });

  it('answers empty when the customer has no tenant database', async () => {
    tenants.getConnection.mockResolvedValue(null);
    await expect(service.citedOrganisations(GRID)).resolves.toEqual({
      citedAssignees: [], organizations: [], total_records: 0,
    });
    expect(repo.citedAssigneesCount).not.toHaveBeenCalled();
  });

  it('does not fetch a page when the count is zero', async () => {
    repo.citedAssigneesCount.mockResolvedValue(0);
    const result = await service.citedOrganisations(GRID);
    expect(result.total_records).toBe(0);
    expect(repo.citedAssigneesPage).not.toHaveBeenCalled();
  });

  it('passes the paging and sorting through to the repository', async () => {
    await service.citedOrganisations({ ...GRID, sortBy: 'domain', currentPage: 3 });
    expect(repo.citedAssigneesPage).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'domain', currentPage: 3, rowsPerPage: 10 })
    );
  });
});

describe('parties', () => {
  it('answers { list, total_records }', async () => {
    const result = await service.parties({ ...GRID, savedLogos: false });
    expect(Object.keys(result).sort()).toEqual(['list', 'total_records']);
    expect(result.total_records).toBe(1376);
  });

  it('records newly seen party names on the shared view', async () => {
    await service.parties({ ...GRID, savedLogos: false });
    expect(repo.rememberPartyNames).toHaveBeenCalledWith(['Acme Inc']);
  });

  it('never writes when browsing a customer\'s saved logos', async () => {
    await service.parties({ ...GRID, savedLogos: true });
    expect(repo.rememberPartyNames).not.toHaveBeenCalled();
    expect(repo.partiesPage).toHaveBeenCalledWith(expect.objectContaining({ savedLogos: true }));
  });

  it('answers empty when no party names come back', async () => {
    repo.partyNamesForCompanies.mockResolvedValue([]);
    await expect(service.parties({ ...GRID, savedLogos: false }))
      .resolves.toEqual({ list: [], total_records: 0 });
    expect(repo.partiesCount).not.toHaveBeenCalled();
  });

  it('drops blank names rather than querying for an empty string', async () => {
    repo.partyNamesForCompanies.mockResolvedValue([
      { partyName: 'Acme Inc' }, { partyName: '' }, { partyName: null },
    ]);
    await service.parties({ ...GRID, savedLogos: false });
    expect(repo.partiesCount).toHaveBeenCalledWith(expect.objectContaining({ names: ['Acme Inc'] }));
  });

  it('does not fetch a page when the count is zero', async () => {
    repo.partiesCount.mockResolvedValue(0);
    await expect(service.parties({ ...GRID, savedLogos: false }))
      .resolves.toEqual({ list: [], total_records: 0 });
    expect(repo.partiesPage).not.toHaveBeenCalled();
  });
});
