'use strict';

jest.mock('../../src/modules/company/company.repository');
jest.mock('../../src/utils/php-jobs', () => ({
  runPhpScript: jest.fn().mockResolvedValue({}),
  runPhpScriptBackground: jest.fn(),
}));

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

describe('company.service.createCompanies', () => {
  const authInfo = { orgId: 118, userId: 5 };
  it('rejects an empty selection', async () => {
    await expect(service.createCompanies(tenant, authInfo, { name: '[]' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('adds subsidiaries under a parent, skipping already-listed names', async () => {
    repo.requestsByIds.mockResolvedValue([{ account_id: 0, representative_id: 7 }]);
    repo.assigneeIdsForRepresentatives.mockResolvedValue([{ assignor_and_assignee_id: 42 }]);
    repo.subsidiaryCompanies.mockResolvedValue([
      { assignor_and_assignee_id: 42, name: 'New Co', representative_name: 'NEW CO', instances: 3, representative_id: 7, representative_instances: 10 },
      { assignor_and_assignee_id: 43, name: 'Existing', representative_name: null, instances: 1, representative_id: 8, representative_instances: 0 },
    ]);
    repo.findParentCompany.mockResolvedValue({ representative_id: 1, original_name: 'Parent', type: 1, status: 1 });
    repo.representativesByParent.mockResolvedValue([{ original_name: 'Existing' }]);
    repo.bulkCreateRepresentatives.mockResolvedValue([]);
    repo.logActivities.mockResolvedValue([]);

    await service.createCompanies(tenant, authInfo, { name: '[1]', parent_company: 1 });
    const rows = repo.bulkCreateRepresentatives.mock.calls[0][1];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ original_name: 'New Co', instances: 10, parent_id: 1, child: 1 });
  });

  it('403 when the parent does not exist', async () => {
    repo.requestsByIds.mockResolvedValue([{ representative_id: 7 }]);
    repo.assigneeIdsForRepresentatives.mockResolvedValue([{ assignor_and_assignee_id: 42 }]);
    repo.subsidiaryCompanies.mockResolvedValue([]);
    repo.findParentCompany.mockResolvedValue(null);
    await expect(service.createCompanies(tenant, authInfo, { name: '[1]', parent_company: 9 })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('company.service.deleteCompanies', () => {
  const authInfo = { orgId: 118, userId: 5 };
  it('dissolving a group (type=1) detaches members and deletes only type-1 rows', async () => {
    repo.representativesByIds.mockResolvedValue([
      { representative_id: 1, parent_id: 0, original_name: 'Group', type: 1 },
    ]);
    repo.childRepresentativeIds.mockResolvedValue([{ representative_id: 3 }]);
    repo.destroyRepresentatives.mockResolvedValue(1);
    repo.logActivities.mockResolvedValue([]);
    repo.destroyRepresentativeTransactions.mockResolvedValue(1);

    await service.deleteCompanies(tenant, authInfo, { companies: [1], type: '1' });
    expect(repo.updateRepresentativesWhere).toHaveBeenCalledWith(
      tenant, { parent_id: 0 }, { parent_id: [1, 3], type: 0, child: 1 }
    );
    const where = repo.destroyRepresentatives.mock.calls[0][1];
    expect(where.type).toBe(1);
  });

  it('deleting a member re-triggers the parent rebuild', async () => {
    repo.representativesByIds.mockResolvedValue([
      { representative_id: 3, parent_id: 1, original_name: 'Child', type: 0 },
    ]);
    repo.destroyRepresentatives.mockResolvedValue(1);
    repo.logActivities.mockResolvedValue([]);
    repo.destroyRepresentativeTransactions.mockResolvedValue(1);
    repo.representativesWhere.mockResolvedValue([{ representative_id: 1, company_id: 77 }]);

    await service.deleteCompanies(tenant, authInfo, { companies: [3], type: undefined });
    expect(repo.destroyRepresentativeTransactions).toHaveBeenCalledWith({ representative_id: [1], organisation_id: 118 });
  });
});
