const express = require('express');
const request = require('supertest');
const { attachAuthUser } = require('../src/middleware/auth');
const researchRoutes = require('../src/routes/researchRoutes');

const app = express();
app.use(express.json());
app.use(attachAuthUser);
app.use('/api/research', researchRoutes);

test('PubMed gateway requires user authentication', async () => {
  await request(app)
    .post('/api/research/evidence/pubmed')
    .send({ query: 'metformin pancreatic cancer', limit: 1 })
    .expect(401);
});

test('ClinicalTrials.gov gateway requires user authentication', async () => {
  await request(app).post('/api/research/evidence/clinical-trials').send({ drug: 'metformin' }).expect(401);
});
