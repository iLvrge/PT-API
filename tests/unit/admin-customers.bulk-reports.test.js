'use strict';

// GET /admin/customers/reports?ids=[...] — the dashboard figures for many
// customers in one call.
//
// The console asks per customer instead, which is one request per row. With 330
// active customers that is 331 requests on a single page load, against a global
// rate limit of 300 per fifteen minutes — so the last rows answer 429 and render
// as zeros, and a second page load inside the window is blocked almost entirely.

jest.mock('../../src/modules/admin-customers/admin-customers.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');

const repo = require('../../src/modules/admin-customers/admin-customers.repository');
const service = require('../../src/modules/admin-customers/admin-customers.service');

const row = (id, over = {}) => ({
  organisation_id: id, companies: 2, activities: 3, no_of_entities: '0',
  no_of_parties: '35', employees: 122, no_of_transactions: '226',
  assets: '228', product: '714', documents: 0, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  repo.summariesForOrganisations.mockResolvedValue([row(68), row(146)]);
  repo.organisationsWithShareLink.mockResolvedValue([]);
});

describe('customerReports', () => {
  it('keys the results by organisation id', async () => {
    const result = await service.customerReports([68, 146]);
    expect(Object.keys(result).sort()).toEqual(['146', '68']);
    expect(result[68].assets).toBe('228');
  });

  it('uses two queries regardless of how many customers are asked for', async () => {
    await service.customerReports(Array.from({ length: 330 }, (_, i) => i + 1));
    expect(repo.summariesForOrganisations).toHaveBeenCalledTimes(1);
    expect(repo.organisationsWithShareLink).toHaveBeenCalledTimes(1);
  });

  it('flags only the customers that actually have a share link', async () => {
    repo.organisationsWithShareLink.mockResolvedValue([{ organisation_id: 68 }]);
    const result = await service.customerReports([68, 146]);
    expect(result[68].share_url).toBe(1);
    expect(result[146]).not.toHaveProperty('share_url');
  });

  it('matches share links even when the id comes back as a string', async () => {
    repo.organisationsWithShareLink.mockResolvedValue([{ organisation_id: '68' }]);
    const result = await service.customerReports([68]);
    expect(result[68].share_url).toBe(1);
  });

  it('omits a customer with no summary row rather than inventing zeros', async () => {
    repo.summariesForOrganisations.mockResolvedValue([row(68)]);
    const result = await service.customerReports([68, 146]);
    expect(result[146]).toBeUndefined();
  });

  it('does not query at all for an empty id list', async () => {
    await expect(service.customerReports([])).resolves.toEqual({});
    expect(repo.summariesForOrganisations).not.toHaveBeenCalled();
  });
});
