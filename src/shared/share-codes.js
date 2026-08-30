'use strict';

/**
 * Allocation of the short public codes that back every share link.
 *
 * The legacy helper seeded cuid2 with Math.random, so the codes were
 * predictable enough to guess a neighbour's share link. These come from
 * crypto.randomBytes and are still checked for collisions before use.
 */

const crypto = require('crypto');
const { connections } = require('../db');
const q = require('../db/query');
const { env } = require('../config/env');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const RETRY_LIMIT = 50;

const generate = (length = env.share.codeLength) => {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
};

const exists = (code) =>
  q.exists(connections.applicationNew, `SELECT 1 FROM share WHERE code = :code`, { code });

/** A code no existing share row uses, or undefined after RETRY_LIMIT tries. */
const allocate = async () => {
  for (let i = 0; i < RETRY_LIMIT; i++) {
    const code = generate();
    if (!(await exists(code))) return code;
  }
  return undefined;
};

module.exports = { allocate, generate, exists, ALPHABET, RETRY_LIMIT };
