'use strict';

/**
 * Sequelize connection registry.
 *
 * One instance per main database, each with an explicit connection pool
 * (audit finding P1 — the live config had none, so Sequelize's default of
 * max:5 capped the whole API) and query logging off by default (P2).
 *
 * Tenant databases are not created here; they are opened on demand per
 * organisation and cached — see tenant-connections.js.
 */

const { Sequelize } = require('sequelize');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const common = {
  host: env.db.host,
  port: env.db.port,
  dialect: 'mysql',
  pool: env.db.pool,
  logging: env.db.logging ? (sql) => logger.debug('sql', { sql }) : false,
  define: { timestamps: false, freezeTableName: true },
};

const make = (dbName) => new Sequelize(dbName, env.db.user, env.db.password, common);

const connections = {
  application: make(env.db.names.application),
  applicationNew: make(env.db.names.applicationNew),
  business: make(env.db.names.business),
  resources: make(env.db.names.resources),
};

// Optional databases — only instantiate when configured.
if (env.db.names.maintainence) connections.maintainence = make(env.db.names.maintainence);
if (env.db.names.biblioGrant) connections.biblioGrant = make(env.db.names.biblioGrant);
if (env.db.names.biblioApplication) {
  connections.biblioApplication = make(env.db.names.biblioApplication);
}

/** Verify every configured connection can authenticate. Used by /health and boot. */
const ping = async () => {
  const results = {};
  await Promise.all(
    Object.entries(connections).map(async ([name, sequelize]) => {
      try {
        await sequelize.authenticate();
        results[name] = 'up';
      } catch (err) {
        results[name] = 'down';
        logger.error('db ping failed', { db: name, error: err.message });
      }
    })
  );
  return results;
};

/**
 * Open the pool's minimum connections up front, in the background.
 *
 * A pool opens connections lazily, and establishing one costs a full TCP and
 * MySQL handshake — around 2.5 seconds through the SSH tunnel used for local
 * work, and not free even beside the database. Lazily, that cost lands on
 * whichever request first needs a connection the pool has not opened yet, so
 * the opening clicks of a session each stall on one. Paying it at startup
 * instead makes those first requests as quick as the rest.
 *
 * `min` queries run at once per pool so the pool has to open `min` distinct
 * connections rather than reusing one. Failures are logged, never thrown: a
 * database that is slow or briefly down must not stop the process starting,
 * and /health already reports reachability.
 */
const warmUp = async () => {
  const min = Math.max(1, Number(env.db.pool && env.db.pool.min) || 1);
  await Promise.all(
    Object.entries(connections).map(async ([name, sequelize]) => {
      const started = Date.now();
      try {
        await Promise.all(
          Array.from({ length: min }, () => sequelize.query('SELECT 1', { logging: false }))
        );
        logger.info('db pool warmed', { db: name, connections: min, ms: Date.now() - started });
      } catch (err) {
        logger.error('db pool warm-up failed', { db: name, error: err.message });
      }
    })
  );
};

const closeAll = async () => {
  await Promise.all(Object.values(connections).map((s) => s.close().catch(() => {})));
};

module.exports = { Sequelize, connections, ping, warmUp, closeAll };
