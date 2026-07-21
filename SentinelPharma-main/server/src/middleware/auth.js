const { verifyToken } = require('../utils/authToken');
const { cache } = require('../utils/redis');
const { authFailuresTotal } = require('../utils/metrics');

// In-memory fallback for revoked tokens (in case Redis is down)
const revokedTokens = new Set();

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
};

const attachAuthUser = async (req, _res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return next();
  }

  try {
    // Check if token is revoked in Redis
    const isRevoked = await cache.get(`revoked_token:${token}`);
    if (isRevoked || revokedTokens.has(token)) {
      authFailuresTotal.labels('revoked').inc();
      return next();
    }

    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      mobile: payload.mobile || '',
      name: payload.name,
      role: payload.role || 'researcher'
    };
    req.authToken = token;
  } catch (_err) {
    authFailuresTotal.labels('invalid_token').inc();
    req.user = null;
  }

  return next();
};

const requireAuth = (req, res, next) => {
  if (!req.user?.id) {
    authFailuresTotal.labels('missing_auth').inc();
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  return next();
};

const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user?.id) {
    authFailuresTotal.labels('missing_auth').inc();
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const allowedRoles = new Set(roles.filter(Boolean));
  if (!allowedRoles.has(req.user.role)) {
    authFailuresTotal.labels('insufficient_role').inc();
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions'
    });
  }

  return next();
};

const revokeToken = async (token) => {
  if (token) {
    // Store in Redis with 24 hour TTL (same as token expiration)
    await cache.set(`revoked_token:${token}`, true, 86400);
    // Also store in memory as fallback
    revokedTokens.add(token);
  }
};

module.exports = {
  attachAuthUser,
  requireAuth,
  requireRoles,
  revokeToken,
  getTokenFromRequest
};
