'use strict';

jest.mock('../../src/modules/company/company.repository');

const repo = require('../../src/modules/company/company.repository');
const service = require('../../src/modules/company/company.service');

const tenant = { id: 't' };

beforeEach(() => jest.clearAllMocks());

describe('company.service.addRequest', () => {
  it('returns the existing request without creating', async () => {
    repo.findRequestByName.mockResolvedValue({ company_id: 1, name: 'Acme' });
    await service.addRequest(118, 'Acme');
    expect(repo.createRequest).not.toHaveBeenCalled();
  });
  it('creates with status 0 and today as request_date', async () => {
    repo.findRequestByName.mockResolvedValue(null);
    repo.createRequest.mockResolvedValue({ toJSON: () => ({ company_id: 2 }) });
    await service.addRequest(118, 'New Co');
    const args = repo.createRequest.mock.calls[0][0];
    expect(args).toMatchObject({ name: 'New Co', status: 0, organisation_id: 118 });
    expect(args.request_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('company.service.updateCompany', () => {
  it('renames only type-1 groups', async () => {
    repo.findRepresentative.mockResolvedValue({ representative_id: 5, type: 1, child: 0, parent_id: 0 });
    repo.companiesWithChildren.mockResolvedValue([]);
    await service.updateCompany(tenant, 5, { name: 'New Name' });
    expect(repo.updateRepresentative.mock.calls[0][2]).toEqual({ original_name: 'New Name', representative_name: 'New Name' });
  });

  it('re-parenting to 0 clears the child flag; to >0 sets it and activates the parent', async () => {
    repo.findRepresentative.mockResolvedValue({ representative_id: 5, type: 0, child: 1, parent_id: 0 });
    repo.companiesWithChildren.mockResolvedValue([]);
    await service.updateCompany(tenant, 5, { parent_id: 0 });
    expect(repo.updateRepresentative.mock.calls[0][2]).toEqual({ parent_id: 0, child: 0 });

    jest.clearAllMocks();
    repo.findRepresentative.mockResolvedValue({ representative_id: 5, type: 0, child: 0, parent_id: 0 });
    repo.companiesWithChildren.mockResolvedValue([]);
    await service.updateCompany(tenant, 5, { parent_id: 9 });
    expect(repo.updateRepresentative.mock.calls[0][2]).toEqual({ parent_id: 9, child: 1 });
    expect(repo.updateRepresentative.mock.calls[1]).toEqual([tenant, 9, { status: 1 }]);
  });

  it('400 when no valid change is supplied', async () => {
    repo.findRepresentative.mockResolvedValue({ representative_id: 5, type: 0 });
    await expect(service.updateCompany(tenant, 5, {})).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('company.service.companyList', () => {
  it('aggregates group counters from child reports and orders share-selected first', async () => {
    repo.countRepresentativesWhere.mockResolvedValue(2);
    repo.representativesWhere
      .mockResolvedValueOnce([
        { representative_id: 1, company_id: 0, type: 1, status: 1, original_name: 'Group', representative_name: 'Group' },
        { representative_id: 2, company_id: 22, type: 0, status: 1, original_name: 'Solo', representative_name: 'Solo' },
      ])
      .mockResolvedValueOnce([
        { representative_id: 3, company_id: 33, parent_id: 1, original_name: 'Child', representative_name: 'Child', status: 1 },
      ]);
    repo.representativeReports.mockResolvedValue([
      { representative_name: 'Child', no_of_assets: '5', no_of_transactions: '2', no_of_parties: '4', no_of_inventor: '1', no_of_activities: '3' },
      { representative_name: 'Solo', no_of_assets: 7, no_of_transactions: 1, no_of_parties: 6, no_of_inventor: 0, no_of_activities: 2 },
    ]);
    repo.adminRepresentativeReports.mockResolvedValue([]);
    repo.sharedTransactions.mockResolvedValue(JSON.stringify({ selectedCompanies: [22] }));

    const res = await service.companyList(tenant, { showOtherCompanies: 0, shareCode: 'abc' }, {});
    const group = res.list.find((r) => r.representative_id === 1);
    expect(group.no_of_assets).toBe(5);
    expect(group.child_total).toBe(1);
    // share filter: Solo (22) selected -> first and status 1; group not selected -> status 0
    expect(res.list[0].representative_id).toBe(22);
    expect(res.list[0].status).toBe(1);
    expect(group.status).toBe(0);
  });
});

describe('company.service lawfirm mappings', () => {
  it('builds the cartesian mapping rows', async () => {
    repo.bulkCreateCompanyLawfirms.mockResolvedValue([]);
    await service.addLawfirmMappings(tenant, [1, 2], [10, 20]);
    expect(repo.bulkCreateCompanyLawfirms.mock.calls[0][1]).toHaveLength(4);
  });
  it('rejects an empty lawfirm list', async () => {
    await expect(service.addLawfirmMappings(tenant, [1], [])).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('company.service.search', () => {
  it('splits lines, strips punctuation and lowercases before searching', async () => {
    repo.searchCompanies.mockResolvedValue([{ id: 1 }]);
    await service.search('Acme, Inc.\nBETA Corp');
    expect(repo.searchCompanies.mock.calls[0][0]).toBe('acme inc');
    expect(repo.searchCompanies.mock.calls[1][0]).toBe('beta corp');
  });
});
