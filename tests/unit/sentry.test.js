'use strict';

const sentry = require('../../src/config/sentry');

describe('config/sentry', () => {
  it('init returns null in the test environment (no DSN)', () => {
    expect(sentry.init()).toBeNull();
  });

  it('captureException is a safe no-op when uninitialised', () => {
    expect(() => sentry.captureException(new Error('x'))).not.toThrow();
  });

  it('captureMessage is a safe no-op when uninitialised', () => {
    expect(() => sentry.captureMessage('hi')).not.toThrow();
  });

  it('flush resolves even when uninitialised', async () => {
    await expect(sentry.flush(10)).resolves.toBeUndefined();
  });
});
