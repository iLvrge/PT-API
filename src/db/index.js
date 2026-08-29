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

const closeAll = async () => {
  await Promise.all(Object.values(connections).map((s) => s.close().catch(() => {})));
};

module.exports = { Sequelize, connections, ping, closeAll };
