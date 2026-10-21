'use strict';

/**
 * The consumer: a separate process that runs the data-pipeline scripts.
 *
 * Separate on purpose. These jobs run for minutes to hours, and when they were
 * spawned from the API process a deploy or a crash killed whatever was in
 * flight with no record that it had ever been asked for. Here the API only
 * writes to the queue, and the work survives it restarting. It also means the
 * worker can be stopped, scaled or run on another machine without touching the
 * API.
 *
 * Run with: npm run worker
 */

require('dotenv').config();

const { Worker } = require('bullmq');
const { env } = require('../config/env');
const logger = require('../utils/logger');
const { connection } = require('./queue');
const { runJob } = require('./runner');
const { closeAll } = require('../db');
const { closeAll: closeTenants } = require('../db/tenant-connections');

let worker = null;

const start = () => {
  if (env.jobs.inline) {
    logger.warn('worker not started: JOBS_INLINE is set, so jobs run in the API process');
    return null;
  }

  worker = new Worker(
    env.jobs.queueName,
    async (job) => {
      const { payload } = job.data || {};
      logger.info('job picked up', { job: job.name, id: job.id, attempt: job.attemptsMade + 1 });

      // The script's own output is the only progress these pipelines report.
      const result = await runJob(job.name, payload, {
        onProgress: (line) => { job.updateProgress({ line, at: Date.now() }).catch(() => {}); },
      });

      return {
        ms: result.ms,
        // Enough of the tail to see how a run ended, without storing megabytes
        // of a rebuild's chatter in Redis.
        output: String(result.stdout || '').slice(-2000),
      };
    },
    {
      connection: connection(),
      concurrency: env.jobs.concurrency,
      // A job that outlives its lock would otherwise be handed to a second
      // worker while the first is still running it — two rebuilds at once.
      lockDuration: 5 * 60 * 1000,
      lockRenewTime: 60 * 1000,
    }
  );

  worker.on('completed', (job, result) => {
    logger.info('job completed', { job: job.name, id: job.id, ms: result && result.ms });
  });
  worker.on('failed', (job, err) => {
    logger.error('job failed', {
      job: job && job.name,
      id: job && job.id,
      attempt: job && job.attemptsMade,
      willRetry: Boolean(job && job.attemptsMade < (job.opts.attempts || 1)),
      error: err.message,
    });
  });
  worker.on('error', (err) => logger.error('worker error', { error: err.message }));

  logger.info('job worker started', {
    queue: env.jobs.queueName,
    concurrency: env.jobs.concurrency,
    scriptPath: env.jobs.scriptPath || '(unset)',
  });
  return worker;
};

/**
 * Stop accepting new jobs and let the running ones finish.
 * `close(false)` waits rather than severing a script mid-rebuild.
 */
const shutdown = async (signal) => {
  logger.info('worker shutting down', { signal });
  if (worker) await worker.close(false).catch(() => {});
  await Promise.all([closeAll(), closeTenants()]);
  process.exit(0);
};

if (require.main === module) {
  start();
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('worker unhandledRejection', {
      reason: reason && reason.message ? reason.message : reason,
    });
  });
}

module.exports = { start, shutdown };
