/**
 * Tests for SentinelPharma Server
 */
const request = require('supertest');
const app = require('../src/index');

describe('Health Check', () => {
  test('GET /health should return healthy status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('service', 'sentinelpharma-server');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(typeof response.body.uptime).toBe('number');
  });
});

describe('API Root', () => {
  test('GET /api should return API info', async () => {
    const response = await request(app).get('/api');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('SentinelPharma');
  });
});