jest.mock('../src/utils/loadBalancer', () => ({ request: jest.fn() }));

const loadBalancer = require('../src/utils/loadBalancer');
const {
  analyzeCompound,
  searchPubMedEvidence,
  searchClinicalTrialsEvidence,
  experimentalCandidates,
  experimentalCandidateDetail,
  experimentalKnownIndications,
  experimentalEvidence
} = require('../src/services/aiEngineService');

test('uses the canonical FastAPI analysis endpoint and forwards mode in the body', async () => {
  loadBalancer.request.mockResolvedValue({ data: { agents_executed: [] } });

  await analyzeCompound({ molecule: 'Aspirin', mode: 'secure', requestId: 'request-1', agents: ['clinical'] });

  expect(loadBalancer.request).toHaveBeenCalledWith('/api/analyze', expect.objectContaining({
    method: 'POST',
    data: expect.objectContaining({ molecule: 'Aspirin', mode: 'secure', request_id: 'request-1' })
  }));
});

test('forwards the browser live-evidence disease and preserves source-backed results', async () => {
  const sourceBacked = {
    researchMode: 'live',
    dataMode: 'SOURCE_BACKED',
    verificationStatus: 'VERIFIED_SOURCE',
    degraded: false,
    sourceResults: {
      pubmed: { dataMode: 'SOURCE_BACKED', count: 10 },
      clinicalTrials: { dataMode: 'SOURCE_BACKED', count: 10 }
    },
    citations: [{
      sourceId: '123',
      sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/123/',
      retrievedAt: '2026-10-03T00:00:00Z',
      dataMode: 'SOURCE_BACKED',
      verificationStatus: 'VERIFIED_SOURCE'
    }]
  };
  loadBalancer.request.mockResolvedValue({ data: sourceBacked });

  const result = await analyzeCompound({
    molecule: 'Metformin',
    disease: 'Type 2 Diabetes',
    researchMode: 'live',
    mode: 'cloud',
    provider: 'gemini',
    requestId: 'browser-request-1'
  });

  expect(loadBalancer.request).toHaveBeenCalledWith('/api/analyze', expect.objectContaining({
    method: 'POST',
    data: expect.objectContaining({
      molecule: 'Metformin',
      disease: 'Type 2 Diabetes',
      research_mode: 'live',
      mode: 'cloud',
      provider: 'gemini',
      request_id: 'browser-request-1'
    })
  }));
  expect(result).toEqual(sourceBacked);
  expect(result.sourceResults.pubmed.dataMode).toBe('SOURCE_BACKED');
  expect(result.sourceResults.clinicalTrials.dataMode).toBe('SOURCE_BACKED');
});

test('uses the internal source-backed PubMed endpoint', async () => {
  loadBalancer.request.mockResolvedValue({ data: { success: true, evidence: [] } });
  await searchPubMedEvidence({ query: 'metformin pancreatic cancer', limit: 1 });
  expect(loadBalancer.request).toHaveBeenCalledWith('/api/evidence/pubmed/search', expect.objectContaining({
    method: 'POST', data: { query: 'metformin pancreatic cancer', limit: 1 }
  }));
});

test('uses the internal ClinicalTrials.gov endpoint', async () => {
  loadBalancer.request.mockResolvedValue({ data: { success: true, evidence: [] } });
  await searchClinicalTrialsEvidence({ drug: 'metformin', condition: 'pancreatic cancer', limit: 1 });
  expect(loadBalancer.request).toHaveBeenCalledWith('/api/evidence/clinical-trials/search', expect.objectContaining({
    method: 'POST', data: expect.objectContaining({ drug: 'metformin', condition: 'pancreatic cancer', limit: 1 })
  }));
});

test('proxies experimental repurposing with the internal credential server-side', async () => {
  process.env.INTERNAL_SERVICE_TOKEN = 'test-internal-service-token';
  loadBalancer.request.mockResolvedValue({ data: { candidateCount: 10 } });

  await experimentalCandidates({ drugId: 'CHEMBL:CHEMBL1000', topK: 10 });
  await experimentalCandidateDetail({ drugId: 'CHEMBL:CHEMBL1000', diseaseId: 'EFO:0003102' });
  await experimentalKnownIndications({ drugId: 'CHEMBL:CHEMBL1000' });
  await experimentalEvidence({ drugId: 'CHEMBL:CHEMBL1000', diseaseId: 'EFO:0003102' });

  expect(loadBalancer.request).toHaveBeenCalledWith(
    '/api/experimental/repurposing/drugs/CHEMBL%3ACHEMBL1000/candidates',
    expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'X-Internal-Service-Token': expect.any(String) }) })
  );
  expect(loadBalancer.request).toHaveBeenCalledWith(
    '/api/experimental/repurposing/evidence',
    expect.objectContaining({ method: 'POST', data: { drug_id: 'CHEMBL:CHEMBL1000', disease_id: 'EFO:0003102' } })
  );
  delete process.env.INTERNAL_SERVICE_TOKEN;
});
