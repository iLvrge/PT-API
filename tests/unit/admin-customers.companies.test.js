'use strict';

// GET /admin/customers/:id/companies and /patents — both were missing from the
// rewrite (404). The company list is the interesting one: the rows come from the
// customer's tenant database and the figures from the shared corpus, so they are
// joined in JS. A company with no summary row must still appear, with zeros.

jest.mock('../../src/modules/admin-customers/admin-customers.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');

const repo = require('../../src/modules/admin-customers/admin-customers.repository');
const tenants = require('../../src/db/tenant-connections');
const q = require('../../src/db/query');
const service = require('../../src/modules/admin-customers/admin-customers.service');

const COMPANIES = [
  { representative_id: 10, original_name: 'Acme Inc', representative_name: 'Acme Inc', status: 0 },
  { representative_id: 11, original_name: 'Beta Ltd', representative_name: 'Beta Ltd', status: 0 },
];

beforeEach(() => {
  jest.clearAllMocks();
  repo.findCustomer.mockResolvedValue({ organisation_id: 146 });
  tenants.getConnection.mockResolvedValue({ name: 'tenant' });
  q.selectAll.mockResolvedValue(COMPANIES.map((c) => ({ ...c })));
  repo.summaryForCompanies.mockResolvedValue([]);
  repo.latestUpdateLogByCompany.mockResolvedValue([]);
  repo.latestFamilyLogByCompany.mockResolvedValue([]);
});

describe('customerCompanies', () => {
  it('attaches the summary figures to the matching company', async () => {
    repo.summaryForCompanies.mockResolvedValue([
      { company_id: 10, assets: 256, no_of_transactions: 267, no_of_entities: 5,
        no_of_employees: 57, no_of_parties: 30, product: 570 },
    ]);

    const [acme] = await service.customerCompanies(146);
    expect(acme).toMatchObject({
      representative_id: 10, assets: 256, no_of_transactions: 267, no_of_parties: 30, product: 570,
    });
  });

  it('keeps a company that has no summary row, reported as zeros', async () => {
    const rows = await service.customerCompanies(146);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      representative_id: 11, assets: 0, no_of_transactions: 0, product: 0,
      arrow_assets: 0, arrow_transactions: 0, family: 0, updated: null,
    });
  });

  it('derives arrows per asset and per transaction by floor division', async () => {
    repo.summaryForCompanies.mockResolvedValue([
      { company_id: 10, assets: 5, no_of_transactions: 21, product: 51 },
    ]);
    const [acme] = await service.customerCompanies(146);
    expect(acme.arrow_assets).toBe(10); // floor(51 / 5)
    expect(acme.arrow_transactions).toBe(2); // floor(51 / 21)
  });

  it('does not divide by zero when a company has no assets', async () => {
    repo.summaryForCompanies.mockResolvedValue([
      { company_id: 10, assets: 0, no_of_transactions: 0, product: 99 },
    ]);
    const [acme] = await service.customerCompanies(146);
    expect(acme.arrow_assets).toBe(0);
    expect(acme.arrow_transactions).toBe(0);
  });

  it('reports the last update as a plain date', async () => {
    repo.latestUpdateLogByCompany.mockResolvedValue([
      { company_id: 10, id: 7, end_time: '2026-03-04T09:15:00Z' },
    ]);
    const [acme] = await service.customerCompanies(146);
    expect(acme.updated).toBe('2026-03-04');
  });

  it('reports updated as null when the log row has an unusable timestamp', async () => {
    repo.latestUpdateLogByCompany.mockResolvedValue([
      { company_id: 10, id: 7, end_time: '0000-00-00 00:00:00' },
    ]);
    const [acme] = await service.customerCompanies(146);
    expect(acme.updated).toBeNull();
  });

  it('carries the retrieved family count through', async () => {
    repo.latestFamilyLogByCompany.mockResolvedValue([
      { company_id: 11, id: 3, retrieved_assets: '42' },
    ]);
    const rows = await service.customerCompanies(146);
    expect(rows[1].family).toBe(42);
  });

  it('returns [] for an unknown customer without opening a tenant connection', async () => {
    repo.findCustomer.mockResolvedValue(null);
    await expect(service.customerCompanies(999)).resolves.toEqual([]);
    expect(tenants.getConnection).not.toHaveBeenCalled();
  });

  it('returns [] when the customer has no tenant database', async () => {
    tenants.getConnection.mockResolvedValue(null);
    await expect(service.customerCompanies(146)).resolves.toEqual([]);
  });

  it('skips the corpus lookups entirely when the tenant has no companies', async () => {
    q.selectAll.mockResolvedValue([]);
    await expect(service.customerCompanies(146)).resolves.toEqual([]);
    expect(repo.summaryForCompanies).not.toHaveBeenCalled();
  });
});

describe('customerPatents', () => {
  beforeEach(() => repo.customerPatents.mockResolvedValue([{ number: 'D938906' }]));

  it('passes the chosen companies through', async () => {
    await service.customerPatents({ organisationId: 146, representativeIds: [1, 2], direction: 'DESC' });
    expect(repo.customerPatents).toHaveBeenCalledWith({
      organisationId: 146, representativeIds: [1, 2], direction: 'DESC',
    });
  });

  it('returns [] for an unknown customer', async () => {
    repo.findCustomer.mockResolvedValue(null);
    await expect(
      service.customerPatents({ organisationId: 999, representativeIds: [], direction: 'ASC' })
    ).resolves.toEqual([]);
    expect(repo.customerPatents).not.toHaveBeenCalled();
  });
});
