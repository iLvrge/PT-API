'use strict';

// Two customer routes turned "no companies selected" into a 500.
//
//   GET /customers/:layout/parties      -> `apt.company_id IN ()`  (SQL syntax error)
//   GET /customers/asset_types/:tab_id/companies
//                                       -> Named parameter ":company" has no value
//
// Both are the empty-collection-into-SQL bug. The codebase already guards this
// in two sibling handlers — GET /dashboards and assetTypeAssignments, the latter
// with a comment noting the legacy 500'd here and it is "an explicit 400" now.
// These two were missed.

jest.mock('../../src/modules/customers/customers.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');

const repo = require('../../src/modules/customers/customers.repository');
const service = require('../../src/modules/customers/customers.service');

beforeEach(() => jest.clearAllMocks());

describe('assetTypeTabCompanies', () => {
  it('400s for an empty company list rather than binding undefined', async () => {
    await expect(service.assetTypeTabCompanies([], 1, '15'))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repo.assetTypeTabCompanies).not.toHaveBeenCalled();
  });

  it('400s when companies is omitted entirely', async () => {
    await expect(service.assetTypeTabCompanies(undefined, 1, '15'))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repo.assetTypeTabCompanies).not.toHaveBeenCalled();
  });

  it('uses the first company when one is given', async () => {
    repo.assetTypeTabCompanies.mockResolvedValue([{ id: 1 }]);
    const result = await service.assetTypeTabCompanies([55, 56], 1, '15');
    expect(repo.assetTypeTabCompanies).toHaveBeenCalledWith(55, 1, expect.anything(), 0);
    expect(result.total_records).toBe(1);
  });

  it('accepts a bare value as well as an array', async () => {
    repo.assetTypeTabCompanies.mockResolvedValue([]);
    await service.assetTypeTabCompanies(55, 1, '15');
    expect(repo.assetTypeTabCompanies).toHaveBeenCalledWith(55, 1, expect.anything(), 0);
  });

  it('does not treat company id 0 as missing', async () => {
    repo.assetTypeTabCompanies.mockResolvedValue([]);
    await expect(service.assetTypeTabCompanies([0], 1, '15')).resolves.toBeDefined();
  });
});

describe('layoutParties', () => {
  // The guard lives in the controller, so drive the service with a real list and
  // assert it reaches the repository — the controller test is the integration one.
  it('passes a non-empty company list through to the default-layout query', async () => {
    repo.partiesDefault.mockResolvedValue([{ id: 1, entityName: 'Acme' }]);
    const result = await service.layoutParties({
      layout: '15', companies: [55], tabs: [], customerType: 0, orgType: 1,
    });
    expect(repo.partiesDefault).toHaveBeenCalledWith(
      expect.objectContaining({ companies: [55] })
    );
    expect(result.total_records).toBe(1);
  });
});
