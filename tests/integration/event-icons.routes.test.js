'use strict';

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/db/tenant-connections');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const service = require('../../src/modules/event-icons/event-icons.service');
const createApp = require('../../src/app');
const { env } = require('../../src/config/env');

const app = createApp();
const token = jwt.sign({ id: 5, orgId: 118 }, env.auth.secret);
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 118, type: 0 });
});

describe('event icons', () => {
  it('401s without a token', async () => {
    await request(app).get('/events_icons').expect(401);
  });

  it('returns every icon keyed by event id', async () => {
    const res = await auth(request(app).get('/events_icons')).expect(200);
    // The legacy route carried 34 icons; every one must have survived the move
    // out of the route file and into src/modules/event-icons/icons.
    expect(Object.keys(res.body)).toHaveLength(34);
    expect(res.body['1']).toMatch(/^<svg/);
    expect(res.body['40']).toMatch(/<\/svg>$/);
  });

  it('serves one icon as SVG', async () => {
    // superagent only auto-parses text/*, so the SVG arrives as a buffer.
    const res = await auth(request(app).get('/events_icons/12'))
      .buffer(true)
      .parse((r, cb) => {
        let body = '';
        r.on('data', (chunk) => { body += chunk; });
        r.on('end', () => cb(null, body));
      })
      .expect(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(res.body).toMatch(/^<svg/);
  });

  it('404s for an event with no icon', async () => {
    // 31 is a real gap in the set — the ids are not contiguous.
    await auth(request(app).get('/events_icons/31')).expect(404);
  });

  it('400s on a non-numeric id', async () => {
    await auth(request(app).get('/events_icons/abc')).expect(400);
  });

  it('reads the icons from disk only once', async () => {
    service.reset();
    const first = service.all();
    expect(service.all()).toBe(first);
  });
});
