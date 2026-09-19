'use strict';

// POST /admin/customers/:id/users only ever wrote the business-side row. The
// legacy handler also created the SAME user in the customer's own database (a
// user row sharing the business id, a firm named after the organisation, and a
// professional record at that firm), fire-and-forget. The rewrite dropped all
// of it — silently, since create() still returned 201.
//
// The user is left unable to use ANY tenant-scoped action gated on their own
// role in their own database (e.g. document creation's isTenantAdmin check,
// which reads role_id from the tenant's user table) until something else
// creates that row — caught here by testing the full create → use-a-manager-
// only-feature path with real data, which a route-shape test never would.

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');

const repository = require('../../src/modules/users/users.repository');
const tenants = require('../../src/db/tenant-connections');
const q = require('../../src/db/query');
const service = require('../../src/modules/users/users.service');

const CREATE_INPUT = {
  first_name: 'Ada', last_name: 'Lovelace', email_address: 'ada@example.com',
  password: 'hunter22', job_title: 'Engineer', linkedin_url: 'https://linkedin.com/in/ada',
  type: 0,
};

// create() fires provisionTenantUser and does not await it — correct in
// production (a slow tenant write should never hold up the HTTP response),
// but it means a create()-level test cannot observe completion without
// guessing at timing. provisionTenantUser is exported for exactly this: call
// and await the real thing directly instead.

beforeEach(() => {
  jest.clearAllMocks();
  repository.existsByEmail.mockResolvedValue(false);
  repository.create.mockResolvedValue({
    toJSON: () => ({
      user_id: 1, first_name: 'Ada', last_name: 'Lovelace',
      email_address: 'ada@example.com', job_title: 'Engineer',
      linkedin_url: 'https://linkedin.com/in/ada', logo: null,
    }),
  });
  repository.organisationName.mockResolvedValue('Acme Inc');
});

describe('create — tenant provisioning', () => {
  const USER = {
    userId: 1, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com',
    jobTitle: 'Engineer', linkedinUrl: 'https://linkedin.com/in/ada', logo: null, roleId: 2,
  };

  it('create() invokes provisioning with the newly created user, without waiting on it', async () => {
    let resolveQuery;
    const tenantQuery = jest.fn(() => new Promise((resolve) => { resolveQuery = resolve; }));
    tenants.getConnection.mockResolvedValue({ query: tenantQuery });
    q.selectOne.mockResolvedValue({ firm_id: 7 });

    const result = await service.create(68, CREATE_INPUT); // resolves without waiting on tenantQuery
    expect(result).toMatchObject({ id: 1 });
    resolveQuery([[], 0]);
  });

  it('inserts the same user into the tenant database, sharing the business id', async () => {
    const tenantQuery = jest.fn().mockResolvedValue([[], 0]);
    tenants.getConnection.mockResolvedValue({ query: tenantQuery });
    q.selectOne.mockResolvedValue(null); // no existing firm

    await service.provisionTenantUser(68, USER);

    const [sql, options] = tenantQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO user');
    expect(options.replacements.userId).toBe(1);
    expect(options.replacements.email).toBe('ada@example.com');
  });

  it('finds an existing firm named after the organisation rather than duplicating it', async () => {
    const tenantQuery = jest.fn().mockResolvedValue([[], 0]);
    tenants.getConnection.mockResolvedValue({ query: tenantQuery });
    q.selectOne.mockResolvedValue({ firm_id: 7 });

    await service.provisionTenantUser(68, USER);

    const professionalCall = tenantQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO professional'));
    expect(professionalCall[1].replacements.firmId).toBe(7);
    expect(tenantQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO firm'))).toBe(false);
  });

  it('creates the firm when the organisation has none yet', async () => {
    const tenantQuery = jest.fn().mockResolvedValue([[], 0]);
    tenants.getConnection.mockResolvedValue({ query: tenantQuery });
    q.selectOne.mockResolvedValue(null);

    await service.provisionTenantUser(68, USER);

    const firmCall = tenantQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO firm'));
    expect(firmCall[1].replacements.orgName).toBe('Acme Inc');
  });

  it('creates a professional record at the firm for the new user', async () => {
    const tenantQuery = jest.fn().mockResolvedValue([[], 0]);
    tenants.getConnection.mockResolvedValue({ query: tenantQuery });
    q.selectOne.mockResolvedValue({ firm_id: 7 });

    await service.provisionTenantUser(68, USER);

    const professionalCall = tenantQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO professional'));
    expect(professionalCall[1].replacements.email).toBe('ada@example.com');
  });

  it('logs and does not throw when the organisation has no tenant database', async () => {
    tenants.getConnection.mockResolvedValue(null);
    await expect(service.provisionTenantUser(68, USER)).resolves.toBeUndefined();
  });

  it('logs and does not throw when the tenant write fails', async () => {
    tenants.getConnection.mockRejectedValue(new Error('tenant unreachable'));
    await expect(service.provisionTenantUser(68, USER)).resolves.toBeUndefined();
  });
});
