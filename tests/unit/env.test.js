'use strict';

const { validate } = require('../../src/config/env');

describe('config/env validate (fail-fast, audit F2)', () => {
  const snapshot = { ...process.env };
  afterEach(() => {
    process.env = { ...snapshot };
  });

  it('passes with all required variables present', () => {
    expect(() => validate()).not.toThrow();
  });

  it('throws when a required variable is missing', () => {
    delete process.env.SECRET;
    expect(() => validate()).toThrow(/Missing required environment variable/);
  });

  it('lists every missing variable', () => {
    delete process.env.SECRET;
    delete process.env.DATABASE_BUSINESS;
    expect(() => validate()).toThrow(/SECRET/);
    delete process.env.SECRET;
    delete process.env.DATABASE_BUSINESS;
    expect(() => validate()).toThrow(/DATABASE_BUSINESS/);
  });

  it('refuses the known committed secret value', () => {
    process.env.SECRET = 'p@nt3nt8@60';
    expect(() => validate()).toThrow(/known committed value/);
  });
});

describe('database port', () => {
  const original = process.env.DB_PORT;
  afterEach(() => {
    if (original === undefined) delete process.env.DB_PORT;
    else process.env.DB_PORT = original;
    jest.resetModules();
  });

  const load = () => {
    jest.resetModules();
    return require('../../src/config/env').env;
  };

  it('reads DB_PORT so a tunnelled MySQL is reachable', () => {
    process.env.DB_PORT = '3307';
    expect(load().db.port).toBe(3307);
  });

  it('falls back to the MySQL default', () => {
    delete process.env.DB_PORT;
    expect(load().db.port).toBe(3306);
  });

  it('falls back rather than passing a non-numeric port to the driver', () => {
    process.env.DB_PORT = 'not-a-port';
    expect(load().db.port).toBe(3306);
  });
});

describe('database user', () => {
  const originalDbUser = process.env.DB_USER;
  const originalUser = process.env.USER;

  afterEach(() => {
    if (originalDbUser === undefined) delete process.env.DB_USER;
    else process.env.DB_USER = originalDbUser;
    if (originalUser === undefined) delete process.env.USER;
    else process.env.USER = originalUser;
    jest.resetModules();
  });

  const load = () => {
    jest.resetModules();
    return require('../../src/config/env').env;
  };

  it('prefers DB_USER over the ambient POSIX USER', () => {
    // This is the real failure mode: a shell, Docker -e, systemd or pm2 sets
    // USER to the login account, and the app authenticates as that instead.
    process.env.DB_USER = 'db_user_all';
    process.env.USER = 'mac';
    expect(load().db.user).toBe('db_user_all');
  });

  it('still reads USER when DB_USER is not set', () => {
    delete process.env.DB_USER;
    process.env.USER = 'legacy_user';
    expect(load().db.user).toBe('legacy_user');
  });

  it('treats a missing database user as a boot failure', () => {
    delete process.env.DB_USER;
    delete process.env.USER;
    jest.resetModules();
    const { validate } = require('../../src/config/env');
    expect(() => validate()).toThrow(/DB_USER/);
  });
});
