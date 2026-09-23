#!/usr/bin/env node

'use strict';

/**
 * Write the OpenAPI document out as JSON, for the linter and for anything that
 * generates a client from it.
 *
 * The spec is assembled in JavaScript, so the only way to lint what the app
 * actually serves is to require the module and serialise the result. A
 * hand-kept .yaml alongside it would be a second copy to drift.
 *
 *   node scripts/build-openapi.js [outfile]
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// The spec module pulls in config/env, which refuses to boot without the
// database variables. It never touches a database to build the document.
process.env.HOST = process.env.HOST || 'localhost';
process.env.DB_USER = process.env.DB_USER || 'spec';
process.env.PASSWORD = process.env.PASSWORD || 'spec';
process.env.DATABASE_APPLICATION = process.env.DATABASE_APPLICATION || 'spec';
process.env.DATABASE_APPLICATION_NEW = process.env.DATABASE_APPLICATION_NEW || 'spec';
process.env.DATABASE_BUSINESS = process.env.DATABASE_BUSINESS || 'spec';
process.env.DATABASE_RAW = process.env.DATABASE_RAW || 'spec';
process.env.SECRET = process.env.SECRET || 'spec-build-only';

const fs = require('fs');
const path = require('path');

const outfile = process.argv[2] || path.join(__dirname, '..', 'build', 'openapi.json');
const spec = require('../src/docs/openapi');

fs.mkdirSync(path.dirname(outfile), { recursive: true });
fs.writeFileSync(outfile, `${JSON.stringify(spec, null, 2)}\n`);

const operations = Object.values(spec.paths)
  .flatMap((item) => ['get', 'post', 'put', 'delete', 'patch'].map((m) => item[m]))
  .filter(Boolean);

process.stdout.write(
  `${outfile} — OpenAPI ${spec.openapi}, ${Object.keys(spec.paths).length} paths, ${operations.length} operations\n`
);
