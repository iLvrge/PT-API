'use strict';

/**
 * Safe runner for the legacy PHP data-pipeline scripts.
 *
 * Replaces helpers/runPhpScript.js, which built a shell string through `screen`
 * with DB and AWS credentials ON THE COMMAND LINE and console.logged the whole
 * thing (audit F9). Here:
 *   - execFile with an argument array — no shell, no injection surface
 *   - credentials passed via the child's environment, never argv
 *   - nothing secret is ever logged
 *   - background jobs carry a .catch so a failure can never become an
 *     unhandled rejection (audit F6)
 */

const { execFile } = require('child_process');
const path = require('path');
const logger = require('./logger');

const jobEnv = () => ({
  ...process.env,
  DB_HOST: process.env.HOST,
  DB_USER: process.env.USER,
  DB_PASSWORD: process.env.PASSWORD,
  DB_USPTO_DB: process.env.DATABASE_RAW,
  DB_APPLICATION_DB: process.env.DATABASE_APPLICATION_NEW,
  DB_BUSINESS: process.env.DATABASE_BUSINESS,
  DB_APPLICATION_BIBLIO: process.env.DATABASE_GRANT_BIBLIO,
  DB_GRANT_BIBLIO: process.env.DATABASE_APPLICATION_BIBLIO,
});

const scriptPath = (name) => path.join(process.env.SCRIPT_PATH || '', name);

/**
 * Run a PHP script and resolve when it exits.
 * @param {string} name script filename (resolved under SCRIPT_PATH)
 * @param {Array<string|number>} args plain arguments
 */
const runPhpScript = (name, args = []) =>
  new Promise((resolve, reject) => {
    execFile(
      'php',
      ['-f', scriptPath(name), ...args.map(String)],
      { env: jobEnv(), maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          logger.error('php job failed', { script: name, error: err.message });
          return reject(err);
        }
        if (stderr) logger.warn('php job stderr', { script: name });
        resolve({ stdout, stderr });
      }
    );
  });

/** Fire-and-forget variant: never rejects, logs failures. */
const runPhpScriptBackground = (name, args = []) => {
  runPhpScript(name, args).catch(() => {
    // already logged inside runPhpScript
  });
};

module.exports = { runPhpScript, runPhpScriptBackground };
