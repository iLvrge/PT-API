'use strict';

/**
 * Health logic. The route and controller stay free of any knowledge of the DB
 * layer; the service is the only place that calls into it (db.ping()).
 */

const { ping } = require('../../db');

const getLiveness = () => ({ status: 'ok', uptime: process.uptime() });

const getReadiness = async () => {
  const databases = await ping();
  const ready = Object.values(databases).every((state) => state === 'up');
  return { ready, status: ready ? 'ready' : 'degraded', databases };
};

module.exports = { getLiveness, getReadiness };
