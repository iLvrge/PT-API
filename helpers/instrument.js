const Sentry = require("@sentry/node");
const packageJson = require("../package.json");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: `${packageJson.name}@${packageJson.version}`,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 1.0,
  debug: process.env.NODE_ENV !== "production",
});