'use strict';

const path = require('path');
const files = require('../../src/modules/admin-customers/admin-customers.files');

describe('admin-customers.files.resolveEntityFile', () => {
  it('accepts the files the normalisation scripts write', () => {
    const full = files.resolveEntityFile('normalizeNames_118_file.json');
    expect(path.basename(full)).toBe('normalizeNames_118_file.json');
  });

  // The legacy version joined the caller's name straight onto the script
  // directory, so any of these read whatever the API process could read.
  it.each([
    '../../../../etc/passwd',
    '../../.env',
    '/etc/passwd',
    'normalizeNames_118_file.json/../../../etc/passwd',
  ])('rejects %s', (name) => {
    expect(() => files.resolveEntityFile(name)).toThrow(/Unknown entity file/);
  });

  it('rejects a file that is not one of the normaliser outputs', () => {
    expect(() => files.resolveEntityFile('secrets.json')).toThrow(/Unknown entity file/);
    expect(() => files.resolveEntityFile('normalizeNames_118_file.txt')).toThrow(/Unknown entity file/);
  });

  it('rejects an empty name', () => {
    expect(() => files.resolveEntityFile('')).toThrow(/Unknown entity file/);
    expect(() => files.resolveEntityFile(undefined)).toThrow(/Unknown entity file/);
  });
});

describe('admin-customers.files.entityFileName', () => {
  it('names the plain run', () => {
    expect(files.entityFileName({ organisationId: 118, type: '0', portfolios: [] }))
      .toBe('normalizeNames_118_file.json');
  });

  it('includes the portfolios for a portfolio run', () => {
    expect(files.entityFileName({ organisationId: 118, type: 1, portfolios: [9, 10] }))
      .toBe('normalizeNames_118_910_file.json');
  });

  it('falls back to the plain name when a portfolio run names none', () => {
    expect(files.entityFileName({ organisationId: 118, type: 1, portfolios: [] }))
      .toBe('normalizeNames_118_file.json');
  });
});

describe('admin-customers.files.readEntityFile', () => {
  it('returns an empty list when the script has not produced the file', async () => {
    await expect(files.readEntityFile('normalizeNames_999999_file.json')).resolves.toEqual([]);
  });

  it('still refuses a traversal attempt', async () => {
    await expect(files.readEntityFile('../../../../etc/passwd')).rejects.toThrow(/Unknown entity file/);
  });
});
