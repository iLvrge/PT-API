'use strict';

/**
 * Raw SELECT helpers — the read side of the read/write split.
 *
 * Policy for this codebase (set by the team):
 *   - every READ is a raw SQL SELECT executed through these helpers
 *   - every INSERT / UPDATE / DELETE goes through a Sequelize model (a repository)
 *
 * These wrappers exist rather than calling sequelize.query() directly so that:
 *   1. `replacements` are always used, never string interpolation — the read
 *      migration cannot reintroduce SQL injection.
 *   2. logging defaults to off (audit P2).
 *   3. the result is always a plain object, never a model instance, so callers
 *      cannot accidentally .update()/.destroy() a read result — writes must go
 *      through the repository.
 *
 * Collation: when a predicate compares columns of different charsets/collations,
 * put the COLLATE / CONVERT() on the side whose index you do NOT need — see
 * COLLATION.md. Wrapping an indexed column makes that index unusable.
 */

const { Sequelize } = require('sequelize');

const { QueryTypes } = Sequelize;

const run = (db, sql, replacements, extra) => {
  if (!db || typeof db.query !== 'function') {
    return Promise.reject(new Error('query helper called without a Sequelize connection'));
  }
  return db.query(sql, {
    type: QueryTypes.SELECT,
    replacements: replacements || {},
    raw: true,
    logging: false,
    ...extra,
  });
};

/** Run a SELECT and return every row as a plain object. */
const selectAll = (db, sql, replacements) => run(db, sql, replacements);

/** Run a SELECT and return the first row or null. Add LIMIT 1 to the SQL yourself. */
const selectOne = async (db, sql, replacements) => {
  const row = await run(db, sql, replacements, { plain: true });
  return row || null;
};

/** Run a SELECT and return a single scalar from the first row (or `fallback`). */
const selectValue = async (db, sql, replacements, column, fallback = null) => {
  const row = await selectOne(db, sql, replacements);
  if (!row) return fallback;
  if (!column) {
    const keys = Object.keys(row);
    return keys.length ? row[keys[0]] : fallback;
  }
  return Object.prototype.hasOwnProperty.call(row, column) ? row[column] : fallback;
};

/** True when the query matches at least one row; stops at the first match. */
const exists = async (db, sql, replacements) => {
  const row = await selectOne(db, `SELECT EXISTS(${sql}) AS found`, replacements);
  return !!(row && Number(row.found) === 1);
};

/**
 * Allowlist a value that is spliced into SQL as an identifier (ORDER BY column,
 * table alias) rather than bound as a parameter — bind params can't be used for
 * these. Audit finding F7 (ORDER BY injection).
 */
const identifier = (value, allowed, fallback) => {
  const list = allowed instanceof Set ? allowed : new Set(allowed);
  return list.has(value) ? value : fallback;
};

const direction = (value) => (String(value).toUpperCase() === 'ASC' ? 'ASC' : 'DESC');

module.exports = { selectAll, selectOne, selectValue, exists, identifier, direction };
