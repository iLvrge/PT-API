const microsoftTokenMiddleware = (req, res, next) => {
    // Extract tokens from headers
    const accessToken = req.headers['x-microsoft-auth-token'];
    const refreshToken = req.headers['x-microsoft-refresh-token'];
  
    // Check if tokens are present
    if (!accessToken) {
      return res.status(401).json({ error: 'Access token missing' });
    }
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token missing' });
    }
  
    // Add tokens to the request object
    req.microsoftTokens = {
      accessToken,
      refreshToken,
    };
  
    // Call the next middleware or route handler
    next();
};
module.exports = microsoftTokenMiddleware;  