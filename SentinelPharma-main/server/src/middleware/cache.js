/**
 * Response Caching Middleware
 * ===========================
 * Redis-based caching for API responses to improve performance.
 */

const { cache } = require('../utils/redis');

/**
 * Generate cache key from request
 * @param {object} req - Express request object
 * @returns {string} Cache key
 */
function generateCacheKey(req) {
  const keyParts = [
    req.method,
    req.originalUrl,
    req.user?.id || 'anonymous',
    req.query ? JSON.stringify(req.query) : '',
    req.body ? JSON.stringify(req.body) : ''
  ];

  return `api:${keyParts.join(':')}`;
}

/**
 * Response caching middleware
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
 */
function cacheMiddleware(ttl = 300) {
  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching for auth endpoints
    if (req.path.startsWith('/auth')) {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    try {
      // Try to get cached response
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        console.log(`📋 Cache hit for ${req.method} ${req.originalUrl}`);
        return res.json(cachedResponse);
      }

      // Store original json method
      const originalJson = res.json;

      // Override json method to cache response
      res.json = function(data) {
        // Cache the response
        cache.set(cacheKey, data, ttl).catch(err => {
          console.error('Failed to cache response:', err.message);
        });

        console.log(`💾 Cached response for ${req.method} ${req.originalUrl} (${ttl}s)`);

        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error.message);
      // Continue without caching on error
      next();
    }
  };
}

/**
 * Clear cache for specific patterns
 * @param {string} pattern - Cache key pattern to clear
 */
async function clearCache(pattern) {
  try {
    // Note: This is a simplified implementation
    // In production, you might want to use Redis SCAN or KEYS
    console.log(`🗑️ Cache clear requested for pattern: ${pattern}`);
    // For now, we'll rely on TTL expiration
    // TODO: Implement proper cache invalidation
  } catch (error) {
    console.error('Cache clear error:', error.message);
  }
}

/**
 * Cache invalidation middleware for mutations
 */
function invalidateCacheMiddleware() {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json;

    // Override json method to clear related caches
    res.json = function(data) {
      // Clear caches related to this request
      const baseKey = `api:GET:${req.baseUrl}`;
      clearCache(`${baseKey}*`).catch(err => {
        console.error('Failed to invalidate cache:', err.message);
      });

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
}

module.exports = {
  cacheMiddleware,
  invalidateCacheMiddleware,
  clearCache
};