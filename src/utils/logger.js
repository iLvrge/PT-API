'use strict';

/**
 * Minimal structured logger. Emits JSON lines so a log shipper can parse them,
 * and stays silent in the test environment.
 *
 * Deliberately tiny — no winston, no transports config — because the audit
 * flagged 1,272 raw console.log calls and per-query SQL logging (F/P2). One
 * choke point makes it easy to swap in a real logger later.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;
const silent = process.env.NODE_ENV === 'test' && process.env.LOG_IN_TESTS !== 'true';

const emit = (level, message, meta) => {
  if (silent || LEVELS[level] > threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta && typeof meta === 'object' ? meta : meta !== undefined ? { meta } : {}),
  };
  const sink = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  sink.write(`${JSON.stringify(line)}\n`);
};

module.exports = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
};
