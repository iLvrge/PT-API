'use strict';

jest.mock('../../src/modules/users/users.repository');

const bcrypt = require('bcrypt');
const repository = require('../../src/modules/users/users.repository');
const service = require('../../src/modules/users/users.service');
const ApiError = require('../../src/utils/api-error');

describe('users.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    const input = {
      first_name: 'Test5',
      email_address: 'er.vivek2512+123@gmail.com',
      password: '123465',
      type: 0,
      // last_name deliberately absent — S1
    };

    it('creates a user, defaulting a missing last_name to "" (S1)', async () => {
      repository.existsByEmail.mockResolvedValue(false);
      repository.create.mockImplementation(async (attrs) => ({ toJSON: () => ({ user_id: 338, ...attrs }) }));

      const result = await service.create(118, input);

      expect(repository.create).toHaveBeenCalledTimes(1);
      const written = repository.create.mock.calls[0][0];
      expect(written.last_name).toBe('');
      expect(written.organisation_id).toBe(118);
      expect(written.role_id).toBe(1); // type 0 → manager
      expect(result.id).toBe(338);
    });

    it('never stores the raw password; it stores a bcrypt hash (F3)', async () => {
      repository.existsByEmail.mockResolvedValue(false);
      repository.create.mockImplementation(async (attrs) => ({ toJSON: () => ({ user_id: 1, ...attrs }) }));

      await service.create(118, input);

      const written = repository.create.mock.calls[0][0];
      expect(written.password).not.toBe('123465');
      expect(written.password).not.toBe(input.last_name);
      await expect(bcrypt.compare('123465', written.password)).resolves.toBe(true);
    });

    it('rejects a duplicate email with 409', async () => {
      repository.existsByEmail.mockResolvedValue(true);
      await expect(service.create(118, input)).rejects.toMatchObject({ statusCode: 409 });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('assigns member role for type 1', async () => {
      repository.existsByEmail.mockResolvedValue(false);
      repository.create.mockImplementation(async (attrs) => ({ toJSON: () => ({ user_id: 2, ...attrs }) }));
      await service.create(118, { ...input, type: 1 });
      expect(repository.create.mock.calls[0][0].role_id).toBe(2);
    });
  });

  describe('remove', () => {
    it('deletes an existing user', async () => {
      repository.findByIdInOrganisation.mockResolvedValue({ user_id: 335 });
      repository.destroyById.mockResolvedValue(1);
      await expect(service.remove(118, 335)).resolves.toEqual({ user_id: 335, deleted: true });
    });

    it('throws 404 when the user is not in the organisation', async () => {
      repository.findByIdInOrganisation.mockResolvedValue(null);
      await expect(service.remove(118, 999)).rejects.toBeInstanceOf(ApiError);
      await expect(service.remove(118, 999)).rejects.toMatchObject({ statusCode: 404 });
      expect(repository.destroyById).not.toHaveBeenCalled();
    });

    it('throws 404 when nothing was deleted', async () => {
      repository.findByIdInOrganisation.mockResolvedValue({ user_id: 335 });
      repository.destroyById.mockResolvedValue(0);
      await expect(service.remove(118, 335)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('list', () => {
    it('maps rows to the public shape', async () => {
      repository.listByOrganisation.mockResolvedValue([
        { id: 1, first_name: 'A', last_name: 'B', email_address: 'a@b.c', type: 0 },
      ]);
      const rows = await service.list(118);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: 1, first_name: 'A', username: 'a@b.c' });
    });
  });
});
