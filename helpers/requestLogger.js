const RequestLog = require('../model/application/RequestLog'); // Adjust the path to where your model is

const DEFAULT_MAX_BYTES = 16 * 1024; // 16KB
const MAX_LOG_BYTES = Number(process.env.REQUEST_LOG_MAX_BYTES || DEFAULT_MAX_BYTES);

const safeStringify = (value) => {
    const seen = new WeakSet();
    return JSON.stringify(value, (key, val) => {
        if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) return '[Circular]';
            seen.add(val);
        }
        return val;
    });
};

const sanitizeForLog = (value) => {
    if (value === undefined || value === null) return value;
    if (Buffer.isBuffer(value)) {
        const slice = value.subarray(0, MAX_LOG_BYTES);
        return slice.toString('utf8') + (value.length > MAX_LOG_BYTES ? '...[truncated]' : '');
    }
    if (typeof value === 'string') {
        return value.length > MAX_LOG_BYTES ? value.slice(0, MAX_LOG_BYTES) + '...[truncated]' : value;
    }

    try {
        const json = safeStringify(value);
        if (json.length <= MAX_LOG_BYTES) return value;
        return json.slice(0, MAX_LOG_BYTES) + '...[truncated]';
    } catch (error) {
        return `[unserializable: ${error.message}]`;
    }
};

// Middleware to log request and response
async function requestLogger(req, res, next) {
    const start = Date.now();

    // Capture the original `send` method to log the response
    const originalSend = res.send;

    res.send = function (body) {
        const duration = Date.now() - start;

        // Log the request and response data to the database without blocking the response
        setImmediate(() => {
            try {
                RequestLog.create({
                    method: req.method,
                    url: req.originalUrl,
                    body: sanitizeForLog(req.body),
                    headers: sanitizeForLog(req.headers),
                    status: res.statusCode,
                    responseBody: sanitizeForLog(body),
                    duration: `${duration}ms`,
                    timestamp: new Date(),
                }).catch((error) => {
                    console.error('Failed to log request:', error);
                });
            } catch (error) {
                console.error('Failed to log request:', error);
            }
        });

        // Continue with the original `send` method
        return originalSend.apply(res, arguments);
    };

    next();
}

module.exports = requestLogger;
