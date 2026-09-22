'use strict';

// Guards the SQL text itself, not the service on top of it. The admin-signin
// predicate compares against `user.type`, which is enum('0','1','9') in
// db_business. MySQL reads an unquoted integer on the right of an enum
// comparison as an *ordinal*, so `type = 9` asks for the 9th enum value —
// there are only three — and the predicate matches nothing. Sign-in then fails
// for every admin with a correct password, and no error is raised anywhere:
// the row simply is not found. Mocking the repository (as auth.service.test.js
// does) cannot see this, so the query string is asserted directly.

jest.mock('../../src/db', () => ({ connections: { business: { name: 'business' } } }));
jest.mock('../../src/db/query', () => ({ selectOne: jest.fn().mockResolvedValue(null) }));

const q = require('../../src/db/query');
const repository = require('../../src/modules/auth/auth.repository');

const sqlFrom = (mock) => mock.calls[0][1].replace(/\s+/g, ' ');

describe('auth.repository', () => {
  describe('findAdminByUsername', () => {
    it('quotes the enum literal so the admin predicate can match', async () => {
      await repository.findAdminByUsername('admin_user');

      const sql = sqlFrom(q.selectOne.mock);
      expect(sql).toContain("type = '9'");
      expect(sql).not.toMatch(/type\s*=\s*9\b/);
    });

    it('binds the username instead of interpolating it', async () => {
      await repository.findAdminByUsername("bob' OR 1=1 --");

      const [, sql, replacements] = q.selectOne.mock.calls[0];
      expect(sql).toContain(':username');
      expect(replacements).toEqual({ username: "bob' OR 1=1 --" });
    });

    it('restricts to active users and reads at most one row', async () => {
      await repository.findAdminByUsername('admin_user');

      const sql = sqlFrom(q.selectOne.mock);
      expect(sql).toContain('status = 0');
      expect(sql).toContain('LIMIT 1');
    });

    it('returns whatever the query helper yields', async () => {
      q.selectOne.mockResolvedValueOnce({ user_id: 1, type: '9' });
      await expect(repository.findAdminByUsername('admin_user')).resolves.toEqual({
        user_id: 1,
        type: '9',
      });
    });
  });
});

/*
 * Usernames are not unique across organisations: `test` exists 325 times in
 * db_business, once per customer, all active and all sharing one password
 * hash. `LIMIT 1` without an ORDER BY therefore returns whichever row the
 * plan reaches first, and since the issued token carries the organisation,
 * the same credentials could sign in to a different customer's data after an
 * index change, a restart, or a write to the table.
 */
describe('duplicate usernames across organisations', () => {
  beforeEach(() => q.selectOne.mockClear());

  it('picks the sign-in row deterministically, oldest account first', async () => {
    await repository.findByUsername('test');

    const sql = sqlFrom(q.selectOne.mock);
    expect(sql).toMatch(/ORDER BY u\.user_id\s+LIMIT 1/);
  });

  it('picks the admin row deterministically too', async () => {
    await repository.findAdminByUsername('admin_user');

    const sql = sqlFrom(q.selectOne.mock);
    expect(sql).toMatch(/ORDER BY user_id\s+LIMIT 1/);
  });

  it('still scopes sign-in to active users and binds the name', async () => {
    await repository.findByUsername('test');

    const [, sql, replacements] = q.selectOne.mock.calls[0];
    expect(sql.replace(/\s+/g, ' ')).toContain('u.status = 0');
    expect(replacements).toEqual({ username: 'test' });
  });
});
