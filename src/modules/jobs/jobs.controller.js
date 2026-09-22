'use strict';

/**
 * Reading and starting background jobs.
 *
 * The console had no way to ask whether a long job was still running, so a
 * rebuild that takes twenty minutes and one that died on the first second
 * looked exactly the same from the browser. These endpoints answer that.
 */

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const queue = require('../../jobs/queue');
const { JOBS, JOB_NAMES } = require('../../jobs/catalogue');
const { checkRunnable } = require('../../jobs/runner');

/**
 * What this API can run, and whether each job could run right now.
 *
 * `runnable` is the useful part: a job whose script is missing from the
 * deployment reports so here instead of failing minutes after someone presses
 * the button.
 */
const catalogue = asyncHandler(async (req, res) => {
  res.status(200).json(
    JOB_NAMES.map((name) => {
      const definition = JOBS[name];
      const runnable = checkRunnable(name);
      return {
        name,
        description: definition.description,
        runtime: definition.runtime,
        script: definition.script,
        timeoutMs: definition.timeoutMs,
        attempts: definition.attempts,
        runnable: runnable.ok,
        reason: runnable.ok ? null : runnable.reason,
        sources: definition.sources,
      };
    })
  );
});

/** Recent jobs, newest first. */
const list = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  res.status(200).json({ jobs: await queue.recentJobs(limit), counts: await queue.queueCounts() });
});

/** One job: state, progress, attempts, and why it failed if it did. */
const show = asyncHandler(async (req, res) => {
  const job = await queue.jobStatus(req.params.id);
  if (!job) throw ApiError.notFound('No such job');
  res.status(200).json(job);
});

/**
 * Start a job by name.
 *
 * The name must be in the catalogue and the payload must satisfy that job's
 * schema, so this cannot be used to run an arbitrary script with arbitrary
 * arguments — which matters, because these scripts take database names on
 * their command line.
 */
const create = asyncHandler(async (req, res) => {
  const { name, payload } = req.body || {};
  if (!name || !JOB_NAMES.includes(name)) {
    throw ApiError.badRequest(`Unknown job. Known jobs: ${JOB_NAMES.join(', ')}`);
  }
  const queued = await queue.enqueue(name, payload, { requestedBy: req.auth && req.auth.userId });
  res.status(202).json(queued);
});

module.exports = { catalogue, list, show, create };
