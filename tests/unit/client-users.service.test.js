'use strict';

jest.mock('../../src/modules/client-users/client-users.repository');

const bcrypt = require('bcrypt');
const repo = require('../../src/modules/client-users/client-users.repository');
const service = require('../../src/modules/client-users/client-users.service');

const tenant = { id: 't' };

beforeEach(() => jest.clearAllMocks());

describe('client-users.service.create', () => {
  const body = { first_name: 'A', last_name: 'B', email_address: 'a@b.com', type: 0 };

  it('403 when the requester is not a tenant admin', async () => {
    repo.findRequesterAdmin.mockResolvedValue(null);
    await expect(service.create(tenant, 5, 118, body)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('409 when the email already has a login', async () => {
    repo.findRequesterAdmin.mockResolvedValue({ user_id: 5 });
    repo.findLoginByEmail.mockResolvedValue({ user_id: 9 });
    await expect(service.create(tenant, 5, 118, body)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('stores a random bcrypt password, never the surname (F3)', async () => {
    repo.findRequesterAdmin.mockResolvedValue({ user_id: 5 });
    repo.findLoginByEmail.mockResolvedValue(null);
    repo.createLogin.mockResolvedValue({ user_id: 42 });
    repo.createUser.mockResolvedValue({ toJSON: () => ({ user_id: 42, first_name: 'A' }) });
    repo.findOrganisation.mockResolvedValue(null);

    await service.create(tenant, 5, 118, body);

    const stored = repo.createLogin.mock.calls[0][0];
    expect(stored.password).not.toBe('B');
    await expect(bcrypt.compare('B', stored.password)).resolves.toBe(false);
    expect(stored.role_id).toBe(1); // type 0 -> admin role
  });

  it('creates firm + professional when the organisation is found', async () => {
    repo.findRequesterAdmin.mockResolvedValue({ user_id: 5 });
    repo.findLoginByEmail.mockResolvedValue(null);
    repo.createLogin.mockResolvedValue({ user_id: 42 });
    repo.createUser.mockResolvedValue({ toJSON: () => ({ user_id: 42 }) });
    repo.findOrganisation.mockResolvedValue({ organisation_id: 118, name: 'Acme' });
    repo.findFirmByName.mockResolvedValue({ firm_id: 3 });

    await service.create(tenant, 5, 118, body);
    expect(repo.createProfessional).toHaveBeenCalled();
    expect(repo.createProfessional.mock.calls[0][1].firm_id).toBe(3);
  });
});

describe('client-users.service.deleteUsers', () => {
  it('refuses to delete only oneself', async () => {
    repo.findRequesterAdmin.mockResolvedValue({ user_id: 5 });
    await expect(service.deleteUsers(tenant, 5, [5])).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deletes across both DBs when the business delete succeeds', async () => {
    repo.findRequesterAdmin.mockResolvedValue({ user_id: 5 });
    repo.findUsersByIds.mockResolvedValue([{ user_id: 7 }]);
    repo.tenantTransaction.mockImplementation(async (t, fn) => fn({}));
    repo.businessTransaction.mockImplementation(async (fn) => fn({}));
    const res = await service.deleteUsers(tenant, 5, [7]);
    expect(res).toEqual({ deleted: [7] });
    expect(repo.destroyLogins).toHaveBeenCalled();
  });

  it('restores tenant rows when the business delete fails (compensation)', async () => {
    repo.findRequesterAdmin.mockResolvedValue({ user_id: 5 });
    repo.findUsersByIds.mockResolvedValue([{ user_id: 7 }]);
    repo.tenantTransaction.mockImplementation(async (t, fn) => fn({}));
    repo.businessTransaction.mockRejectedValue(new Error('business down'));
    await expect(service.deleteUsers(tenant, 5, [7])).rejects.toMatchObject({ statusCode: 500 });
    // one tenant tx for the delete, one for the restore
    expect(repo.tenantTransaction).toHaveBeenCalledTimes(2);
    expect(repo.bulkCreateUsers).toHaveBeenCalled();
  });
});
