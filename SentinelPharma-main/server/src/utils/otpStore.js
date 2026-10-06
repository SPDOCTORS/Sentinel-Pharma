/**
 * OTP challenge storage.
 *
 * Redis remains mandatory in production. Local development can use a
 * process-local, TTL-enforced fallback so a missing Redis installation does
 * not block the OTP sign-in workflow.
 */

const { redisClient } = require('./redis');

class OtpStore {
  constructor({ client, allowMemoryFallback = false, now = () => Date.now() }) {
    this.client = client;
    this.allowMemoryFallback = allowMemoryFallback;
    this.now = now;
    this.memory = new Map();
  }

  getStatus() {
    if (this.client.isReady) {
      return { available: true, mode: 'redis', durable: true };
    }
    if (this.allowMemoryFallback) {
      return { available: true, mode: 'memory', durable: false };
    }
    return { available: false, mode: 'unavailable', durable: false };
  }

  setMemory(key, value, ttlSeconds) {
    this.memory.set(key, {
      value: JSON.parse(JSON.stringify(value)),
      expiresAt: this.now() + (ttlSeconds * 1000)
    });
  }

  getMemory(key) {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(JSON.stringify(entry.value));
  }

  async set(key, value, ttlSeconds) {
    if (this.client.isReady) {
      try {
        await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
        return 'redis';
      } catch (error) {
        if (!this.allowMemoryFallback) throw error;
      }
    }

    if (!this.allowMemoryFallback) {
      throw new Error('Redis is required for OTP storage but is not connected');
    }

    this.setMemory(key, value, ttlSeconds);
    return 'memory';
  }

  async get(key) {
    if (this.client.isReady) {
      try {
        const value = await this.client.get(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        if (!this.allowMemoryFallback) throw error;
      }
    }

    if (!this.allowMemoryFallback) {
      throw new Error('Redis is required for OTP storage but is not connected');
    }
    return this.getMemory(key);
  }

  async delete(key) {
    this.memory.delete(key);
    if (this.client.isReady) {
      await this.client.del(key);
    }
  }
}

const allowMemoryFallback = process.env.NODE_ENV === 'development'
  && process.env.AUTH_OTP_MEMORY_FALLBACK !== 'false';

const otpStore = new OtpStore({
  client: redisClient,
  allowMemoryFallback
});

module.exports = {
  OtpStore,
  otpStore
};
