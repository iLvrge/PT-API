'use strict';

// PUT /admin/customers/:id/users/:userId — the console's "edit user" and
// "change password" dialogs. The route was missing from the rewrite (404).
//
// The two dialogs post different bodies, and conflating them is the bug worth
// guarding: the password dialog sends only a password, so a handler that always
// wrote the profile fields would blank the user's name and email.

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');

const bcrypt = require('bcrypt');
const repository = require('../../src/modules/users/users.repository');
const tenants = require('../../src/db/tenant-connections');
const q = require('../../src/db/query');
const service = require('../../src/modules/users/users.service');

const EXISTING = {
  user_id: 52, organisation_id: 146,
  first_name: 'Test', last_name: 'User',
  email_address: 'test@example.com', username: 'test@example.com',
};

const PROFILE = {
  first_name: 'Ada', last_name: 'Lovelace',
  email_address: 'ada@example.com', job_title: 'Engineer',
  linkedin_url: '', type: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  repository.findByIdInOrganisation.mockResolvedValue({ ...EXISTING });
  repository.emailTakenByAnother.mockResolvedValue(false);
  repository.updateById.mockResolvedValue([1]);
  tenants.getConnection.mockResolvedValue(null);
});

describe('password change', () => {
  it('writes only the password hash, never the profile fields', async () => {
    await service.update(146, 52, { password: 'hunter22' });

    const [, , attributes] = repository.updateById.mock.calls[0];
    expect(Object.keys(attributes)).toEqual(['password']);
    expect(attributes.password).not.toBe('hunter22');
    await expect(bcrypt.compare('hunter22', attributes.password)).resolves.toBe(true);
  });

  it('does not touch the tenant copy for a password change', async () => {
    await service.update(146, 52, { password: 'hunter22' });
    expect(tenants.getConnection).not.toHaveBeenCalled();
  });

  it('reports what it changed', async () => {
    await expect(service.update(146, 52, { password: 'hunter22' }))
      .resolves.toEqual({ user_id: 52, updated: ['password'] });
  });
});

describe('profile edit', () => {
  it('never writes a password field', async () => {
    await service.update(146, 52, PROFILE);
    const [, , attributes] = repository.updateById.mock.calls[0];
    expect(attributes).not.toHaveProperty('password');
  });

  it('keeps username in step with the email address', async () => {
    await service.update(146, 52, PROFILE);
    const [, , attributes] = repository.updateById.mock.calls[0];
    expect(attributes.username).toBe('ada@example.com');
    expect(attributes.email_address).toBe('ada@example.com');
  });

  it('maps type 0 to the manager role and 1 to member', async () => {
    await service.update(146, 52, { ...PROFILE, type: 0 });
    expect(repository.updateById.mock.calls[0][2].role_id).toBe(1);

    repository.updateById.mockClear();
    await service.update(146, 52, { ...PROFILE, type: 1 });
    expect(repository.updateById.mock.calls[0][2].role_id).toBe(2);
  });

  it('stores an omitted surname as an empty string, not null', async () => {
    await service.update(146, 52, { ...PROFILE, last_name: undefined });
    expect(repository.updateById.mock.calls[0][2].last_name).toBe('');
  });

  it('refuses an email that already belongs to someone else', async () => {
    repository.emailTakenByAnother.mockResolvedValue(true);
    await expect(service.update(146, 52, PROFILE)).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.updateById).not.toHaveBeenCalled();
  });

  it('allows saving without changing the email address', async () => {
    await service.update(146, 52, { ...PROFILE, email_address: EXISTING.username });
    expect(repository.emailTakenByAnother).not.toHaveBeenCalled();
    expect(repository.updateById).toHaveBeenCalled();
  });
});

describe('tenant mirroring', () => {
  it('updates the matching row in the customer database', async () => {
    const tenant = { query: jest.fn().mockResolvedValue([]) };
    tenants.getConnection.mockResolvedValue(tenant);
    q.selectOne.mockResolvedValue({ user_id: 9 });

    await service.update(146, 52, PROFILE);

    expect(q.selectOne).toHaveBeenCalledWith(
      tenant, expect.stringContaining('FROM user'), { username: EXISTING.username }
    );
    const [sql, options] = tenant.query.mock.calls[0];
    expect(sql).toContain('UPDATE user');
    expect(options.replacements).toMatchObject({ userId: 9, username: 'ada@example.com' });
  });

  it('still reports success when the tenant copy cannot be reached', async () => {
    tenants.getConnection.mockRejectedValue(new Error('tenant down'));
    await expect(service.update(146, 52, PROFILE)).resolves.toMatchObject({ user_id: 52 });
    expect(repository.updateById).toHaveBeenCalled();
  });

  it('does nothing in the tenant when the user has no copy there', async () => {
    const tenant = { query: jest.fn() };
    tenants.getConnection.mockResolvedValue(tenant);
    q.selectOne.mockResolvedValue(null);

    await service.update(146, 52, PROFILE);
    expect(tenant.query).not.toHaveBeenCalled();
  });
});

describe('guards', () => {
  it('404s for a user outside this organisation', async () => {
    repository.findByIdInOrganisation.mockResolvedValue(null);
    await expect(service.update(146, 52, PROFILE)).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.updateById).not.toHaveBeenCalled();
  });

  it('scopes the write to the organisation, so one customer cannot edit another\'s user', async () => {
    await service.update(146, 52, PROFILE);
    const [userId, organisationId] = repository.updateById.mock.calls[0];
    expect(userId).toBe(52);
    expect(organisationId).toBe(146);
  });
});
