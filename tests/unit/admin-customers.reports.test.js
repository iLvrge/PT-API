'use strict';

// GET /admin/customers/:id/reports — the per-row totals on the admin dashboard.
// The route was missing from the rewrite entirely, so every dashboard row asked
// for it and got a 404 (the console fires one request per visible customer).
// These cover the guard chain the legacy handler had, because the dashboard
// lists provisioned and unprovisioned customers side by side and an
// unprovisioned one must render as an empty row rather than an error.

jest.mock('../../src/modules/admin-customers/admin-customers.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');

const repo = require('../../src/modules/admin-customers/admin-customers.repository');
const tenants = require('../../src/db/tenant-connections');
const q = require('../../src/db/query');
const service = require('../../src/modules/admin-customers/admin-customers.service');

const SUMMARY = {
  organisation_id: 146,
  companies: 7,
  activities: 9,
  no_of_entities: 2636,
  no_of_parties: 9856,
  employees: 2511,
  no_of_transactions: 52602,
  assets: 51885,
  product: 184654,
  documents: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  repo.findCustomer.mockResolvedValue({ organisation_id: 146, name: 'AMPACC LAW GROUP' });
  tenants.getConnection.mockResolvedValue({ name: 'tenant' });
  q.exists.mockResolvedValue(true);
  repo.summaryForOrganisation.mockResolvedValue({ ...SUMMARY });
  repo.hasShareLink.mockResolvedValue(false);
});

describe('customerReport', () => {
  it('returns the organisation totals', async () => {
    await expect(service.customerReport(146)).resolves.toEqual(SUMMARY);
  });

  it('flags a customer that has a share link', async () => {
    repo.hasShareLink.mockResolvedValue(true);
    await expect(service.customerReport(146)).resolves.toEqual({ ...SUMMARY, share_url: 1 });
  });

  it('leaves share_url off when no link has been issued', async () => {
    await expect(service.customerReport(146)).resolves.not.toHaveProperty('share_url');
  });

  it('returns {} for an organisation that does not exist', async () => {
    repo.findCustomer.mockResolvedValue(null);
    await expect(service.customerReport(999)).resolves.toEqual({});
    expect(tenants.getConnection).not.toHaveBeenCalled();
  });

  it('returns {} when the customer has no tenant database yet', async () => {
    tenants.getConnection.mockResolvedValue(null);
    await expect(service.customerReport(146)).resolves.toEqual({});
    expect(repo.summaryForOrganisation).not.toHaveBeenCalled();
  });

  it('returns {} when the tenant has no top-level companies', async () => {
    q.exists.mockResolvedValue(false);
    await expect(service.customerReport(146)).resolves.toEqual({});
    expect(repo.summaryForOrganisation).not.toHaveBeenCalled();
  });

  it('returns {} when no summary row has been computed', async () => {
    repo.summaryForOrganisation.mockResolvedValue(null);
    await expect(service.customerReport(146)).resolves.toEqual({});
  });

  it('opens the tenant connection with a number, not the raw path string', async () => {
    await service.customerReport('146');
    expect(tenants.getConnection).toHaveBeenCalledWith(146);
  });
});
