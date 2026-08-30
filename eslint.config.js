'use strict';

/**
 * Flat config (ESLint 9+). Scoped to the new src/ and tests/ trees only — the
 * legacy routes/helpers/model code is not linted here so the rules stay
 * meaningful for new work. no-undef / no-implicit-globals would have caught the
 * accidental global leakage in the old code (audit finding F4).
 */

const globals = {
  process: 'readonly',
  console: 'readonly',
  module: 'writable',
  require: 'readonly',
  __dirname: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  fetch: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

const jestGlobals = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  jest: 'readonly',
};

const rules = {
  'no-undef': 'error',
  'no-implicit-globals': 'error',
  'no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['warn', 'smart'],
  'require-atomic-updates': 'error',
};

module.exports = [
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals },
    rules,
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals, ...jestGlobals },
    },
    rules,
  },
];
