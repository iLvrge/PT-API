'use strict';

/**
 * `x IN (SELECT ...)` is banned in this codebase.
 *
 * These queries run against db_uspto.documentid and db_new_application
 * .dashboard_items, tables with millions of rows. MySQL materialises the
 * subquery before it can test a single outer row, and several of the legacy
 * shapes nested two or three of them - which is what took the server down with
 * no error in the log, and what made /assets/cpc take 14 seconds.
 *
 * Every one of them is now a join: an INNER JOIN to a DISTINCT derived table
 * for membership, a LEFT JOIN ... IS NULL anti-join for exclusion. Both select
 * the same rows without building the intermediate set.
 *
 * This walks the real source rather than any one builder's output, because the
 * shapes are assembled from string fragments across many modules and a
 * per-builder assertion only covers the branches a test happens to exercise.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');

/** Source with comments removed, so documentation of past shapes is ignored. */
const withoutComments = (code) =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => {
      // Not a real JS parse: enough to drop `// ...` while leaving `://` in
      // URLs and `:name` bindings alone.
      const at = line.search(/(^|[^:\w])\/\//);
      return at === -1 ? line : line.slice(0, at);
    })
    .join('\n');

const jsFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });

// `(?<![A-Za-z])` so this does not fire on the "IN (" inside "JOIN (".
const IN_SUBQUERY = /(?<![A-Za-z])(?:NOT\s+)?IN\s*\(\s*SELECT/i;

describe('SQL shape', () => {
  it('has no IN (SELECT ...) anywhere in src', () => {
    const offenders = [];

    for (const file of jsFiles(SRC)) {
      const lines = withoutComments(fs.readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (IN_SUBQUERY.test(line)) {
          offenders.push(`${path.relative(SRC, file)}:${i + 1}  ${line.trim().slice(0, 100)}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
