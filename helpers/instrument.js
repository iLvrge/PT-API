const Sentry = require("@sentry/node");

const parseRate = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const tracesSampleRate = parseRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1);
const profilesSampleRate = parseRate(process.env.SENTRY_PROFILES_SAMPLE_RATE, 0);

const integrations = [];
if (profilesSampleRate > 0) {
  try {
    // Lazy-require to avoid native module load failures on unsupported Node versions.
    const { nodeProfilingIntegration } = require("@sentry/profiling-node");
    integrations.push(nodeProfilingIntegration());
  } catch (err) {
    console.warn("Sentry profiling disabled:", err && err.message ? err.message : err);
  }
}

// Ensure to call this before requiring any other modules!
Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://9dbb99721e484a939592c18830855a52@o487723.ingest.us.sentry.io/5547034",
  integrations,
  // Tracing
  tracesSampleRate,
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate,
  debug: process.env.SENTRY_DEBUG === 'true',
});
