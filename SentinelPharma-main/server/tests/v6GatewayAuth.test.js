const request = require('supertest');
const axios = require('axios');
const app = require('../src/index');
const { createToken } = require('../src/utils/authToken');

describe('V6 Gateway Authentication & Routing', () => {
  const token = createToken({
    sub: 'user-123',
    email: 'researcher@sentinelpharma.com',
    role: 'researcher'
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('GET /api/v6/status allows public unauthenticated requests', async () => {
    const axiosSpy = jest.spyOn(axios, 'request').mockResolvedValueOnce({
      status: 200,
      data: { ready: true, service: 'SentinelPharma-V6-Ranking-API' }
    });

    const res = await request(app).get('/api/v6/status');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(axiosSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('/api/v6/status'),
        headers: expect.objectContaining({
          'X-Internal-Service-Token': expect.any(String)
        })
      })
    );
  });

  test('POST /api/v6/repurpose rejects unauthenticated callers with 401', async () => {
    const axiosSpy = jest.spyOn(axios, 'request');
    const res = await request(app)
      .post('/api/v6/repurpose')
      .send({ disease: 'EFO:0000180' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Authentication required/i);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test('POST /api/v6/repurpose forwards authenticated requests with internal token', async () => {
    const axiosSpy = jest.spyOn(axios, 'request').mockResolvedValueOnce({
      status: 200,
      data: {
        success: true,
        candidates: [{ drugName: 'COBICISTAT', rankingScore: 0.5174 }]
      }
    });

    const res = await request(app)
      .post('/api/v6/repurpose')
      .set('Authorization', `Bearer ${token}`)
      .send({ disease: 'EFO:0000180', top_k: 5 });

    expect(res.status).toBe(200);
    expect(res.body.candidates[0].drugName).toBe('COBICISTAT');
    expect(axiosSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('/api/v6/repurpose'),
        method: 'POST',
        headers: expect.objectContaining({
          'X-Internal-Service-Token': expect.any(String)
        })
      })
    );
  });

  test('POST /api/v6/score-pair rejects unauthenticated callers with 401', async () => {
    const res = await request(app)
      .post('/api/v6/score-pair')
      .send({ drug: 'COBICISTAT', disease: 'EFO:0000180' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
