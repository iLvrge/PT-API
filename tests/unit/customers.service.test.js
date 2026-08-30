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

describe('customers.service.lawfirms', () => {
  it('falls back to dashboard groups without rfID, honoring bank mode', async () => {
    repo.lawfirmGroups.mockResolvedValue([{ id: 1, lawfirm: 'F' }]);
    await service.lawfirms({ companies: [9, 10], rfId: 0, orgType: 2 });
    const args = repo.lawfirmGroups.mock.calls[0][0];
    expect(args.companies).toEqual([9, 10]); // real array, not '9,10'
    expect(args.bankMode).toBe(true);
  });

  it('with rfID ranks correspondents by distance to the representative name', async () => {
    repo.lawfirmForRfId.mockResolvedValue({ representative_id: 4, representative_name: 'Smith LLP', cname: 'X' });
    repo.lawfirmCorrespondents.mockResolvedValue([{ id: 1, lawfirm: 'Smith, LLP.' }, { id: 2, lawfirm: 'Jones LLC' }]);
    const list = await service.lawfirms({ companies: [9], rfId: 77, orgType: 1 });
    expect(list[0].distance).toBeDefined();
    expect(list[0].distance).toBeLessThan(list[1].distance);
  });

  it('matches by cname when the firm has no representative', async () => {
    repo.lawfirmForRfId.mockResolvedValue({ representative_id: 0, cname: 'ACME LAW' });
    repo.lawfirmCorrespondents.mockResolvedValue([]);
    await service.lawfirms({ companies: [9], rfId: 5, orgType: 1 });
    const args = repo.lawfirmCorrespondents.mock.calls[0][0];
    expect(args.representativeId).toBeUndefined();
    expect(args.cname).toBe('ACME LAW');
  });
});

describe('customers.service.portfolios', () => {
  it('tab mode nests collections and their assets under each party', async () => {
    repo.portfolioParties.mockResolvedValue([{ id: 1, name: 'A' }]);
    repo.portfolioCollections.mockResolvedValue([
      { assignor_and_assignee_id: 1, rf_id: 100, exec_dt: '2020-01-01' },
    ]);
    repo.assetsForRfIds.mockResolvedValue([{ rf_id: 100, application: '123', patent: '456' }]);
    repo.tabCustomerCounts.mockResolvedValue([{ tab_id: 3, customer_count: 2 }]);

    const res = await service.portfolios({ id: 't' }, { tabId: 3, portfolio: [9], limit: 0, offset: 0 });
    expect(res.portfolios[0].collections[0].assets[0].patent).toBe('456');
    expect(res.tabs[0].tab_id).toBe(3);
  });

  it('grouping mode resolves tenant companies when no portfolio given', async () => {
    repo.companyRepresentativeIds.mockResolvedValue([9]);
    repo.portfolioRepresentativeTabs.mockResolvedValue([{ representative_id: 9, tab_id: 1 }]);
    repo.tabCustomerCounts.mockResolvedValue([]);
    const res = await service.portfolios({ id: 't' }, { tabId: undefined, portfolio: [], limit: 0, offset: 0 });
    expect(repo.portfolioRepresentativeTabs).toHaveBeenCalledWith([9], 0);
    expect(res.portfolios).toHaveLength(1);
  });
});

describe('customers.service transactions utilities', () => {
  it('groupids short-circuits on empty and wraps results', async () => {
    await expect(service.transactionsByGroupIds([])).resolves.toEqual({ list: [], total_records: 0 });
    repo.transactionsByGroupIds.mockResolvedValue([{ rf_id: 1, assets: 3 }]);
    const res = await service.transactionsByGroupIds([1, 2]);
    expect(res.total_records).toBe(1);
  });

  it('transactionsAddress calls the procedure with CSV args and layout 15', async () => {
    repo.correctAddress.mockResolvedValue([{ a: 1 }]);
    await service.transactionsAddress({ companies: [9, 10], tabs: [17], customers: [3] });
    const args = repo.correctAddress.mock.calls[0][0];
    expect(args.companiesCsv).toBe('9,10');
    expect(args.tabsCsv).toBe('17,1,6'); // checkTabs expansion, joined
    expect(args.layoutId).toBe(15);
  });

  it('incorrectNames merges all same-key variants into the first occurrence', async () => {
    repo.tenantRepresentativeName.mockResolvedValue('ACME INC');
    repo.originalAssigneeName.mockResolvedValue('ACME INC');
    repo.incorrectNamesList.mockResolvedValue([
      { name: 'ACME, INC.', count_assets: 2, distance: 0 },
      { name: 'ACME INC', count_assets: 5, distance: 0 },   // same key -> merged
      { name: 'ACME  INC.', count_assets: 3, distance: 0 }, // same key -> merged
      { name: 'ACME LLC', count_assets: 1, distance: 0 },
    ]);
    const res = await service.incorrectNames({ id: 't' }, { companies: [9], id: 0, orgType: 1 });
    const first = res.find((r) => r.name === 'ACME, INC.');
    expect(first.count_assets).toBe(10); // 2 + 5 + 3, matching legacy merge
    expect(res.find((r) => r.name === 'ACME LLC')).toBeDefined();
    expect(res).toHaveLength(2);
  });

  it('incorrectNames excludes a first-seen exact match (distance 0)', async () => {
    repo.tenantRepresentativeName.mockResolvedValue('ACME LLC');
    repo.originalAssigneeName.mockResolvedValue('ACME LLC');
    repo.incorrectNamesList.mockResolvedValue([
      { name: 'ACME LLC', count_assets: 4, distance: 0 },   // exact -> excluded
      { name: 'ACME LLC CORP', count_assets: 1, distance: 0 },
    ]);
    const res = await service.incorrectNames({ id: 't' }, { companies: [9], id: 0, orgType: 1 });
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('ACME LLC CORP');
  });

  it('queueAddress binds the composed address (no SQL splicing)', async () => {
    repo.tenantAddress.mockResolvedValue({ street_address: '1 Main', suite: null, city: 'NYC', state: 'NY', zip_code: '10001', country: 'US' });
    repo.queueAddressList.mockResolvedValue([]);
    await service.queueAddress({ id: 't' }, { groupIds: [1], newAddressId: 7, companyIds: [9] });
    const args = repo.queueAddressList.mock.calls[0][0];
    expect(args.newAddress).toBe('1 Main NYC NY 10001 US');
    expect(args.newAddressId).toBe(7);
  });

  it('queueName resolves the name from the tenant when not supplied and uppercases it', async () => {
    repo.tenantRepresentativeNameById.mockResolvedValue('Acme Inc');
    repo.queueNameList.mockResolvedValue([]);
    await service.queueName({ id: 't' }, { groupIds: [1], newName: undefined, companyIds: [9] });
    expect(repo.queueNameList.mock.calls[0][0].newName).toBe('ACME INC');
  });
});

describe('customers.service.layoutParties', () => {
  it('routes non-default layouts to the dashboard query with bank mode', async () => {
    repo.partiesByLayout.mockResolvedValue([{ id: 1 }]);
    await service.layoutParties({ layout: 'assigned', companies: [9, 10], tabs: [], customerType: 0, orgType: 2 });
    const args = repo.partiesByLayout.mock.calls[0][0];
    expect(args.layoutId).toBe(30);
    expect(args.companies).toEqual([9, 10]); // real array, not '9,10'
    expect(args.bankMode).toBe(true);
    expect(repo.partiesDefault).not.toHaveBeenCalled();
  });

  it('routes the default layout to the transactions query with expanded tabs', async () => {
    repo.partiesDefault.mockResolvedValue([]);
    await service.layoutParties({ layout: 'unknown', companies: [9], tabs: [17], customerType: 1, orgType: 1 });
    const args = repo.partiesDefault.mock.calls[0][0];
    expect(args.layoutId).toBe(15);
    expect(args.tabs).toEqual([17, 1, 6]);
    expect(args.customerType).toBe(1);
  });
});

describe('customers.service.layoutActivities', () => {
  it('calls the procedure with CSV companies and resolved layout', async () => {
    repo.layoutActivities.mockResolvedValue([{ x: 1 }]);
    await service.layoutActivities({ layout: 'acquired', companies: [9, 10] });
    const args = repo.layoutActivities.mock.calls[0][0];
    expect(args.companiesCsv).toBe('9,10');
    expect(args.layoutId).toBe(32);
  });
});

describe('customers.service.rfIdAssets', () => {
  it('returns [] when the organisation does not exist', async () => {
    repo.organisationExists.mockResolvedValue(false);
    await expect(service.rfIdAssets(118, 5)).resolves.toEqual([]);
    expect(repo.rfIdAssets).not.toHaveBeenCalled();
  });

  it('lists assets for a valid org + rf_id', async () => {
    repo.organisationExists.mockResolvedValue(true);
    repo.rfIdAssets.mockResolvedValue([{ id: 'a', name: '123' }]);
    await expect(service.rfIdAssets(118, 5)).resolves.toHaveLength(1);
  });
});

describe('customers.service.buildLifeSpan', () => {
  it('spans 20 years inclusive per application, aggregate excludes the max year', () => {
    const rows = [{ application: 'A', appno_date: '2010-06-01' }];
    const out = service.buildLifeSpan(rows);
    expect(out[0]).toEqual({ year: 2010, count: 1 });
    expect(out[out.length - 1]).toEqual({ year: 2029, count: 1 }); // 2030 excluded (legacy i < max)
    expect(out).toHaveLength(20);
  });

  it('overlapping applications sum per year and duplicates are ignored', () => {
    const rows = [
      { application: 'A', appno_date: '2010-01-01' },
      { application: 'B', appno_date: '2015-01-01' },
      { application: 'A', appno_date: '2011-01-01' }, // duplicate application
    ];
    const out = service.buildLifeSpan(rows);
    expect(out.find((r) => r.year === 2016).count).toBe(2);
    expect(out.find((r) => r.year === 2012).count).toBe(1);
  });

  it('events resolves tenant portfolios when none given', async () => {
    repo.companyRepresentativeIds.mockResolvedValue([9]);
    repo.assetLifeSpanRows.mockResolvedValue([]);
    await service.events({ id: 't' }, 118, { tabId: 0, portfolio: [] });
    expect(repo.assetLifeSpanRows.mock.calls[0][0].organisationId).toBe(118); // real org, not 0
  });
});
