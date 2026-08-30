'use strict';

jest.mock('../../src/modules/customers/customers.repository');

const repo = require('../../src/modules/customers/customers.repository');
const service = require('../../src/modules/customers/customers.service');
const { findLayout } = require('../../src/modules/customers/customers.constants');

const tenant = { id: 't' };

beforeEach(() => jest.clearAllMocks());

describe('customers.constants.findLayout', () => {
  it('maps known layout names and defaults unknown to 15', () => {
    expect(findLayout('assigned')).toBe(30);
    expect(findLayout('pay_maintainence_fee')).toBe(35);
    expect(findLayout('nope')).toBe(15);
    expect(findLayout(undefined)).toBe(15);
  });
});

describe('customers.service.assetTypeTabs', () => {
  it('resolves companies from the tenant when none given', async () => {
    repo.companyRepresentativeIds.mockResolvedValue([9, 10]);
    repo.assetTypeTabs.mockResolvedValue([{ tab_id: 1, customer_count: 3 }]);
    const res = await service.assetTypeTabs(tenant, 118, []);
    expect(repo.companyRepresentativeIds).toHaveBeenCalledWith(tenant);
    expect(repo.assetTypeTabs).toHaveBeenCalledWith([9, 10], 118);
    expect(res[0].tab_id).toBe(1);
  });

  it('returns [] when the tenant has no companies', async () => {
    repo.companyRepresentativeIds.mockResolvedValue([]);
    await expect(service.assetTypeTabs(tenant, 118, [])).resolves.toEqual([]);
    expect(repo.assetTypeTabs).not.toHaveBeenCalled();
  });
});

describe('customers.service.assetTypeCompanies', () => {
  it('uses the default TABS and returns {list,total_records}, scoped to org 0', async () => {
    repo.assetTypeCompaniesCount.mockResolvedValue(2);
    repo.assetTypeCompanies.mockResolvedValue([{ id: 1, name: 'A' }]);
    const res = await service.assetTypeCompanies(tenant, [9], [], 0, 0);
    expect(repo.assetTypeCompaniesCount.mock.calls[0][2]).toBe(0);
    expect(res.total_records).toBe(2);
  });

  it('short-circuits when the count is 0', async () => {
    repo.assetTypeCompaniesCount.mockResolvedValue(0);
    const res = await service.assetTypeCompanies(tenant, [9], [1], 10, 0);
    expect(res).toEqual({ list: [], total_records: 0 });
    expect(repo.assetTypeCompanies).not.toHaveBeenCalled();
  });
});

describe('customers.service.assetTypeTabCompanies', () => {
  it('runs the cross-charset query with the resolved layout id', async () => {
    repo.assetTypeTabCompanies.mockResolvedValue([{ id: 1, entityName: 'Acme' }]);
    const res = await service.assetTypeTabCompanies([9], 5, 'assigned');
    expect(repo.assetTypeTabCompanies).toHaveBeenCalledWith(9, 5, 30, 0);
    expect(res.total_records).toBe(1);
  });
});
