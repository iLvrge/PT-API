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

describe('customers.constants.checkTabs', () => {
  const { checkTabs } = require('../../src/modules/customers/customers.constants');
  it('expands 81 into the lending cluster when none present', () => {
    expect(checkTabs([81]).sort((a, b) => a - b)).toEqual([5, 11, 12, 13, 16, 81]);
  });
  it('does not expand 81 when a lending tab is already present', () => {
    expect(checkTabs([81, 5])).toEqual([81, 5]);
  });
  it('expands 17 into acquisitions', () => {
    expect(checkTabs([17])).toEqual([17, 1, 6]);
  });
  it('does not mutate its input', () => {
    const input = [81];
    checkTabs(input);
    expect(input).toEqual([81]);
  });
});

describe('customers.service.assetTypeAssignments', () => {
  it('400 without customers (legacy 500 made explicit)', async () => {
    await expect(
      service.assetTypeAssignments({ companies: [], tabs: [], customers: [], layout: 'assigned' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('uses the default assignment tabs and shared org partition', async () => {
    repo.assetTypeAssignments.mockResolvedValue([{ rf_id: 1 }]);
    const res = await service.assetTypeAssignments({ companies: [9], tabs: [], customers: [4], layout: 'assigned' });
    const args = repo.assetTypeAssignments.mock.calls[0][0];
    expect(args.tabs).toHaveLength(16);
    expect(args.layout).toBe(30);
    expect(args.organisationId).toBe(0);
    expect(res.total_records).toBe(1);
  });
});

describe('customers.service.assetTypeAssets', () => {
  it('short-circuits on zero count', async () => {
    repo.companyRepresentativeIds.mockResolvedValue([9]);
    repo.assetTypeAssetsCount.mockResolvedValue(0);
    const res = await service.assetTypeAssets({ id: 't' }, { companies: [], tabs: [], customers: [], assignments: [], limit: 0, offset: 0 });
    expect(res).toEqual({ list: [], total_records: 0 });
    expect(repo.assetTypeAssets).not.toHaveBeenCalled();
  });

  it('passes tab/customer/assignment filters through', async () => {
    repo.assetTypeAssetsCount.mockResolvedValue(5);
    repo.assetTypeAssets.mockResolvedValue([{ asset: '123' }]);
    await service.assetTypeAssets({ id: 't' }, { companies: [9], tabs: [17], customers: [3], assignments: [7], limit: 10, offset: 0 });
    const [filters, replacements, lim] = repo.assetTypeAssets.mock.calls[0];
    expect(filters.tabs).toEqual([17, 1, 6]);
    expect(replacements.customers).toEqual([3]);
    expect(replacements.assignments).toEqual([7]);
    expect(lim).toBe(10);
  });
});
