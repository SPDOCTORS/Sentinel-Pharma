const request = require('supertest');
const axios = require('axios');
const mongoose = require('mongoose');
const { redisClient } = require('../src/utils/redis');
const { otpStore } = require('../src/utils/otpStore');
const app = require('../src/index');

describe('production readiness dependencies', () => {
  let redisDescriptor;
  let mongooseDescriptor;
  let nodeEnv;

  beforeEach(() => {
    redisDescriptor = Object.getOwnPropertyDescriptor(redisClient, 'isReady');
    mongooseDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    nodeEnv = process.env.NODE_ENV;
    Object.defineProperty(redisClient, 'isReady', { configurable: true, value: false });
    Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, value: 1 });
    jest.spyOn(axios, 'get').mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (redisDescriptor) Object.defineProperty(redisClient, 'isReady', redisDescriptor);
    else delete redisClient.isReady;
    if (mongooseDescriptor) Object.defineProperty(mongoose.connection, 'readyState', mongooseDescriptor);
    else delete mongoose.connection.readyState;
    process.env.NODE_ENV = nodeEnv;
  });

  test('returns 503 when Redis is unavailable even if MongoDB and AI engine are healthy', async () => {
    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not-ready');
    expect(response.body.checks).toEqual(expect.objectContaining({
      mongodb: true,
      aiEngine: true,
      redis: false
    }));
  });

  test('allows local development readiness with the bounded OTP fallback', async () => {
    process.env.NODE_ENV = 'development';
    jest.spyOn(otpStore, 'getStatus').mockReturnValue({
      available: true,
      mode: 'memory',
      durable: false
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
    expect(response.body.checks).toEqual(expect.objectContaining({
      mongodb: true,
      aiEngine: true,
      redis: false,
      otp: true
    }));
    expect(response.body.details.otp).toEqual(expect.objectContaining({
      status: 'degraded',
      message: 'Challenge storage: memory'
    }));
  });
});
