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
