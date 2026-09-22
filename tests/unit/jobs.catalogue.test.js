'use strict';

/*
 * The job catalogue is a security boundary, not just a list.
 *
 * These scripts take database names and organisation ids on their command line
 * and run with credentials in their environment. Before the queue, a service
 * named a script directly and built its argv, so the safety of the whole
 * arrangement rested on every call site getting that right. Now a request can
 * only name a catalogue entry, and the arguments are built here from a
 * validated payload. These tests hold that property in place.
 */

const { JOBS, JOB_NAMES, jobDefinition } = require('../../src/jobs/catalogue');

describe('job catalogue', () => {
  it('declares every job completely', () => {
    JOB_NAMES.forEach((name) => {
      const definition = JOBS[name];
      expect(['php', 'node']).toContain(definition.runtime);
      expect(typeof definition.script).toBe('string');
      expect(definition.script).toMatch(/\.(php|js)$/);
      expect(typeof definition.args).toBe('function');
      expect(typeof definition.schema.safeParse).toBe('function');
      expect(definition.timeoutMs).toBeGreaterThan(0);
      expect(definition.attempts).toBeGreaterThanOrEqual(1);
      expect(typeof definition.description).toBe('string');
    });
  });

  it('never lets a job name reach the filesystem as a path', () => {
    JOB_NAMES.forEach((name) => {
      // A script is a bare filename; anything with a separator or a parent
      // reference would escape SCRIPT_PATH.
      expect(JOBS[name].script).not.toMatch(/[/\\]/);
      expect(JOBS[name].script).not.toContain('..');
    });
  });

  it('refuses an unknown job rather than guessing', () => {
    expect(() => jobDefinition('does.not.exist')).toThrow(/Unknown job/);
    expect(() => jobDefinition('../../etc/passwd')).toThrow(/Unknown job/);
  });

  it('builds arguments only from a payload that passed its schema', () => {
    const definition = jobDefinition('repair.update-flag');
    const bad = definition.schema.safeParse({ organisationId: 'not-a-number' });
    expect(bad.success).toBe(false);

    const good = definition.schema.safeParse({ organisationId: '118', companyId: 9 });
    expect(good.success).toBe(true);
    expect(definition.args(good.data)).toEqual([118, 9]);
  });

  it('keeps a shell-flavoured value as one argument', () => {
    const definition = jobDefinition('customer.build-tree');
    const crafted = 'Acme"; touch /tmp/pwned; #';
    const parsed = definition.schema.parse({ organisationName: crafted });
    const args = definition.args(parsed);

    // One argument, unchanged: execFile receives an array, so there is no shell
    // to interpret it.
    expect(args).toEqual([crafted]);
    expect(args).toHaveLength(1);
  });

  it('serialises id lists as JSON, not as joined text', () => {
    const definition = jobDefinition('repair.update-flag-bulk');
    const parsed = definition.schema.parse({ organisationId: 68, companyIds: [9, 10] });
    expect(definition.args(parsed)).toEqual([68, '[9,10]']);
  });

  /*
   * Two rebuilds of the same customer at once would have them writing over each
   * other. The dedupe key is what stops a double-clicked button doing that, so
   * every job heavy enough to matter must have one.
   */
  it('gives every customer-scoped rebuild a dedupe key', () => {
    const mustDedupe = [
      'customer.provision',
      'customer.publish-companies',
      'customer.publish-addresses',
      'company.build-application-data',
      'family.build-for-customer',
    ];
    mustDedupe.forEach((name) => {
      const definition = jobDefinition(name);
      expect(typeof definition.dedupe).toBe('function');
      const sample = definition.schema.parse(
        name === 'family.build-for-customer'
          ? { customerId: 68, representativeIds: [] }
          : { organisationId: 68 }
      );
      expect(definition.dedupe(sample)).toEqual(expect.stringContaining('68'));
    });
  });

  it('marks the one script that exists in no repository', () => {
    // update_client_companies.php is called by publishCompanies and is present
    // in none of the three pipeline checkouts; only the _address variant is.
    expect(JOBS['customer.publish-companies'].missing).toEqual(expect.any(String));
    // Nothing else claims to be missing.
    const missing = JOB_NAMES.filter((n) => JOBS[n].missing);
    expect(missing).toEqual(['customer.publish-companies']);
  });

  it('records which repositories carry each script', () => {
    JOB_NAMES.forEach((name) => {
      expect(Array.isArray(JOBS[name].sources)).toBe(true);
      // Only the missing one may list no source.
      if (!JOBS[name].missing) expect(JOBS[name].sources.length).toBeGreaterThan(0);
    });
  });
});
