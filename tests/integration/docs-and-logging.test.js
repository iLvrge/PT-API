'use strict';

jest.mock('../../src/modules/users/users.repository');

const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();

describe('docs and request logging', () => {
  it('serves the raw OpenAPI spec at /docs.json', async () => {
    const res = await request(app).get('/docs.json').expect(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info.title).toMatch(/PatenTrack/);
    expect(res.body.paths['/admin/keywords']).toBeDefined();
  });

  it('serves Swagger UI at /docs', async () => {
    const res = await request(app).get('/docs/').expect(200);
    expect(res.text).toMatch(/swagger-ui/i);
  });

  it('sets an X-Request-Id header on responses', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^[a-f0-9]{16}$/);
  });

  it('echoes a supplied x-request-id', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'trace-123').expect(200);
    expect(res.headers['x-request-id']).toBe('trace-123');
  });
});
