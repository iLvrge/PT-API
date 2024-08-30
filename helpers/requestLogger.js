const RequestLog = require('../model/application/RequestLog'); // Adjust the path to where your model is

// Middleware to log request and response
async function requestLogger(req, res, next) {
    const start = Date.now();

    // Capture the original `send` method to log the response
    const originalSend = res.send;

    res.send = async function (body) {
        const duration = Date.now() - start;

        // Log the request and response data to the database
        try {
            await RequestLog.create({
                method: req.method,
                url: req.originalUrl,
                body: req.body,
                headers: req.headers,
                status: res.statusCode,
                responseBody: body,
                duration: `${duration}ms`,
                timestamp: new Date(),
            });
        } catch (error) {
            console.error('Failed to log request:', error);
        }

        // Continue with the original `send` method
        return originalSend.apply(res, arguments);
    };

    next();
}

module.exports = requestLogger;
