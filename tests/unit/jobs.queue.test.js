'use strict';

/*
 * The producer side: what happens between a request asking for work and that
 * work reaching Redis.
 *
 * Three things matter here and none of them existed before. A payload is
 * validated before anything is queued, rather than a script discovering it is
 * wrong twenty minutes later. A job whose script is absent is refused now,
 * with a reason, instead of being queued to fail. And an identical job that is
 * already waiting collapses into the one already there.
 */

jest.mock('../../src/jobs/runner', () => ({
  runJob: jest.fn().mockResolvedValue({ stdout: '', stderr: '', ms: 1 }),
  checkRunnable: jest.fn().mockReturnValue({ ok: true }),
}));

const runner = require('../../src/jobs/runner');
const queue = require('../../src/jobs/queue');
const { env } = require('../../src/config/env');

beforeEach(() => {
  jest.clearAllMocks();
  runner.checkRunnable.mockReturnValue({ ok: true });
  runner.runJob.mockResolvedValue({ stdout: '', stderr: '', ms: 1 });
});

describe('payload validation', () => {
  it('rejects a payload the job cannot use, before queueing anything', async () => {
    await expect(queue.enqueue('repair.update-flag', { organisationId: 'abc' }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(runner.runJob).not.toHaveBeenCalled();
  });

  it('names the offending field', async () => {
    const error = await queue.enqueue('customer.provision', {}).catch((e) => e);
    expect(error.statusCode).toBe(400);
    expect(JSON.stringify(error.details)).toContain('organisationId');
  });

  it('refuses a job that is not in the catalogue', async () => {
    await expect(queue.enqueue('rm -rf /', {})).rejects.toThrow(/Unknown job/);
  });

  it('coerces and normalises what it accepts', () => {
    const data = queue.validate('repair.update-flag', { organisationId: '68', companyId: '9' });
    expect(data).toEqual({ organisationId: 68, companyId: 9 });
  });
});

describe('jobs that cannot run here', () => {
  it('refuses with 503 and a reason rather than queueing', async () => {
    runner.checkRunnable.mockReturnValue({ ok: false, reason: 'script.php was not found' });

    const error = await queue.enqueue('customer.publish-addresses', { organisationId: 68 })
      .catch((e) => e);

    expect(error.statusCode).toBe(503);
    expect(error.message).toContain('was not found');
    expect(runner.runJob).not.toHaveBeenCalled();
  });
});

/*
 * Inline mode: no Redis. The test environment and a developer without a broker
 * both use it, and it must actually run the job — the previous runner's habit
 * of silently doing nothing on a machine without SCRIPT_PATH is the failure
 * mode being avoided.
 */
describe('inline mode', () => {
  it('runs the job in-process and awaits it', async () => {
    expect(env.jobs.inline).toBe(true); // NODE_ENV=test

    const result = await queue.enqueue('repair.update-flag', { organisationId: 68, companyId: 9 });

    expect(runner.runJob).toHaveBeenCalledWith('repair.update-flag', { organisationId: 68, companyId: 9 });
    expect(result.inline).toBe(true);
    expect(result.name).toBe('repair.update-flag');
  });

  it('propagates a failure instead of swallowing it', async () => {
    runner.runJob.mockRejectedValue(new Error('php exited 1'));
    await expect(queue.enqueue('repair.update-flag', { organisationId: 68 }))
      .rejects.toThrow('php exited 1');
  });

  it('reports no queue depth when there is no queue', async () => {
    await expect(queue.queueCounts()).resolves.toEqual({ inline: true });
    await expect(queue.recentJobs()).resolves.toEqual([]);
    await expect(queue.jobStatus('anything')).resolves.toBeNull();
  });
});

/*
 * The dedupe key is what makes a double-clicked button harmless, so the id
 * built from it has to be one the queue will actually accept. BullMQ rejects a
 * custom id containing a colon — it joins its own Redis keys on one — and the
 * natural key here reads `org:68`. That threw at enqueue time, only against a
 * real Redis, so the mocked tests could not see it.
 */
describe('job ids built from a dedupe key', () => {
  it('contains no colon, which the queue rejects', () => {
    expect(queue.safeJobId('repair.update-flag.org:68:company:859'))
      .toBe('repair.update-flag.org-68-company-859');
    expect(queue.safeJobId('a:b')).not.toContain(':');
  });

  it('stays deterministic — the same key always gives the same id', () => {
    expect(queue.safeJobId('customer.provision.org:68'))
      .toBe(queue.safeJobId('customer.provision.org:68'));
  });

  it('folds anything else that could break a key', () => {
    expect(queue.safeJobId('name:Acme Inc / "weird"')).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('keeps different keys distinct', () => {
    expect(queue.safeJobId('org:68')).not.toBe(queue.safeJobId('org:69'));
  });
});

describe('redis connection settings', () => {
  it('disables per-command retries, which a blocking consumer requires', () => {
    // BullMQ refuses to start a worker otherwise, and the failure is obscure.
    expect(queue.connection().maxRetriesPerRequest).toBeNull();
  });

  it('parses host and port out of the configured url', () => {
    const conn = queue.connection();
    expect(typeof conn.host).toBe('string');
    expect(conn.port).toBeGreaterThan(0);
  });
});
