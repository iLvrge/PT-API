'use strict';

// Test environment defaults. Loaded by jest before any src module is required
// (see jest.config.js setupFiles), so config/env.js sees a valid SECRET and
// skips the production fail-fast checks.

process.env.NODE_ENV = 'test';
process.env.SECRET = process.env.SECRET || 'test-secret-not-for-production';
process.env.BCRYPT_ROUNDS = '4'; // fast hashing in tests
process.env.HOST = process.env.HOST || 'localhost';
process.env.USER = process.env.USER || 'test';
process.env.PASSWORD = process.env.PASSWORD || 'test';
process.env.DATABASE_APPLICATION = 'db_application';
process.env.DATABASE_APPLICATION_NEW = 'db_new_application';
process.env.DATABASE_BUSINESS = 'db_business';
process.env.DATABASE_RAW = 'db_uspto';

// Outbound integration URLs the routes build links from.
process.env.ASSIGNMENT_CENTER_SEARCH_URL =
  process.env.ASSIGNMENT_CENTER_SEARCH_URL || 'https://assignment-center.example/';
process.env.STATIC_FILES_URL = process.env.STATIC_FILES_URL || 'https://static.example';

// Where the data-pipeline scripts live. Nothing is executed in the suite; the
// path only has to exist so the entity-file guard has a directory to resolve
// against.
process.env.SCRIPT_PATH = process.env.SCRIPT_PATH || '/tmp/pt-api-scripts';
