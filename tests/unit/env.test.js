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
