'use strict';

/**
 * Runs one data-pipeline script as a child process.
 *
 * This is the only place that spawns an interpreter. It is deliberately dumb:
 * it is handed a job definition and a validated payload, and it runs the thing
 * and reports what happened. Deciding *whether* to run belongs to the queue.
 *
 * Carried over from the runner this replaces: execFile with an argument array
 * rather than a shell string, so a value containing a quote and a semicolon is
 * an argument and not a second command; credentials in the environment rather
 * than on the command line, where `ps` would show them.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');
const logger = require('../utils/logger');
const { jobDefinition } = require('./catalogue');

/**
 * The environment a script expects.
 *
 * Three variables the scripts read were never set — script_create_customer_db
 * reads DB_RT_PWD, and several read STATIC_PATH and STATIC_PATH_URL — so those
 * scripts saw empty strings and connected, or wrote, nowhere useful.
 *
 * The two bibliographic databases were also mapped to each other's names:
 * DB_APPLICATION_BIBLIO was given DATABASE_GRANT_BIBLIO and vice versa. No
 * currently-invoked script reads them, which is the only reason it had not
 * surfaced yet.
 */
const scriptEnv = () => ({
  ...process.env,
  DB_HOST: process.env.HOST,
  DB_USER: process.env.USER,
  DB_PASSWORD: process.env.PASSWORD,
  // The PHP scripts connect as root with this password; several read only it.
  DB_RT_PWD: process.env.DB_RT_PWD || process.env.PASSWORD,
  DB_USPTO_DB: process.env.DATABASE_RAW,
  DB_APPLICATION_DB: process.env.DATABASE_APPLICATION_NEW,
  DB_BUSINESS: process.env.DATABASE_BUSINESS,
  DB_APPLICATION_BIBLIO: process.env.DATABASE_APPLICATION_BIBLIO,
  DB_GRANT_BIBLIO: process.env.DATABASE_GRANT_BIBLIO,
  STATIC_PATH: process.env.STATIC_PATH || process.env.STATIC_FILE_DISC_PATH || '',
  STATIC_PATH_URL: process.env.STATIC_PATH_URL || process.env.STATIC_FILES_URL || '',
});

/** Absolute path of a script, under the configured pipeline directory. */
const scriptPath = (script) => path.join(env.jobs.scriptPath || '', script);

/**
 * Is this job runnable on this machine at all?
 *
 * Checked before queueing as well as before running, so a request gets a clear
 * answer now instead of a job that sits in the queue and fails later. The old
 * runner discovered a missing script only when the interpreter failed, logged
 * it, and dropped it.
 */
const checkRunnable = (name) => {
  const definition = jobDefinition(name);
  if (definition.missing) {
    return { ok: false, reason: `${definition.script} is not available: ${definition.missing}` };
  }
  const full = scriptPath(definition.script);
  if (!env.jobs.scriptPath) {
    return { ok: false, reason: 'SCRIPT_PATH is not configured, so no pipeline script can be run' };
  }
  if (!fs.existsSync(full)) {
    return { ok: false, reason: `${definition.script} was not found at ${env.jobs.scriptPath}` };
  }
  return { ok: true };
};

/**
 * Run a job's script to completion.
 *
 * @param {string} name       job name from the catalogue
 * @param {object} payload    already validated against the job's schema
 * @param {object} [hooks]    { onProgress(line) } — called per stdout line
 * @returns {Promise<{ stdout: string, stderr: string, ms: number }>}
 */
const runJob = async (name, payload, hooks = {}) => {
  const definition = jobDefinition(name);
  const runnable = checkRunnable(name);
  if (!runnable.ok) throw new Error(runnable.reason);

  const args = definition.args(payload).map(String);
  const full = scriptPath(definition.script);
  const command = definition.runtime === 'php' ? 'php' : process.execPath;
  const argv = definition.runtime === 'php' ? ['-f', full, ...args] : [full, ...args];

  const startedAt = Date.now();
  logger.info('job starting', { job: name, script: definition.script, runtime: definition.runtime });

  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      argv,
      {
        env: scriptEnv(),
        // These scripts print progress for whole customers; 10MB was hit by the
        // larger rebuilds, which then failed with ENOBUFS after doing the work.
        maxBuffer: 64 * 1024 * 1024,
        timeout: definition.timeoutMs,
        killSignal: 'SIGTERM',
      },
      (err, stdout, stderr) => {
        const ms = Date.now() - startedAt;
        if (err) {
          // execFile reports a timeout as a killed process, which otherwise
          // looks like an ordinary non-zero exit in the logs.
          const timedOut = err.killed || err.signal === 'SIGTERM';
          const reason = timedOut
            ? `timed out after ${definition.timeoutMs}ms`
            : err.message;
          logger.error('job failed', { job: name, script: definition.script, ms, error: reason });
          const failure = new Error(`${name}: ${reason}`);
          failure.stderr = String(stderr || '').slice(-4000);
          failure.timedOut = timedOut;
          return reject(failure);
        }
        if (stderr) logger.warn('job wrote to stderr', { job: name, script: definition.script });
        logger.info('job finished', { job: name, script: definition.script, ms });
        return resolve({ stdout, stderr, ms });
      }
    );

    // Scripts report progress by printing; pass whole lines to the caller so
    // the queue can record them and the console can show something moving.
    if (hooks.onProgress && child.stdout) {
      let buffer = '';
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.filter((l) => l.trim()).forEach((line) => {
          try {
            hooks.onProgress(line.trim().slice(0, 500));
          } catch (_err) {
            // A broken progress hook must not kill the job reporting through it.
          }
        });
      });
    }
  });
};

module.exports = { runJob, checkRunnable, scriptEnv, scriptPath };
