/**
 * pm2 process definition for the PatenTrack API.
 *
 *   pm2 start deploy/ecosystem.config.js --env production
 *   pm2 reload patentrack-api          # zero downtime
 *   pm2 save && pm2 startup            # survive a reboot
 *
 * Cluster mode, not fork: the API is CPU-bound on JSON serialisation for the
 * larger payloads and would otherwise use one core. src/server.js already
 * handles SIGTERM by closing the HTTP server, draining both connection pools
 * and flushing Sentry, so `pm2 reload` drains rather than kills.
 */

module.exports = {
  apps: [
    {
      name: 'patentrack-api',
      script: 'src/server.js',
      cwd: '/srv/patentrack/api',

      /*
       * One worker per core, but each worker opens its own connection pool — so
       * instances × DB_POOL_MAX must stay under the server's max_connections.
       * Check it before raising this:  SHOW VARIABLES LIKE 'max_connections';
       * At 4 instances × DB_POOL_MAX 20 × 7 pools that is already 560.
       */
      instances: 2,
      exec_mode: 'cluster',

      // Wait for the app to say it is listening before counting it up.
      wait_ready: false,
      listen_timeout: 20000,

      /*
       * Long enough for the pools to drain. The app's own shutdown closes the
       * server, both pools and Sentry; killing it sooner drops in-flight
       * requests and leaves MySQL threads to time out.
       */
      kill_timeout: 15000,

      max_memory_restart: '1G',
      autorestart: true,
      // A crash loop should be visible, not silently retried forever.
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 2000,

      // The app writes structured JSON lines; keep them intact for the shipper.
      out_file: '/var/log/patentrack/api-out.log',
      error_file: '/var/log/patentrack/api-error.log',
      merge_logs: true,
      time: false, // the app already stamps every line with `ts`

      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
