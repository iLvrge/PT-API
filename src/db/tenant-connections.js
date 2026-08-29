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
const DEFAULT_TTL_MS = 5 * 60 * 1000;

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
    return cached.sequelize;
  }

  const org = await loadCredentials(orgId);
  if (!org || !org.org_db || !org.org_host) {
    logger.warn('tenant has no database configured', { orgId });
    return null;
  }

  const sequelize = new Sequelize(org.org_db, org.org_usr, org.org_pass, {
    host: org.org_host,
    dialect: 'mysql',
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
    logging: false,
  });

  try {
    await sequelize.authenticate();
  } catch (err) {
    logger.error('tenant connection failed', { orgId, error: err.message });
    await sequelize.close().catch(() => {});
    return null;
  }

  cache.set(orgId, { sequelize, lastUsed: Date.now() });
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
