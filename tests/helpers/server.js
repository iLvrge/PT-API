'use strict';

/**
 * One listening server per test file.
 *
 * Passing an Express app straight to supertest makes it open a fresh ephemeral
 * server for EVERY request and close it again. Across a full run that is
 * thousands of listen/close cycles, and on a busy machine the OS eventually
 * recycles a port onto a different short-lived listener — so a request lands on
 * someone else's server and the test sees a response it never asked for.
 *
 * That was the cause of the intermittent failures in this suite: single tests
 * failing with a status the route cannot even produce (403 on a route with no
 * admin check, 400 on a valid sign-in), never reproducible in isolation, and
 * with no matching entry in the app's own request log.
 *
 * Handing supertest an already-listening server keeps one port open for the
 * whole file instead.
 *
 *   const app = startTestServer();   // then use request(app) as before
 */

const createApp = require('../../src/app');

/** Close a module's pooled connections, if it exposes closeAll and is not mocked. */
const closeQuietly = async (modulePath) => {
  let mod;
  try {
    mod = require(modulePath);
  } catch (_err) {
    return;
  }
  if (mod && typeof mod.closeAll === 'function') {
    await Promise.resolve(mod.closeAll()).catch(() => {});
  }
};

const startTestServer = () => {
  const server = createApp().listen(0);
  // Registered at module scope, which Jest evaluates during collection, so the
  // hook belongs to the file that called this.
  afterAll(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
    });
    // Requiring src/app pulls in src/db, which builds a Sequelize instance per
    // database. Nothing here queries them, but the pools keep the worker alive
    // past the end of the file.
    await closeQuietly('../../src/db');
    await closeQuietly('../../src/db/tenant-connections');
  });
  return server;
};

module.exports = { startTestServer };
