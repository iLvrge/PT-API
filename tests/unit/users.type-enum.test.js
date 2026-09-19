'use strict';

// db_business.user.type is enum('0','1','9'), not an integer. The model
// declared it as DataTypes.INTEGER and both create() and update() wrote
// input.type — a JS number from Zod's z.coerce.number() — straight through.
//
// MySQL reads an unquoted number assigned to an enum column as an ORDINAL, not
// a value: type: 1 silently stored '0' (ordinal 1 is the enum's first member,
// "manager" became "member" and vice versa with no error), and type: 0 threw
// "Data truncated for column 'type'" — every attempt to create a manager
// failed outright. Confirmed against the real column before fixing: `UPDATE
// user SET type = 1` (unquoted) stored '0'; `SET type = '1'` (quoted) stored
// '1' correctly.
//
// Fixed by declaring the model's real type (DataTypes.ENUM('0','1','9')) and
// having both call sites hand it the string form.

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');
jest.mock('../../src/db/query');

const repository = require('../../src/modules/users/users.repository');
const service = require('../../src/modules/users/users.service');

beforeEach(() => {
  jest.clearAllMocks();
  repository.existsByEmail.mockResolvedValue(false);
  repository.create.mockResolvedValue({
    toJSON: () => ({ id: 1, first_name: 'Ada', type: '1' }),
  });
  repository.findByIdInOrganisation.mockResolvedValue({
    user_id: 1, organisation_id: 68, username: 'ada@example.com',
  });
  repository.emailTakenByAnother.mockResolvedValue(false);
  repository.updateById.mockResolvedValue([1]);
});

const BASE_INPUT = {
  first_name: 'Ada', last_name: 'Lovelace', email_address: 'ada@example.com',
  password: 'hunter22',
};

describe('create — type is written as a string', () => {
  it('writes "1" for a member, not the number 1', async () => {
    await service.create(68, { ...BASE_INPUT, type: 1 });
    const attrs = repository.create.mock.calls[0][0];
    expect(attrs.type).toBe('1');
    expect(typeof attrs.type).toBe('string');
  });

  it('writes "0" for a manager, not the number 0', async () => {
    await service.create(68, { ...BASE_INPUT, type: 0 });
    const attrs = repository.create.mock.calls[0][0];
    expect(attrs.type).toBe('0');
    expect(typeof attrs.type).toBe('string');
  });

  it('still derives the correct role_id from the numeric input', async () => {
    await service.create(68, { ...BASE_INPUT, type: 0 });
    expect(repository.create.mock.calls[0][0].role_id).toBe(1); // manager
    repository.create.mockClear();
    await service.create(68, { ...BASE_INPUT, type: 1 });
    expect(repository.create.mock.calls[0][0].role_id).toBe(2); // member
  });
});

describe('update (profile edit) — type is written as a string', () => {
  const PROFILE = {
    first_name: 'Ada', last_name: 'Lovelace', email_address: 'ada@example.com',
    job_title: 'Engineer', linkedin_url: '',
  };

  it('writes "1" for a member, not the number 1', async () => {
    await service.update(68, 1, { ...PROFILE, type: 1 });
    const attrs = repository.updateById.mock.calls[0][2];
    expect(attrs.type).toBe('1');
    expect(typeof attrs.type).toBe('string');
  });

  it('writes "0" for a manager, not the number 0', async () => {
    await service.update(68, 1, { ...PROFILE, type: 0 });
    const attrs = repository.updateById.mock.calls[0][2];
    expect(attrs.type).toBe('0');
    expect(typeof attrs.type).toBe('string');
  });
});
