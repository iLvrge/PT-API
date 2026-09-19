'use strict';

// The conveyance-text grid: GET /admin/company/transactions/:id (and the
// /:representativeID variant), PUT /admin/company/transactions/:customerID,
// the grid's search box (/transactions/0?search=), the lender drill-down
// (/company/lenders/:id/companies) and the company on/off column
// (PUT /company/:id/company_selection). All were missing from the rewrite.

jest.mock('../../src/modules/admin-company-search/admin-company-search.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');
jest.mock('../../src/utils/google');

const repo = require('../../src/modules/admin-company-search/admin-company-search.repository');
const tenants = require('../../src/db/tenant-connections');
const q = require('../../src/db/query');
const service = require('../../src/modules/admin-company-search/admin-company-search.service');
const { CONVEYANCE_ORDINALS } = require('../../src/modules/admin-company-search/conveyance.constants');

beforeEach(() => {
  jest.clearAllMocks();
  tenants.getConnection.mockResolvedValue({ name: 'tenant', query: jest.fn().mockResolvedValue([{}, 2]) });
  q.selectAll.mockResolvedValue([{ company_id: 1 }, { company_id: 2 }]);
  repo.assignmentsForCompanies.mockResolvedValue([{ id: 306200426, text: 'ASSIGNMENT' }]);
});

describe('transactionsFor', () => {
  it('answers the five keys the grid reads', async () => {
    const result = await service.transactionsFor({ organisationId: 68, portfolios: [] });
    expect(Object.keys(result).sort()).toEqual(
      ['assignment_type', 'conveyance', 'list', 'type', 'update_conveyance']
    );
  });

  it('carries the name-to-number map the console posts back with', async () => {
    const { assignment_type: map } = await service.transactionsFor({ organisationId: 68, portfolios: [] });
    expect(map.assignment).toBe(0);
    expect(map.security).toBe(17);
    expect(map.partialrelease).toBe(19);
  });

  it('still returns the option lists when the customer has no companies', async () => {
    tenants.getConnection.mockResolvedValue(null);
    const result = await service.transactionsFor({ organisationId: 68, portfolios: [] });
    expect(result.list).toEqual([]);
    expect(result.type.length).toBeGreaterThan(0);
    expect(repo.assignmentsForCompanies).not.toHaveBeenCalled();
  });

  it('scopes to the chosen companies', async () => {
    await service.transactionsFor({ organisationId: 68, portfolios: [55] });
    expect(repo.assignmentsForCompanies).toHaveBeenCalledWith([55]);
  });
});

describe('retypeTransaction', () => {
  it('writes a known conveyance type', async () => {
    repo.setReviewedConveyance.mockResolvedValue({ rf_id: 1, convey_ty: 'security', created: false });
    await service.retypeTransaction({ rfId: 1, conveyanceType: 'security' });
    expect(repo.setReviewedConveyance).toHaveBeenCalledWith({ rfId: 1, conveyanceType: 'security' });
  });

  it('refuses a type outside the fixed set rather than writing it', async () => {
    await expect(
      service.retypeTransaction({ rfId: 1, conveyanceType: 'whatever' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.setReviewedConveyance).not.toHaveBeenCalled();
  });

  it('refuses a request with no transaction', async () => {
    await expect(
      service.retypeTransaction({ rfId: 0, conveyanceType: 'security' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('accepts every type in the console map', async () => {
    repo.setReviewedConveyance.mockResolvedValue({});
    for (const name of Object.keys(CONVEYANCE_ORDINALS)) {
      await expect(service.retypeTransaction({ rfId: 1, conveyanceType: name })).resolves.toBeDefined();
    }
  });
});

describe('searchTransactions', () => {
  it('does not scan the corpus for an empty term', async () => {
    await expect(service.searchTransactions('')).resolves.toEqual([]);
    expect(repo.searchConveyanceText).not.toHaveBeenCalled();
  });

  it('passes a real term through', async () => {
    repo.searchConveyanceText.mockResolvedValue([{ id: 1 }]);
    await service.searchTransactions('SECURITY');
    expect(repo.searchConveyanceText).toHaveBeenCalledWith('SECURITY');
  });
});

describe('companiesForLender', () => {
  it('returns [] for an empty lender list rather than querying', async () => {
    await expect(service.companiesForLender([])).resolves.toEqual([]);
    expect(repo.companiesForLender).not.toHaveBeenCalled();
  });

  it('passes the lender ids through', async () => {
    repo.companiesForLender.mockResolvedValue([]);
    await service.companiesForLender([7, 8]);
    expect(repo.companiesForLender).toHaveBeenCalledWith([7, 8]);
  });
});

describe('setCompanySelection', () => {
  it('updates the chosen companies in the tenant', async () => {
    const tenant = { query: jest.fn().mockResolvedValue([{}, 2]) };
    tenants.getConnection.mockResolvedValue(tenant);

    const result = await service.setCompanySelection({
      organisationId: 68, companyIds: [1, 2], status: '1',
    });

    const [sql, options] = tenant.query.mock.calls[0];
    expect(sql).toContain('UPDATE representative SET status');
    expect(options.replacements).toEqual({ status: 1, companyIds: [1, 2] });
    expect(result.status).toBe(1);
  });

  it('normalises any truthy status to 1 and anything else to 0', async () => {
    const tenant = { query: jest.fn().mockResolvedValue([{}, 1]) };
    tenants.getConnection.mockResolvedValue(tenant);

    await service.setCompanySelection({ organisationId: 68, companyIds: [1], status: '0' });
    expect(tenant.query.mock.calls[0][1].replacements.status).toBe(0);
  });

  it('refuses an empty list rather than updating every company', async () => {
    await expect(
      service.setCompanySelection({ organisationId: 68, companyIds: [], status: '1' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('503s when the customer has no tenant database', async () => {
    tenants.getConnection.mockResolvedValue(null);
    await expect(
      service.setCompanySelection({ organisationId: 68, companyIds: [1], status: '1' })
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('googleAuthToken', () => {
  const google = require('../../src/utils/google');

  it('refuses a request with no code rather than calling Google', async () => {
    await expect(service.googleAuthToken(undefined)).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.googleAuthToken('')).rejects.toMatchObject({ statusCode: 400 });
    expect(google.exchangeCode).not.toHaveBeenCalled();
  });

  it('returns the tokens Google issued', async () => {
    google.exchangeCode.mockResolvedValue({ access_token: 'a', refresh_token: 'r' });
    await expect(service.googleAuthToken('code-123')).resolves.toEqual({
      access_token: 'a', refresh_token: 'r',
    });
    expect(google.exchangeCode).toHaveBeenCalledWith('code-123');
  });

  it('turns a rejected code into a 400, not a 500', async () => {
    google.exchangeCode.mockRejectedValue(new Error('invalid_grant'));
    await expect(service.googleAuthToken('bad')).rejects.toMatchObject({ statusCode: 400 });
  });
});
