/**
 * Redis Configuration
 * ===================
 * Redis client setup for caching and session storage.
 */

const redis = require('redis');
const isTest = process.env.NODE_ENV === 'test';
let reportedUnavailable = false;

// Redis client configuration
const redisClient = redis.createClient({
  password: process.env.REDIS_PASSWORD || undefined,
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    reconnectStrategy: (retries) => {
      if (isTest) {
        return false;
      }
      // Cache is optional, but OTP endpoints explicitly reject requests while
      // Redis is unavailable. Stop retrying to avoid unbounded log spam.
      return retries >= 3 ? false : Math.min(retries * 250, 1000);
    }
  }
});

// Handle connection events
redisClient.on('error', (err) => {
  if (!reportedUnavailable) {
    reportedUnavailable = true;
    console.error('Redis unavailable; cache is degraded and OTP login is disabled:', err.message);
  }
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redisClient.on('ready', () => {
  reportedUnavailable = false;
  console.log('✅ Redis client ready');
});

redisClient.on('end', () => {
  console.log('❌ Redis connection ended');
});

// Connect to Redis
if (!isTest) {
  (async () => {
    try {
      await redisClient.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error.message);
      // Don't exit process, just log the error - app can still work without Redis
    }
  })();
}

// Cache helper functions
const cache = {
  /**
   * Set cache value with expiration
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   */
  async set(key, value, ttl = 3600) {
    if (!redisClient.isReady) {
      return;
    }
    try {
      const serializedValue = JSON.stringify(value);
      await redisClient.setEx(key, ttl, serializedValue);
    } catch (error) {
      console.error('Redis cache set error:', error.message);
    }
  },

  /**
   * Get cache value
   * @param {string} key - Cache key
   * @returns {any} Cached value or null
   */
  async get(key) {
    if (!redisClient.isReady) {
      return null;
    }
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis cache get error:', error.message);
      return null;
    }
  },

  /**
   * Delete cache key
   * @param {string} key - Cache key
   */
  async del(key) {
    if (!redisClient.isReady) {
      return;
    }
    try {
      await redisClient.del(key);
    } catch (error) {
      console.error('Redis cache delete error:', error.message);
    }
  },

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists
   */
  async exists(key) {
    if (!redisClient.isReady) {
      return false;
    }
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis cache exists error:', error.message);
      return false;
    }
  },

  /**
   * Set hash field
   * @param {string} key - Hash key
   * @param {string} field - Field name
   * @param {any} value - Field value
   */
  async hset(key, field, value) {
    if (!redisClient.isReady) {
      return;
    }
    try {
      const serializedValue = JSON.stringify(value);
      await redisClient.hSet(key, field, serializedValue);
    } catch (error) {
      console.error('Redis hash set error:', error.message);
    }
  },

  /**
   * Get hash field
   * @param {string} key - Hash key
   * @param {string} field - Field name
   * @returns {any} Field value or null
   */
  async hget(key, field) {
    if (!redisClient.isReady) {
      return null;
    }
    try {
      const value = await redisClient.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis hash get error:', error.message);
      return null;
    }
  },

  /**
   * Get all hash fields
   * @param {string} key - Hash key
   * @returns {object} Hash object or null
   */
  async hgetall(key) {
    if (!redisClient.isReady) {
      return null;
    }
    try {
      const hash = await redisClient.hGetAll(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      return result;
    } catch (error) {
      console.error('Redis hash getall error:', error.message);
      return null;
    }
  },

  /**
   * Delete hash field
   * @param {string} key - Hash key
   * @param {string} field - Field name
   */
  async hdel(key, field) {
    if (!redisClient.isReady) {
      return;
    }
    try {
      await redisClient.hDel(key, field);
    } catch (error) {
      console.error('Redis hash delete error:', error.message);
    }
  }
};

module.exports = {
  redisClient,
  cache
};
