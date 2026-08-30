'use strict';

/**
 * The spec must describe every route the app actually mounts.
 *
 * Manual testing happens through Swagger UI before each deploy, so an endpoint
 * missing from the spec is an endpoint nobody exercises. This test walks the
 * live Express router and compares it with src/docs/openapi.js in both
 * directions: undocumented routes fail, and so do documented paths that no
 * longer exist.
 */

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');

const createApp = require('../../src/app');
const openapi = require('../../src/docs/openapi');

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'];

/** Express `/a/:b` → OpenAPI `/a/{b}`. */
const toOpenApiPath = (path) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

/** Recover a router's mount prefix from the regexp Express compiled for it. */
const mountPrefix = (layer) => {
  if (!layer.regexp || layer.regexp.fast_slash) return '';
  return layer.regexp.source
    .replace('^\\/', '/')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\\\//g, '/')
    .replace(/\$$/, '');
};

const collectRoutes = (app) => {
  const found = new Set();
  const walk = (stack, prefix) => {
    stack.forEach((layer) => {
      if (layer.route) {
        const path = `${prefix}${layer.route.path}`.replace(/\/{2,}/g, '/');
        Object.keys(layer.route.methods)
          .filter((method) => HTTP_METHODS.includes(method))
          .forEach((method) => found.add(`${method} ${toOpenApiPath(path)}`));
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        walk(layer.handle.stack, prefix + mountPrefix(layer));
      }
    });
  };
  walk(app._router.stack, '');
  return found;
};

const collectDocumented = (spec) => {
  const documented = new Set();
  Object.entries(spec.paths).forEach(([path, operations]) => {
    Object.keys(operations)
      .filter((method) => HTTP_METHODS.includes(method))
      .forEach((method) => documented.add(`${method} ${path}`));
  });
  return documented;
};

describe('OpenAPI coverage', () => {
  const mounted = collectRoutes(createApp());
  const documented = collectDocumented(openapi);

  it('documents every mounted route', () => {
    const missing = [...mounted].filter((route) => !documented.has(route)).sort();
    expect(missing).toEqual([]);
  });

  it('does not document routes that no longer exist', () => {
    // /docs itself is served by swagger-ui middleware rather than a route layer.
    const uiServed = new Set(['get /docs.json']);
    const stale = [...documented]
      .filter((route) => !mounted.has(route) && !uiServed.has(route))
      .sort();
    expect(stale).toEqual([]);
  });

  it('covers a meaningful number of endpoints', () => {
    // A guard against the walker silently returning nothing and passing.
    expect(mounted.size).toBeGreaterThan(150);
  });
});

describe('OpenAPI document', () => {
  it('is a valid 3.0 document with the pieces Swagger UI needs', () => {
    expect(openapi.openapi).toMatch(/^3\.0/);
    expect(openapi.info.title).toBeTruthy();
    expect(openapi.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    expect(openapi.security).toEqual([{ bearerAuth: [] }]);
  });

  it('gives every operation a summary, a tag and a success response', () => {
    const faults = [];
    Object.entries(openapi.paths).forEach(([path, operations]) => {
      Object.entries(operations)
        .filter(([method]) => HTTP_METHODS.includes(method))
        .forEach(([method, op]) => {
          const where = `${method.toUpperCase()} ${path}`;
          if (!op.summary) faults.push(`${where}: no summary`);
          if (!op.tags || !op.tags.length) faults.push(`${where}: no tag`);
          const success = Object.keys(op.responses).some((code) => code.startsWith('2'));
          if (!success) faults.push(`${where}: no 2xx response`);
        });
    });
    expect(faults).toEqual([]);
  });

  it('declares every tag it uses', () => {
    const declared = new Set(openapi.tags.map((t) => t.name));
    const used = new Set();
    Object.values(openapi.paths).forEach((operations) => {
      Object.entries(operations)
        .filter(([method]) => HTTP_METHODS.includes(method))
        .forEach(([, op]) => op.tags.forEach((t) => used.add(t)));
    });
    expect([...used].filter((t) => !declared.has(t)).sort()).toEqual([]);
  });

  it('resolves every $ref against components.schemas', () => {
    const names = new Set(Object.keys(openapi.components.schemas));
    const broken = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.$ref === 'string') {
        const name = node.$ref.replace('#/components/schemas/', '');
        if (!names.has(name)) broken.push(node.$ref);
      }
      Object.values(node).forEach(walk);
    };
    walk(openapi.paths);
    expect(broken).toEqual([]);
  });

  it('leaves the public endpoints reachable without a token', () => {
    // Sign-in and the share views must not require the token they are used to obtain.
    expect(openapi.paths['/signin'].post.security).toEqual([]);
    expect(openapi.paths['/health'].get.security).toEqual([]);
    expect(openapi.paths['/share/{code}/{type}'].get.security).toEqual([]);
    // Everything else inherits the document-level requirement.
    expect(openapi.paths['/companies/'].get.security).toBeUndefined();
  });
});
