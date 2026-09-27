const express = require('express');
const request = require('supertest');
const { createToken } = require('../src/utils/authToken');
const { attachAuthUser, requireAuth, requireRole } = require('../src/middleware/auth');

const app = express();
app.use(attachAuthUser);
app.post('/mutation', requireAuth, requireRole('admin'), (_req, res) => res.status(204).end());

const bearer = (role) => `Bearer ${createToken({ sub: 'test-user', email: 'test@example.com', name: 'Test', role })}`;

describe('privileged model mutation authorization', () => {
  test('rejects unauthenticated callers', async () => {
    await request(app).post('/mutation').expect(401);
  });

  test('rejects authenticated non-admin callers', async () => {
    await request(app).post('/mutation').set('Authorization', bearer('researcher')).expect(403);
  });

  test('permits authenticated admins', async () => {
    await request(app).post('/mutation').set('Authorization', bearer('admin')).expect(204);
  });
});
