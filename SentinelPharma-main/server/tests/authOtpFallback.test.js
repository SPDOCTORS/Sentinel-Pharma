const request = require('supertest');
const express = require('express');

process.env.NODE_ENV = 'development';
process.env.AUTH_OTP_MEMORY_FALLBACK = 'true';
process.env.AUTH_EXPOSE_OTP_PREVIEW = 'true';

jest.mock('../src/utils/redis', () => ({
  redisClient: { isReady: false },
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('../src/models', () => {
  const User = jest.fn().mockImplementation((profile) => ({
    _id: 'development-user-id',
    ...profile,
    save: jest.fn().mockResolvedValue(undefined)
  }));
  User.findOne = jest.fn().mockResolvedValue(null);
  User.findById = jest.fn().mockResolvedValue(null);
  return { User, ResearchReport: {}, Watchlist: {} };
});

const authRoutes = require('../src/routes/authRoutes');
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('development OTP fallback', () => {
  test('completes request and verification without Redis', async () => {
    const requestResponse = await request(app)
      .post('/api/auth/request-otp')
      .send({
        channel: 'email',
        purpose: 'signup',
        email: 'researcher@example.com',
        name: 'Researcher'
      });

    expect(requestResponse.status).toBe(200);
    expect(requestResponse.body.success).toBe(true);
    expect(requestResponse.body.delivery).toEqual(expect.objectContaining({
      channel: 'email',
      storage: 'memory-ttl'
    }));
    expect(requestResponse.body.otpPreview).toMatch(/^\d{6}$/);

    const verifyResponse = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        channel: 'email',
        purpose: 'signup',
        email: 'researcher@example.com',
        name: 'Researcher',
        otp: requestResponse.body.otpPreview
      });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.success).toBe(true);
    expect(verifyResponse.body.token).toEqual(expect.any(String));
    expect(verifyResponse.body.user).toEqual(expect.objectContaining({
      email: 'researcher@example.com',
      name: 'Researcher',
      role: 'researcher'
    }));
  });
});
