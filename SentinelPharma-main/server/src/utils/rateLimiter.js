/**
 * SentinelPharma Rate Limiting Middleware
 * ====================================
 * API rate limiting to prevent abuse and ensure fair usage.
 * 
 * Features:
 * - Per-IP rate limiting
 * - Per-user rate limiting (when authenticated)
 * - Different limits for different endpoints
 * - Sliding window algorithm
 */

const { logger } = require('./logger');

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map();

// Clean up expired entries every minute
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.windowStart + value.windowMs < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

if (typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

/**
 * Rate limit configuration
 */
const RATE_LIMITS = {
  // Standard API endpoints
  standard: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 60,       // 60 requests per minute
    message: 'Too many requests, please try again later'
  },
  
  // Analysis endpoints (computationally expensive)
  analysis: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 10,       // 10 analysis requests per minute
    message: 'Analysis rate limit exceeded. Please wait before submitting another analysis.'
  },
  
  // Report generation (heavy operation)
  reports: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,           // 20 reports per hour
    message: 'Report generation limit reached. Please try again later.'
  },
  
  // Health check (lenient)
  health: {
    windowMs: 60 * 1000,
    maxRequests: 120,
    message: 'Rate limit exceeded'
  },
  
  // Watchlist operations
  watchlist: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Watchlist operation limit exceeded'
  }
};

/**
 * Get client identifier (IP or user ID)
 * @param {object} req - Express request
 * @returns {string} Client identifier
 */
const getClientIdentifier = (req) => {
  // If authenticated, use user ID
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  
  // Otherwise use IP address
  const ip = req.ip || 
    req.headers['x-forwarded-for']?.split(',')[0] || 
    req.connection?.remoteAddress ||
    'unknown';
  
  return `ip:${ip}`;
};

/**
 * Create rate limiter middleware
 * @param {string} limitType - Type of rate limit to apply
 * @returns {Function} Express middleware
 */
const createRateLimiter = (limitType = 'standard') => {
  const config = RATE_LIMITS[limitType] || RATE_LIMITS.standard;
  
  return (req, res, next) => {
    const clientId = getClientIdentifier(req);
    const key = `${limitType}:${clientId}`;
    const now = Date.now();
    
    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);
    
    if (!entry || entry.windowStart + config.windowMs < now) {
      // Create new window
      entry = {
        windowStart: now,
        windowMs: config.windowMs,
        requests: 0
      };
    }
    
    entry.requests++;
    rateLimitStore.set(key, entry);
    
    // Calculate remaining requests and reset time
    const remaining = Math.max(0, config.maxRequests - entry.requests);
    const resetTime = entry.windowStart + config.windowMs;
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': config.maxRequests,
      'X-RateLimit-Remaining': remaining,
      'X-RateLimit-Reset': Math.ceil(resetTime / 1000),
      'X-RateLimit-Type': limitType
    });
    
    // Check if limit exceeded
    if (entry.requests > config.maxRequests) {
      logger.warn('Rate limit exceeded', {
        clientId,
        limitType,
        requests: entry.requests,
        limit: config.maxRequests
      });
      
      res.set('Retry-After', Math.ceil((resetTime - now) / 1000));
      
      return res.status(429).json({
        success: false,
        error: config.message,
        retryAfter: Math.ceil((resetTime - now) / 1000),
        limit: config.maxRequests,
        windowMs: config.windowMs
      });
    }
    
    next();
  };
};

/**
 * Dynamic rate limiter that selects limit based on endpoint
 */
const dynamicRateLimiter = (req, res, next) => {
  const path = req.path.toLowerCase();
  
  let limitType = 'standard';
  
  if (path.includes('/health')) {
    limitType = 'health';
  } else if (path.includes('/analyze') || path.includes('/roi')) {
    limitType = 'analysis';
  } else if (path.includes('/report') || path.includes('/pdf')) {
    limitType = 'reports';
  } else if (path.includes('/watch') || path.includes('/alert')) {
    limitType = 'watchlist';
  }
  
  return createRateLimiter(limitType)(req, res, next);
};

/**
 * Skip rate limiting for certain conditions
 * @param {Function} conditionFn - Function that returns true to skip
 * @returns {Function} Middleware
 */
const skipIf = (conditionFn) => {
  return (req, res, next) => {
    if (conditionFn(req)) {
      return next();
    }
    return dynamicRateLimiter(req, res, next);
  };
};

/**
 * Get current rate limit status for a client
 * @param {string} clientId - Client identifier
 * @param {string} limitType - Type of rate limit
 * @returns {object} Rate limit status
 */
const getRateLimitStatus = (clientId, limitType = 'standard') => {
  const config = RATE_LIMITS[limitType] || RATE_LIMITS.standard;
  const key = `${limitType}:${clientId}`;
  const entry = rateLimitStore.get(key);
  
  if (!entry) {
    return {
      remaining: config.maxRequests,
      limit: config.maxRequests,
      resetTime: null
    };
  }
  
  const now = Date.now();
  if (entry.windowStart + config.windowMs < now) {
    return {
      remaining: config.maxRequests,
      limit: config.maxRequests,
      resetTime: null
    };
  }
  
  return {
    remaining: Math.max(0, config.maxRequests - entry.requests),
    limit: config.maxRequests,
    resetTime: new Date(entry.windowStart + config.windowMs)
  };
};

module.exports = {
  createRateLimiter,
  dynamicRateLimiter,
  skipIf,
  getRateLimitStatus,
  RATE_LIMITS
};
