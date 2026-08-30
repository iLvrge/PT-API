'use strict';

/**
 * Locating and reading the USPTO bulk XML unpacked on disk.
 *
 * The legacy version spawned `find` for every lookup. This walks the directory
 * itself: no child process, and a bounded search rather than one that scans the
 * whole tree even after it has a match.
 */

const fs = require('fs');
const path = require('path');
const { env } = require('../../config/env');

// Which tree a document lives in.
const APPLICATION = 1;
const GRANT = 2;

const rootFor = (type) => {
  const { mainFolder, extraDisk } = env.documents;
  if (type === APPLICATION) return path.join(extraDisk || '', 'applications');
  if (type === GRANT) return path.join(extraDisk || '', 'patent');
  return mainFolder || '';
};

/**
 * The first XML file whose name contains the document number.
 * @returns {Promise<string|null>} an absolute path, or null
 */
const findXmlFile = async (docNumber, type) => {
  const root = path.join(rootFor(type), 'XML');
  if (!docNumber || !root || !fs.existsSync(root)) return null;

  // Reject anything that could climb out of the tree; document numbers are
  // digits and letters only.
  if (!/^[A-Za-z0-9]+$/.test(String(docNumber))) return null;

  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_err) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.includes(docNumber) && entry.name.toUpperCase().endsWith('.XML')) {
        return full;
      }
    }
  }
  return null;
};

/**
 * Read a bulk XML file, trimmed to the document root.
 *
 * The files carry a DTD and sometimes several concatenated documents, so the
 * content is cut from the opening tag. The `PATDOC` variant also contains a
 * `<B500>` block whose children are opened and never closed, which no parser
 * accepts — it is removed.
 */
const readDocument = async (filePath, type) => {
  const raw = await fs.promises.readFile(filePath);
  const content = raw.toString();

  const roots = type === APPLICATION
    ? ['<us-patent-application', '<patent-application-publication']
    : ['<us-patent-grant', '<PATDOC'];

  for (const root of roots) {
    const start = content.indexOf(root);
    if (start === -1) continue;
    let xml = content.slice(start);
    if (root === '<PATDOC') {
      const open = xml.indexOf('<B500>');
      const close = xml.indexOf('</B500>');
      if (open !== -1 && close !== -1) xml = xml.slice(0, open) + xml.slice(close + '</B500>'.length);
    }
    return xml;
  }
  return '';
};

/** Read a cached EPO family document, or null when it is not cached. */
const readCachedFamily = async (reference) => {
  const dir = env.epo.cacheDir;
  if (!dir) return null;
  const file = path.join(dir, 'FAMILY', `${reference}.XML`);
  try {
    return await fs.promises.readFile(file, 'utf8');
  } catch (_err) {
    return null;
  }
};

/** Cache an EPO family document. Failure is not fatal — it is only a cache. */
const writeCachedFamily = async (reference, xml) => {
  const dir = env.epo.cacheDir;
  if (!dir) return;
  const folder = path.join(dir, 'FAMILY');
  try {
    await fs.promises.mkdir(folder, { recursive: true });
    await fs.promises.writeFile(path.join(folder, `${reference}.XML`), xml, 'utf8');
  } catch (_err) {
    // A read-only or missing cache directory must not fail the request.
  }
};

module.exports = {
  findXmlFile, readDocument, readCachedFamily, writeCachedFamily, APPLICATION, GRANT, rootFor,
};
