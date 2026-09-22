'use strict';

/**
 * Per-organisation ("tenant") database connections.
 *
 * Each organisation has its own database whose credentials live in
 * db_business.organisation (org_host / org_db / org_usr / org_pass). We open a
 * pooled Sequelize instance per organisation on first use and cache it, evicting
 * connections idle beyond a TTL.
 *
 * This replaces the legacy helpers/dbConnectionCache.js, which depended on an
 * implicit global `helpers` that only existed because another module leaked it
 * (audit finding F4). Here the dependency is an explicit require, and there is
 * no `helpers is not defined` swallowed into a silent null.
 */

const { Sequelize } = require('sequelize');
const { env } = require('../config/env');
const { connections } = require('./index');
const q = require('./query');
const logger = require('../utils/logger');

const cache = new Map(); // orgId -> { sequelize, lastUsed }

/*
 * How long an unused tenant connection is kept, and how many are kept at once.
 *
 * Opening one of these costs a full TCP and MySQL handshake against the
 * customer's own database - around seven seconds through the tunnel used for
 * local work. At the original five-minute TTL, a customer who paused for five
 * minutes paid that again on their next click: the company list took 7.4s on
 * a page load for no reason other than a reopened connection.
 *
 * So the bound is now on COUNT rather than on a short clock. Idle connections
 * live half an hour, which covers a working session, and the cache holds at
 * most MAX_CACHED tenants - the least recently used is closed when a new one
 * would exceed that. Resource use stays capped however many customers are
 * active, without charging an active user a handshake mid-session.
 */
const DEFAULT_TTL_MS = Number(process.env.TENANT_IDLE_MS) || 30 * 60 * 1000;
const MAX_CACHED = Number(process.env.TENANT_MAX_CACHED) || 25;

/*
 * Recency counter for the LRU order, separate from the `lastUsed` clock the
 * TTL uses. Date.now() only resolves to the millisecond, so several requests
 * in the same tick carry identical timestamps and the "oldest" is then
 * whichever the sort happens to put first - it evicted a tenant that had just
 * been used. A counter always increases, so the order is exact.
 */
let useCounter = 0;

/** Close the least recently used tenants until the cache is within MAX_CACHED. */
const evictOverflow = async () => {
  if (cache.size <= MAX_CACHED) return;
  const byAge = [...cache.entries()].sort((a, b) => a[1].seq - b[1].seq);
  const doomed = byAge.slice(0, cache.size - MAX_CACHED);
  await Promise.all(
    doomed.map(async ([orgId, entry]) => {
      cache.delete(orgId);
      await entry.sequelize.close().catch(() => {});
      logger.info('evicted least recently used tenant connection', { orgId, cached: cache.size });
    })
  );
};

/** Load an organisation's connection credentials. Raw read from db_business. */
const loadCredentials = (orgId) =>
  q.selectOne(
    connections.business,
    `SELECT organisation_id, org_host, org_db, org_usr, org_pass
       FROM organisation
      WHERE organisation_id = :orgId
      LIMIT 1`,
    { orgId }
  );

/**
 * Get (or open and cache) a Sequelize connection for an organisation.
 * Returns null when the organisation is unknown or has no database configured.
 */
const getConnection = async (orgId) => {
  if (!orgId || Number(orgId) <= 0) return null;

  const cached = cache.get(orgId);
  if (cached) {
    cached.lastUsed = Date.now();
    cached.seq = ++useCounter;
    return cached.sequelize;
  }

  const org = await loadCredentials(orgId);
  if (!org || !org.org_db || !org.org_host) {
    logger.warn('tenant has no database configured', { orgId });
    return null;
  }

  const sequelize = new Sequelize(org.org_db, org.org_usr, org.org_pass, {
    host: org.org_host,
    // org_host stores a hostname only, so tenants share the main server's port.
    port: env.db.port,
    dialect: 'mysql',
    // min 1 and the main pool's idle time: a tenant connection costs the same
    // 2.5-5 s handshake as the main ones, and at min 0 / 10 s idle it was
    // reopened for almost every click on a customer.
    pool: { max: 5, min: 1, acquire: 30000, idle: env.db.pool.idle },
    logging: false,
  });

  try {
    await sequelize.authenticate();
  } catch (err) {
    logger.error('tenant connection failed', { orgId, error: err.message });
    await sequelize.close().catch(() => {});
    return null;
  }

  cache.set(orgId, { sequelize, lastUsed: Date.now(), seq: ++useCounter });
  // Bound the cache by count here, where it grows, rather than on the timer.
  await evictOverflow();
  return sequelize;
};

/** Close and drop connections idle longer than ttlMs. */
const evictIdle = async (ttlMs = DEFAULT_TTL_MS) => {
  const now = Date.now();
  await Promise.all(
    [...cache.entries()].map(async ([orgId, entry]) => {
      if (now - entry.lastUsed > ttlMs) {
        cache.delete(orgId);
        await entry.sequelize.close().catch(() => {});
        logger.info('evicted idle tenant connection', { orgId });
      }
    })
  );
};

/** Close every cached connection (shutdown). */
const closeAll = async () => {
  await Promise.all([...cache.values()].map((e) => e.sequelize.close().catch(() => {})));
  cache.clear();
};

/** Test-only: reset the cache without touching real connections. */
const _reset = () => cache.clear();

// Periodic eviction, disabled in tests.
let timer = null;
if (!env.isTest) {
  timer = setInterval(() => {
    evictIdle().catch((err) => logger.error('tenant eviction failed', { error: err.message }));
  }, 2 * 60 * 1000);
  timer.unref();
}

module.exports = { getConnection, evictIdle, closeAll, _reset };
