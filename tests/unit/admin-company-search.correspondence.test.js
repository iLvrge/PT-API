'use strict';

// GET /admin/company/assignments/:id and /admin/company/raw/assignments/:id.
//
// Both routes existed, but the rewrite read `:id` as an rf_id and looked up a
// single assignment — so they answered 404 "No such transaction" for every
// customer the console asked about. `:id` is the CUSTOMER: the console wants
// the whole correspondence list for that customer's portfolio.

jest.mock('../../src/modules/admin-company-search/admin-company-search.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');

const repo = require('../../src/modules/admin-company-search/admin-company-search.repository');
const tenants = require('../../src/db/tenant-connections');
const q = require('../../src/db/query');
const service = require('../../src/modules/admin-company-search/admin-company-search.service');

beforeEach(() => {
  jest.clearAllMocks();
  tenants.getConnection.mockResolvedValue({ name: 'tenant' });
  q.selectAll.mockResolvedValue([{ company_id: 1 }, { company_id: 2 }]);
  repo.partyIdsForCompanies.mockResolvedValue([
    { assignor_and_assignee_id: 55 }, { assignor_and_assignee_id: 56 },
  ]);
  repo.correspondenceAddresses.mockResolvedValue([{ rf_id: 900 }]);
  repo.rawCorrespondence.mockResolvedValue([{ rf_id: 900 }, { rf_id: 901 }]);
});

describe('correspondenceFor', () => {
  it('returns a list for a customer, not a single transaction', async () => {
    const rows = await service.correspondenceFor({ organisationId: 146, portfolios: [], raw: false });
    expect(Array.isArray(rows)).toBe(true);
    expect(repo.correspondenceAddresses).toHaveBeenCalledWith({
      companyIds: [1, 2], partyIds: [55, 56],
    });
  });

  it('uses the full address query for the raw variant', async () => {
    await service.correspondenceFor({ organisationId: 146, portfolios: [], raw: true });
    expect(repo.rawCorrespondence).toHaveBeenCalled();
    expect(repo.correspondenceAddresses).not.toHaveBeenCalled();
  });

  it('scopes to the chosen portfolio without consulting the tenant', async () => {
    await service.correspondenceFor({ organisationId: 146, portfolios: [9], raw: false });
    expect(tenants.getConnection).not.toHaveBeenCalled();
    expect(repo.partyIdsForCompanies).toHaveBeenCalledWith([9]);
  });

  it('falls back to every company in the tenant when no portfolio is chosen', async () => {
    await service.correspondenceFor({ organisationId: 146, portfolios: [], raw: false });
    expect(repo.partyIdsForCompanies).toHaveBeenCalledWith([1, 2]);
  });

  it('returns [] when the customer has no tenant database', async () => {
    tenants.getConnection.mockResolvedValue(null);
    await expect(
      service.correspondenceFor({ organisationId: 146, portfolios: [], raw: false })
    ).resolves.toEqual([]);
    expect(repo.partyIdsForCompanies).not.toHaveBeenCalled();
  });

  it('still asks for the list when a customer has no recorded parties', async () => {
    repo.partyIdsForCompanies.mockResolvedValue([]);
    await service.correspondenceFor({ organisationId: 146, portfolios: [], raw: false });
    expect(repo.correspondenceAddresses).toHaveBeenCalledWith({
      companyIds: [1, 2], partyIds: [],
    });
  });

  it('never throws 404 for a customer with no correspondence', async () => {
    repo.correspondenceAddresses.mockResolvedValue([]);
    await expect(
      service.correspondenceFor({ organisationId: 146, portfolios: [], raw: false })
    ).resolves.toEqual([]);
  });
});
