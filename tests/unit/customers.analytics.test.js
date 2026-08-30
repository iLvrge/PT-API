'use strict';

jest.mock('../../src/modules/customers/customers.repository');
jest.mock('../../src/modules/customers/customers.filters');
jest.mock('../../src/modules/customers/customers.analytics');
jest.mock('../../src/modules/customers/customers.timeline', () => {
  const actual = jest.requireActual('../../src/modules/customers/customers.timeline');
  return { ...actual, tenantRepresentativeNames: jest.fn(), representativeIdsByNames: jest.fn(), fillingAssets: jest.fn() };
});

const filters = require('../../src/modules/customers/customers.filters');
const analytics = require('../../src/modules/customers/customers.analytics');
const timelineQ = require('../../src/modules/customers/customers.timeline');
const service = require('../../src/modules/customers/customers.service');

const tenant = { id: 't' };
const auth = { orgId: 118, orgType: 1 };
const baseBody = { list: [], total: 0, companies: [9], tabs: [], customers: [], assignments: [], lawfirm: 0 };

beforeEach(() => jest.clearAllMocks());

describe('assetAgents branch selection', () => {
  it('returns [] when data_type is missing (legacy no-op path)', async () => {
    await expect(service.assetAgents(tenant, { ...baseBody, dataType: undefined }, auth)).resolves.toEqual([]);
  });

  it('data_type 1 with check uses the client list and the check-mode SQL', async () => {
    analytics.agentsFilling.mockResolvedValue([{ name: 'F', year: '2020', counter: 2 }]);
    const res = await service.assetAgents(tenant, { ...baseBody, dataType: 1, check: 1, list: ['123'] }, auth);
    const args = analytics.agentsFilling.mock.calls[0][0];
    expect(args.checkMode).toBe(true);
    expect(args.assets).toEqual(['123']);
    expect(res[0].counter).toBe(2);
  });

  it('data_type 1 without check resolves assets through the filling chain', async () => {
    timelineQ.tenantRepresentativeNames.mockResolvedValue(['Acme']);
    timelineQ.representativeIdsByNames.mockResolvedValue([4]);
    timelineQ.fillingAssets.mockResolvedValue(['777']);
    analytics.agentsFilling.mockResolvedValue([]);
    await service.assetAgents(tenant, { ...baseBody, dataType: 1, check: 0 }, auth);
    expect(analytics.agentsFilling.mock.calls[0][0].assets).toEqual(['777']);
  });

  it('data_type 3 routes to lenders', async () => {
    analytics.agentsLenders.mockResolvedValue([]);
    await service.assetAgents(tenant, { ...baseBody, dataType: 3, customers: [5] }, auth);
    expect(analytics.agentsLenders.mock.calls[0][0].customers).toEqual([5]);
  });

  it('default with assignments routes to the conveyance variant', async () => {
    analytics.agentsRecordings.mockResolvedValue([]);
    await service.assetAgents(tenant, { ...baseBody, dataType: 2, assignments: [7] }, auth);
    expect(analytics.agentsRecordings.mock.calls[0][0].variant).toBe('assignments');
  });

  it('default company variant resolves the firm filter when lawfirm > 0', async () => {
    analytics.lawfirmForRf.mockResolvedValue({ representative_id: 3 });
    analytics.agentsRecordings.mockResolvedValue([]);
    await service.assetAgents(tenant, { ...baseBody, dataType: 2, lawfirm: 55 }, auth);
    expect(analytics.lawfirmForRf).toHaveBeenCalledWith(55);
    expect(analytics.agentsRecordings.mock.calls[0][0].firmFilter).toEqual({ representative_id: 3 });
  });
});

describe('assetFamily', () => {
  it('adds the missing grants to the US count when US is present', async () => {
    filters.filterAssets.mockResolvedValue(['a1', 'a2']);
    analytics.unionGrantsForApps.mockResolvedValue(['g1', 'g2']);
    filters.missingGrantNumbers.mockResolvedValue(['g2']);
    analytics.familyCountries.mockResolvedValue([
      { name: 'United States', number: '5' },
      { name: 'Japan', number: '3' },
    ]);
    const res = await service.assetFamily(tenant, { ...baseBody, type: 'assigned' }, auth);
    expect(res[0]).toEqual(['Country', 'Assets']);
    expect(res.find((r) => r[0] === 'United States')[1]).toBe(6); // 5 + 1 missing
  });

  it('uses biblio grants for missed_monetization and falls back to US total', async () => {
    filters.filterAssets.mockResolvedValue(['a1', 'a2', 'a3']);
    analytics.biblioGrantsForApps.mockResolvedValue(['g1']);
    filters.missingGrantNumbers.mockResolvedValue([]);
    analytics.familyCountries.mockResolvedValue([]);
    const res = await service.assetFamily(tenant, { ...baseBody, type: 'missed_monetization' }, auth);
    expect(analytics.biblioGrantsForApps).toHaveBeenCalled();
    expect(res).toContainEqual(['United States', 3]);
  });
});

describe('inventorLocations', () => {
  it('maps rows into the chart array', async () => {
    filters.filterAssets.mockResolvedValue(['a1']);
    analytics.inventorCountries.mockResolvedValue([{ name: 'Germany', number: '4' }]);
    const res = await service.inventorLocations(tenant, baseBody, auth);
    expect(res).toEqual([['Country', 'Assets'], ['Germany', 4]]);
  });

  it('returns just the header when no assets resolve', async () => {
    filters.filterAssets.mockResolvedValue([]);
    const res = await service.inventorLocations(tenant, baseBody, auth);
    expect(res).toEqual([['Country', 'Assets']]);
  });
});
