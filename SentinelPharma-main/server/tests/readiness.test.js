const request = require('supertest');
const axios = require('axios');
const mongoose = require('mongoose');
const { redisClient } = require('../src/utils/redis');
const app = require('../src/index');

describe('production readiness dependencies', () => {
  let redisDescriptor;
  let mongooseDescriptor;

  beforeEach(() => {
    redisDescriptor = Object.getOwnPropertyDescriptor(redisClient, 'isReady');
    mongooseDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
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
});
