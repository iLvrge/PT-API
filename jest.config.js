'use strict';

module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/helpers/env.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // process bootstrap, exercised by integration indirectly
  ],
  // These thresholds reflect the DB-free suite. Repository READ methods (raw
  // SQL) are intentionally not unit-tested — they belong to a DB-backed
  // integration tier that runs against a seeded test database in CI. Services,
  // controllers, middleware, validation and error handling are covered here.
  coverageThreshold: {
    global: { branches: 65, functions: 65, lines: 80, statements: 80 },
  },
  // The default 5s is tight when the suite shares a busy machine with an IDE
  // and a dev server: a mocked request that normally answers in 1ms can miss
  // it under CPU contention, which showed up as random single-test failures.
  testTimeout: 20000,
  clearMocks: true,
  verbose: false,
};
