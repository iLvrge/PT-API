'use strict';

/*
 * The job endpoints over the full HTTP stack.
 *
 * The console had no way to ask whether a long job was still running, so a
 * rebuild that takes twenty minutes and one that died immediately looked the
 * same from the browser — which is what several "the button does nothing"
 * reports turned out to be. These endpoints answer that, and they are admin
 * only because starting one rebuilds a customer's data.
 */

jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/jobs/queue');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const usersRepo = require('../../src/modules/users/users.repository');
const queue = require('../../src/jobs/queue');
const { startTestServer } = require('../helpers/server');
const { env } = require('../../src/config/env');

// The controller reads the real catalogue and the real runnability check.
const { JOB_NAMES } = jest.requireActual('../../src/jobs/catalogue');

const app = startTestServer();
const token = jwt.sign({ id: 5, orgId: 3 }, env.auth.secret);
const auth = (req) => req.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  jest.clearAllMocks();
  usersRepo.findActiveById.mockResolvedValue({ user_id: 5, organisation_id: 3, type: 9 });
  usersRepo.isAdmin.mockResolvedValue(true);
  queue.JOB_NAMES = JOB_NAMES;
});

describe('access', () => {
  it('401s without a token', async () => {
    await request(app).get('/admin/jobs').expect(401);
  });

  it('403s for a valid non-admin token', async () => {
    usersRepo.isAdmin.mockResolvedValue(false);
    await auth(request(app).get('/admin/jobs')).expect(403);
  });
});

describe('GET /admin/jobs/catalogue', () => {
  it('lists every declared job', async () => {
    const res = await auth(request(app).get('/admin/jobs/catalogue')).expect(200);
    expect(res.body).toHaveLength(JOB_NAMES.length);
    expect(res.body[0]).toEqual(expect.objectContaining({
      name: expect.any(String),
      runtime: expect.stringMatching(/^(php|node)$/),
      script: expect.any(String),
      runnable: expect.any(Boolean),
    }));
  });

  it('says which jobs cannot run here, and why', async () => {
    const res = await auth(request(app).get('/admin/jobs/catalogue')).expect(200);
    const publish = res.body.find((j) => j.name === 'customer.publish-companies');

    // Its script is in none of the pipeline repositories. Reporting that here
    // is the whole point: it used to surface only as a job that failed.
    expect(publish.runnable).toBe(false);
    expect(publish.reason).toContain('update_client_companies.php');
  });

  it('is not shadowed by the :id route', async () => {
    const res = await auth(request(app).get('/admin/jobs/catalogue')).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(queue.jobStatus).not.toHaveBeenCalled();
  });
});

describe('GET /admin/jobs', () => {
  it('returns recent jobs and the queue depth', async () => {
    queue.recentJobs.mockResolvedValue([{ id: '1', name: 'customer.provision', state: 'active' }]);
    queue.queueCounts.mockResolvedValue({ active: 1, waiting: 0, failed: 2 });

    const res = await auth(request(app).get('/admin/jobs')).expect(200);

    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.counts).toEqual({ active: 1, waiting: 0, failed: 2 });
  });

  it('clamps an absurd limit rather than reading the whole queue', async () => {
    queue.recentJobs.mockResolvedValue([]);
    queue.queueCounts.mockResolvedValue({});
    await auth(request(app).get('/admin/jobs?limit=100000')).expect(200);
    expect(queue.recentJobs).toHaveBeenCalledWith(200);
  });
});

describe('GET /admin/jobs/:id', () => {
  it('returns a job with its progress and attempts', async () => {
    queue.jobStatus.mockResolvedValue({
      id: 'customer.provision:org:68', name: 'customer.provision', state: 'active',
      progress: { line: 'creating database' }, attemptsMade: 1,
    });

    const res = await auth(request(app).get('/admin/jobs/customer.provision:org:68')).expect(200);

    expect(res.body).toMatchObject({ state: 'active', attemptsMade: 1 });
    expect(res.body.progress.line).toBe('creating database');
  });

  it('404s for a job that does not exist', async () => {
    queue.jobStatus.mockResolvedValue(null);
    await auth(request(app).get('/admin/jobs/nope')).expect(404);
  });
});

describe('POST /admin/jobs', () => {
  it('queues a known job and answers 202 with its id', async () => {
    queue.enqueue.mockResolvedValue({ id: 'job-9', name: 'customer.publish-addresses', deduped: false });

    const res = await auth(request(app).post('/admin/jobs'))
      .send({ name: 'customer.publish-addresses', payload: { organisationId: 68 } })
      .expect(202);

    expect(queue.enqueue).toHaveBeenCalledWith(
      'customer.publish-addresses', { organisationId: 68 }, { requestedBy: 5 }
    );
    expect(res.body.id).toBe('job-9');
  });

  /*
   * The important one. These scripts take database names on their command
   * line, so a name that is not in the catalogue must not reach the runner —
   * there is no path from a request to an arbitrary script.
   */
  it('refuses a job name that is not in the catalogue', async () => {
    const res = await auth(request(app).post('/admin/jobs'))
      .send({ name: '../../../bin/sh', payload: {} })
      .expect(400);

    expect(res.body.error.message).toContain('Unknown job');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('refuses a request with no job name', async () => {
    await auth(request(app).post('/admin/jobs')).send({ payload: {} }).expect(400);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('passes a queue refusal through with its status', async () => {
    const refusal = Object.assign(new Error('Cannot run: script missing'), { statusCode: 503 });
    queue.enqueue.mockRejectedValue(refusal);

    await auth(request(app).post('/admin/jobs'))
      .send({ name: 'customer.publish-companies', payload: { organisationId: 68 } })
      .expect(503);
  });
});
