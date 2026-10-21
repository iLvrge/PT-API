'use strict';

/**
 * The producer side of the job queue.
 *
 * Services call `enqueue(name, payload)` and get a job id back immediately.
 * Nothing in a request handler waits for a data-pipeline script any more, and
 * nothing spawns one: a request can only ever add a validated entry to a queue.
 *
 * The connection is opened lazily. Most of this API has nothing to do with
 * jobs, and the test suite and a developer without Redis should not need one
 * running just to boot — see `inline` below.
 */

const { Queue } = require('bullmq');
const { env } = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/api-error');
const { jobDefinition, JOB_NAMES } = require('./catalogue');
const { runJob, checkRunnable } = require('./runner');

let queue = null;

/** Connection options shared by the queue and the worker. */
const connection = () => {
  const url = new URL(env.jobs.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    // BullMQ requires this: a blocking consumer must not have its command
    // retried out from under it.
    maxRetriesPerRequest: null,
  };
};

/** The shared queue handle, opened on first use. */
const getQueue = () => {
  if (env.jobs.inline) return null;
  if (!queue) {
    queue = new Queue(env.jobs.queueName, { connection: connection() });
    queue.on('error', (err) => logger.error('job queue error', { error: err.message }));
  }
  return queue;
};

/**
 * A job id the queue will accept.
 *
 * BullMQ rejects a custom id containing a colon — it builds its Redis keys by
 * joining on one — and the natural dedupe key here reads `org:68`. Anything
 * outside this set is folded to a dash, which keeps the id deterministic (the
 * whole point of it) while staying legal.
 */
const safeJobId = (raw) => String(raw).replace(/[^A-Za-z0-9._-]/g, '-');

/**
 * Validate a payload against its job's schema.
 * Throws a 400 with the offending fields rather than queueing something the
 * script would choke on twenty minutes later.
 */
const validate = (name, payload) => {
  const definition = jobDefinition(name);
  const parsed = definition.schema.safeParse(payload || {});
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    throw ApiError.badRequest(`Invalid payload for job ${name}`, details);
  }
  return parsed.data;
};

/**
 * Queue a job.
 *
 * @param {string} name     a catalogue job name
 * @param {object} payload  validated against that job's schema
 * @param {object} [opts]   { requestedBy } for the audit trail
 * @returns {Promise<{ id, name, deduped, inline }>}
 */
const enqueue = async (name, payload, opts = {}) => {
  const definition = jobDefinition(name);
  const data = validate(name, payload);

  // Refuse now, with a reason, rather than queueing work that cannot run.
  const runnable = checkRunnable(name);
  if (!runnable.ok) {
    logger.warn('job refused', { job: name, reason: runnable.reason });
    throw new ApiError(503, `Cannot run ${name}: ${runnable.reason}`);
  }

  /*
   * Run here and now when there is no queue.
   *
   * Awaited rather than detached: inline mode exists for tests and for a
   * developer without Redis, and in both a silently backgrounded promise is
   * worse than a slow call.
   */
  if (env.jobs.inline) {
    await runJob(name, data);
    return { id: `inline:${name}:${Date.now()}`, name, deduped: false, inline: true };
  }

  /*
   * A deterministic id makes the queue idempotent: BullMQ ignores an add whose
   * id already exists, so a double-clicked button cannot start two rebuilds of
   * the same customer. Jobs whose work differs per call declare `dedupe: null`.
   */
  const dedupeKey = definition.dedupe ? definition.dedupe(data) : null;
  const jobId = dedupeKey ? safeJobId(`${name}.${dedupeKey}`) : undefined;

  const job = await getQueue().add(
    name,
    { payload: data, requestedBy: opts.requestedBy ?? null, requestedAt: new Date().toISOString() },
    {
      jobId,
      attempts: definition.attempts,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: env.jobs.keepCompleted,
      removeOnFail: env.jobs.keepFailed,
    }
  );

  // add() returns the existing job when the id is taken, so the ids match.
  const deduped = Boolean(jobId && job.id !== undefined && job.id === jobId && job.attemptsMade > 0);
  logger.info('job queued', { job: name, id: job.id, deduped });
  return { id: String(job.id), name, deduped, inline: false };
};

/** One job's current state, for the status endpoint. */
const jobStatus = async (id) => {
  const q = getQueue();
  if (!q) return null;
  const job = await q.getJob(id);
  if (!job) return null;
  const state = await job.getState();
  return {
    id: String(job.id),
    name: job.name,
    state,
    progress: job.progress ?? null,
    attemptsMade: job.attemptsMade,
    attemptsAllowed: job.opts && job.opts.attempts,
    requestedBy: job.data && job.data.requestedBy,
    requestedAt: job.data && job.data.requestedAt,
    processedOn: job.processedOn || null,
    finishedOn: job.finishedOn || null,
    failedReason: job.failedReason || null,
  };
};

/** Recent jobs, newest first — what the console shows as "what is running". */
const recentJobs = async (limit = 50) => {
  const q = getQueue();
  if (!q) return [];
  const jobs = await q.getJobs(['active', 'waiting', 'delayed', 'completed', 'failed'], 0, limit - 1, false);
  const rows = await Promise.all(jobs.map(async (job) => ({
    id: String(job.id),
    name: job.name,
    state: await job.getState(),
    progress: job.progress ?? null,
    attemptsMade: job.attemptsMade,
    requestedAt: job.data && job.data.requestedAt,
    finishedOn: job.finishedOn || null,
    failedReason: job.failedReason || null,
  })));
  return rows.sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
};

/** Queue depth by state, for /health and for an operator. */
const queueCounts = async () => {
  const q = getQueue();
  if (!q) return { inline: true };
  return q.getJobCounts('active', 'waiting', 'delayed', 'completed', 'failed');
};

const close = async () => {
  // Cleared before awaiting, not after: anything calling enqueue() while the
  // close is in flight would otherwise be handed the closing queue.
  const closing = queue;
  queue = null;
  if (closing) await closing.close().catch(() => {});
};

module.exports = {
  enqueue, jobStatus, recentJobs, queueCounts, close, connection, validate, safeJobId, JOB_NAMES,
};
