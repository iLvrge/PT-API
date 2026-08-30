'use strict';

/**
 * Reading the JSON the name-normalisation scripts leave on disk.
 *
 * The legacy routes joined the caller's `fileName` straight onto
 * /var/www/html/script/, so `?fileName=../../../../etc/passwd` read whatever
 * the API process could read. Here the name is reduced to its basename, has to
 * look like one of the files those scripts actually write, and the resolved
 * path is checked to still be inside the directory.
 */

const fs = require('fs');
const path = require('path');
const { env } = require('../../config/env');
const ApiError = require('../../utils/api-error');

// normalizeNames_<org>[_<portfolios>]_file.json
const ENTITY_FILE = /^normalizeNames_[A-Za-z0-9_]+\.json$/;

const scriptDir = () => env.scripts.path;

/**
 * Resolve a file the normalisation scripts produced.
 * @throws {ApiError} 400 when the name is not one of theirs
 */
const resolveEntityFile = (fileName) => {
  const base = path.basename(String(fileName || ''));
  if (!ENTITY_FILE.test(base)) throw ApiError.badRequest('Unknown entity file');

  const dir = scriptDir();
  if (!dir) throw ApiError.internal('The script directory is not configured');

  const full = path.resolve(dir, base);
  // basename already prevents traversal; this catches a symlinked directory.
  if (!full.startsWith(path.resolve(dir) + path.sep)) {
    throw ApiError.badRequest('Unknown entity file');
  }
  return full;
};

/** The parsed contents, or [] when the script has not produced it yet. */
const readEntityFile = async (fileName) => {
  const full = resolveEntityFile(fileName);
  try {
    const raw = await fs.promises.readFile(full, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch (_err) {
    return [];
  }
};

/** The file one normalisation run writes, given its inputs. */
const entityFileName = ({ organisationId, type, portfolios }) => {
  const suffix = Number(type) === 1 && portfolios.length ? `${portfolios.join('')}_file` : 'file';
  return `normalizeNames_${organisationId}_${suffix}.json`;
};

module.exports = { readEntityFile, resolveEntityFile, entityFileName, ENTITY_FILE };
