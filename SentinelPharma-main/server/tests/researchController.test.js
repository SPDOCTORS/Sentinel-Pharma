jest.mock('../src/services/aiEngineService', () => ({
  analyzeCompound: jest.fn(),
  discoverRepurposingCandidates: jest.fn()
}));

jest.mock('../src/models', () => ({
  ResearchReport: {
    findOneAndUpdate: jest.fn()
  }
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  auditLog: {
    researchStarted: jest.fn(),
    processingMode: jest.fn(),
    agentActivity: jest.fn(),
    apiResponse: jest.fn()
  }
}));

const aiEngineService = require('../src/services/aiEngineService');
const { ResearchReport } = require('../src/models');
const { processResearch } = require('../src/controllers/researchController');
const { discoverRepurposingCandidates } = require('../src/controllers/researchController');

const responseDouble = () => {
  const response = { status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  return response;
};

test('returns the FastAPI model identifier after a successful analysis', async () => {
  aiEngineService.analyzeCompound.mockResolvedValue({
    model_used: 'gemini-runtime-model',
    agents_executed: [],
    knowledge_graph: { key_pathways: [] },
    dataMode: 'DEMO_SYNTHETIC',
    verificationStatus: 'DEMO_ONLY',
    evidenceContractVersion: '1.0',
    citations: [
      { claim: 'Missing retrieval metadata', dataMode: 'SOURCE_BACKED', sourceId: 'bad' },
      {
        claim: 'Traceable paper', dataMode: 'SOURCE_BACKED', verificationStatus: 'VERIFIED_SOURCE',
        sourceId: '123', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/123/', retrievedAt: '2026-01-01T00:00:00Z'
      },
      { claim: 'Model output is not a citation', dataMode: 'MODEL_PREDICTION' }
    ]
  });
  ResearchReport.findOneAndUpdate.mockResolvedValue({});
  const response = responseDouble();

  await processResearch({
    body: { molecule: 'Aspirin', mode: 'cloud', researchMode: 'demo' },
    user: { id: 'test-user' }
  }, response);

  expect(response.status).toHaveBeenCalledWith(200);
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    modelUsed: 'gemini-runtime-model',
    evidenceContractVersion: '1.0',
    dataMode: 'DEMO_SYNTHETIC',
    verificationStatus: 'DEMO_ONLY'
  }));
  const payload = response.json.mock.calls[0][0];
  expect(payload.results.citations).toHaveLength(1);
  expect(payload.results.recommendation_dossier[0]).toEqual(expect.objectContaining({
    dataMode: 'DEMO_SYNTHETIC', verificationStatus: 'DEMO_ONLY', evidenceContractVersion: '1.0'
  }));
  expect(ResearchReport.findOneAndUpdate).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ modelUsed: 'gemini-runtime-model' }),
    expect.any(Object)
  );
});

test('live evidence remains source-backed without synthetic dossier or benchmark', async () => {
  aiEngineService.analyzeCompound.mockResolvedValue({
    researchMode: 'live', dataMode: 'SOURCE_BACKED', verificationStatus: 'VERIFIED_SOURCE',
    sourceResults: { pubmed: { dataMode: 'SOURCE_BACKED', count: 1 } },
    modelPrediction: { dataMode: 'MODEL_PREDICTION', candidates: [] },
    shadowModelPrediction: {
      dataMode: 'MODEL_PREDICTION', verificationStatus: 'MODEL_INFERENCE', shadow: true, primary: false,
      candidates: [{ rank: 1, drug: 'Shadow candidate', score: 0.7 }]
    },
    knowledge_graph: {
      dataMode: 'SOURCE_BACKED', verificationStatus: 'VERIFIED_SOURCE', graphDatasetVersion: 'biomedical_graph_v5',
      nodes: [{ id: 'drug', type: 'DRUG', provenance: [{ source: 'ChEMBL' }] }],
      edges: [{ source: 'drug', target: 'target', type: 'DRUG_TARGET', provenance: [{ source: 'ChEMBL' }] }]
    },
    citations: [{ sourceId: '123', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/123/',
      retrievedAt: '2026-01-01T00:00:00Z', dataMode: 'SOURCE_BACKED', verificationStatus: 'VERIFIED_SOURCE' }],
    summary: { overallAssessment: 'One retrieved record.' }
  });
  ResearchReport.findOneAndUpdate.mockResolvedValue({});
  const response = responseDouble();
  await processResearch({ body: { molecule: 'Metformin', disease: 'Type 2 Diabetes', mode: 'cloud', researchMode: 'live' }, user: { id: 'test-user' } }, response);
  expect(response.status).toHaveBeenCalledWith(200);
  const payload = response.json.mock.calls[0][0];
  expect(payload.results.sourceResults.pubmed.count).toBe(1);
  expect(payload.results.modelPrediction.dataMode).toBe('MODEL_PREDICTION');
  expect(payload.results.shadowModelPrediction).toEqual(expect.objectContaining({
    dataMode: 'MODEL_PREDICTION', shadow: true, primary: false
  }));
  expect(payload.results.knowledge_graph).toEqual(expect.objectContaining({
    dataMode: 'SOURCE_BACKED', graphDatasetVersion: 'biomedical_graph_v5'
  }));
  expect(ResearchReport.findOneAndUpdate).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      knowledgeGraph: expect.objectContaining({ nodes: 1, edges: 1 })
    }),
    expect.any(Object)
  );
  expect(payload.results.citations).toHaveLength(1);
  expect(payload.results.recommendation_dossier).toBeUndefined();
  expect(payload.results.benchmarking).toBeUndefined();
});

test('live report save failure is explicit', async () => {
  aiEngineService.analyzeCompound.mockResolvedValue({ researchMode: 'live', dataMode: 'UNAVAILABLE', verificationStatus: 'NOT_AVAILABLE', citations: [] });
  ResearchReport.findOneAndUpdate.mockRejectedValue(new Error('storage unavailable'));
  const response = responseDouble();
  await processResearch({ body: { molecule: 'Metformin', mode: 'cloud', researchMode: 'live' }, user: { id: 'test-user' } }, response);
  expect(response.status).toHaveBeenCalledWith(503);
  expect(response.json.mock.calls[0][0].unavailableReason.code).toBe('REPORT_PERSISTENCE_UNAVAILABLE');
});

test('candidate structures fail closed unless the drug-target PDB mapping is verified and traceable', async () => {
  aiEngineService.discoverRepurposingCandidates.mockResolvedValue({
    disease: 'Test disease',
    model: 'test-model',
    candidates: [
      { drug: 'Bare ID', target: 'TARGET1', score: 0.8, interaction: { pdbId: '1HSG' } },
      {
        drug: 'Verified drug', target: 'TARGET2', score: 0.7,
        interaction: {
          pdbId: '4ABC', drug: 'Verified drug', target: 'TARGET2', dataMode: 'SOURCE_BACKED',
          verificationStatus: 'VERIFIED_SOURCE', mappingStatus: 'VERIFIED', mappingMethod: 'VERIFIED_DRUG_TARGET_COMPLEX',
          provenance: { source: 'RCSB PDB', sourceRecordId: '4ABC', sourceUrl: 'https://www.rcsb.org/structure/4ABC', retrievedAt: '2026-10-05T00:00:00Z' }
        }
      }
    ]
  });
  const response = responseDouble();

  await discoverRepurposingCandidates({ body: { disease: 'Test disease', topK: 2 } }, response);

  const candidates = response.json.mock.calls[0][0].candidates;
  expect(candidates[0].interaction).toEqual(expect.objectContaining({ dataMode: 'UNAVAILABLE', verificationStatus: 'NOT_AVAILABLE' }));
  expect(candidates[0].interaction.pdbId).toBeUndefined();
  expect(candidates[1].interaction).toEqual(expect.objectContaining({ pdbId: '4ABC', dataMode: 'SOURCE_BACKED', verificationStatus: 'VERIFIED_SOURCE' }));
  expect(candidates.map(({ drug, score }) => ({ drug, score }))).toEqual([
    { drug: 'Bare ID', score: 0.8 }, { drug: 'Verified drug', score: 0.7 }
  ]);
});
