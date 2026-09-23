'use strict';

/*
 * The runner: the only place that spawns an interpreter.
 *
 * Two classes of bug are pinned here. The environment handed to the scripts
 * was incomplete — three variables they read were never set — and two database
 * names were mapped to each other. And a script missing from the deployment
 * was discovered only when the interpreter failed, minutes after someone had
 * been told the job started.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const { scriptEnv, scriptPath, checkRunnable, runJob } = require('../../src/jobs/runner');
const { env } = require('../../src/config/env');

describe('the environment a script receives', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it('sets the three variables the scripts read that were never provided', () => {
    process.env.PASSWORD = 'db-secret';
    process.env.STATIC_FILE_DISC_PATH = '/srv/static';
    process.env.STATIC_FILES_URL = 'https://static.example';

    const e = scriptEnv();

    // script_create_customer_db.php connects with DB_RT_PWD; without it the
    // script authenticated with an empty password.
    expect(e.DB_RT_PWD).toBe('db-secret');
    expect(e.STATIC_PATH).toBe('/srv/static');
    expect(e.STATIC_PATH_URL).toBe('https://static.example');
  });

  it('prefers an explicit DB_RT_PWD over falling back to PASSWORD', () => {
    process.env.PASSWORD = 'app-password';
    process.env.DB_RT_PWD = 'root-password';
    expect(scriptEnv().DB_RT_PWD).toBe('root-password');
  });

  it('maps each bibliographic database to its own name', () => {
    process.env.DATABASE_APPLICATION_BIBLIO = 'db_app_biblio';
    process.env.DATABASE_GRANT_BIBLIO = 'db_grant_biblio';

    const e = scriptEnv();

    // These were crossed: DB_APPLICATION_BIBLIO was given the grant database
    // and DB_GRANT_BIBLIO the application one.
    expect(e.DB_APPLICATION_BIBLIO).toBe('db_app_biblio');
    expect(e.DB_GRANT_BIBLIO).toBe('db_grant_biblio');
  });

  it('carries the database connection through under the names scripts use', () => {
    process.env.HOST = 'db.example';
    process.env.USER = 'appuser';
    process.env.DATABASE_RAW = 'db_uspto';
    process.env.DATABASE_BUSINESS = 'db_business';

    const e = scriptEnv();
    expect(e.DB_HOST).toBe('db.example');
    expect(e.DB_USER).toBe('appuser');
    expect(e.DB_USPTO_DB).toBe('db_uspto');
    expect(e.DB_BUSINESS).toBe('db_business');
  });
});

describe('deciding whether a job can run at all', () => {
  it('refuses everything when no script directory is configured', () => {
    const configured = env.jobs.scriptPath;
    env.jobs.scriptPath = '';
    try {
      const result = checkRunnable('customer.publish-addresses');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('SCRIPT_PATH');
    } finally {
      env.jobs.scriptPath = configured;
    }
  });

  it('refuses a script that is not present in the configured directory', () => {
    const configured = env.jobs.scriptPath;
    env.jobs.scriptPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-'));
    try {
      const result = checkRunnable('customer.publish-addresses');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('was not found');
    } finally {
      env.jobs.scriptPath = configured;
    }
  });

  it('accepts one that is present', () => {
    const configured = env.jobs.scriptPath;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-'));
    fs.writeFileSync(path.join(dir, 'update_client_companies_address.php'), '<?php');
    env.jobs.scriptPath = dir;
    try {
      expect(checkRunnable('customer.publish-addresses')).toEqual({ ok: true });
    } finally {
      env.jobs.scriptPath = configured;
    }
  });
});

describe('resolving a script path', () => {
  it('resolves under the configured directory', () => {
    const configured = env.jobs.scriptPath;
    env.jobs.scriptPath = '/var/www/html/scripts/';
    try {
      expect(scriptPath('update_flag.php')).toBe('/var/www/html/scripts/update_flag.php');
    } finally {
      env.jobs.scriptPath = configured;
    }
  });
});

describe('running a script', () => {
  const configured = env.jobs.scriptPath;
  let dir;

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-run-')); env.jobs.scriptPath = dir; });
  afterEach(() => { env.jobs.scriptPath = configured; });

  it('runs a node script and returns what it printed', async () => {
    // family.persist-asset is a node job taking one argument.
    fs.writeFileSync(path.join(dir, 'assets_family_single.js'), 'console.log("asset:" + process.argv[2]);');

    const result = await runJob('family.persist-asset', { asset: '11489885' });

    expect(result.stdout).toContain('asset:11489885');
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  it('passes a shell-flavoured argument through as one argument', async () => {
    fs.writeFileSync(path.join(dir, 'assets_family_single.js'), 'console.log(JSON.stringify(process.argv.slice(2)));');
    const crafted = '1"; touch /tmp/pwned; #';

    const result = await runJob('family.persist-asset', { asset: crafted });

    // One element, unchanged: no shell ever saw it.
    expect(JSON.parse(result.stdout.trim())).toEqual([crafted]);
  });

  it('reports a non-zero exit as a failure naming the job', async () => {
    fs.writeFileSync(path.join(dir, 'assets_family_single.js'), 'process.exit(3);');
    await expect(runJob('family.persist-asset', { asset: '1' }))
      .rejects.toThrow(/family\.persist-asset/);
  });

  it('streams whole lines of output as progress', async () => {
    fs.writeFileSync(
      path.join(dir, 'assets_family_single.js'),
      'console.log("step one"); console.log("step two");'
    );
    const seen = [];

    await runJob('family.persist-asset', { asset: '1' }, { onProgress: (line) => seen.push(line) });

    expect(seen).toEqual(['step one', 'step two']);
  });

  it('refuses to run a job whose script is missing, without spawning anything', async () => {
    await expect(runJob('family.persist-asset', { asset: '1' }))
      .rejects.toThrow(/was not found/);
  });
});
