/**
 * Redis Session Store
 * ===================
 * Redis-backed session storage for improved scalability.
 */

const { redisClient } = require('../utils/redis');

class RedisSessionStore {
  constructor() {
    this.prefix = 'session:';
  }

  /**
   * Get session data
   * @param {string} sessionId - Session ID
   * @returns {object|null} Session data or null
   */
  async get(sessionId) {
    try {
      const key = `${this.prefix}${sessionId}`;
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis session get error:', error.message);
      return null;
    }
  }

  /**
   * Set session data
   * @param {string} sessionId - Session ID
   * @param {object} data - Session data
   * @param {number} ttl - Time to live in seconds (default: 24 hours)
   */
  async set(sessionId, data, ttl = 86400) {
    try {
      const key = `${this.prefix}${sessionId}`;
      const serializedData = JSON.stringify(data);
      await redisClient.setEx(key, ttl, serializedData);
    } catch (error) {
      console.error('Redis session set error:', error.message);
    }
  }

  /**
   * Delete session
   * @param {string} sessionId - Session ID
   */
  async delete(sessionId) {
    try {
      const key = `${this.prefix}${sessionId}`;
      await redisClient.del(key);
    } catch (error) {
      console.error('Redis session delete error:', error.message);
    }
  }

  /**
   * Check if session exists
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if session exists
   */
  async exists(sessionId) {
    try {
      const key = `${this.prefix}${sessionId}`;
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis session exists error:', error.message);
      return false;
    }
  }

  /**
   * Extend session TTL
   * @param {string} sessionId - Session ID
   * @param {number} ttl - New TTL in seconds
   */
  async extend(sessionId, ttl = 86400) {
    try {
      const key = `${this.prefix}${sessionId}`;
      await redisClient.expire(key, ttl);
    } catch (error) {
      console.error('Redis session extend error:', error.message);
    }
  }

  /**
   * Get all active sessions (for admin purposes)
   * @returns {Array} Array of session IDs
   */
  async getAllSessions() {
    try {
      const keys = await redisClient.keys(`${this.prefix}*`);
      return keys.map(key => key.replace(this.prefix, ''));
    } catch (error) {
      console.error('Redis get all sessions error:', error.message);
      return [];
    }
  }

  /**
   * Clean up expired sessions (Redis handles this automatically with TTL)
   */
  async cleanup() {
    // Redis automatically expires keys, so no manual cleanup needed
    console.log('✅ Redis session cleanup - handled automatically by TTL');
  }
}

// Export singleton instance
const sessionStore = new RedisSessionStore();

module.exports = sessionStore;