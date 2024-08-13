const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

// Ensure to call this before requiring any other modules!
Sentry.init({
  dsn: "https://9dbb99721e484a939592c18830855a52@o487723.ingest.us.sentry.io/5547034",
  /* integrations: [
    // Add our Profiling integration
    nodeProfilingIntegration(),
  ],  */

  // Add Tracing by setting tracesSampleRate
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,

  // Set sampling rate for profiling
  // This is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});
