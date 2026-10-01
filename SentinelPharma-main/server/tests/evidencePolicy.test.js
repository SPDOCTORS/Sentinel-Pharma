const {
  filterTraceableCitations,
  normalizeProvenanceEnvelope,
  unavailablePayload
} = require('../src/utils/evidencePolicy');

test('only source-backed records with identity and retrieval time are citations', () => {
  const valid = {
    dataMode: 'SOURCE_BACKED', verificationStatus: 'VERIFIED_SOURCE',
    sourceId: 'PMID:1', retrievedAt: '2026-01-01T00:00:00Z'
  };
  expect(filterTraceableCitations([
    valid,
    { ...valid, retrievedAt: undefined },
    { ...valid, sourceId: undefined },
    { ...valid, dataMode: 'MODEL_PREDICTION' }
  ])).toEqual([valid]);
});

test('mode normalization prevents a prediction from claiming source verification', () => {
  expect(normalizeProvenanceEnvelope({
    dataMode: 'MODEL_PREDICTION', verificationStatus: 'VERIFIED_SOURCE'
  })).toEqual(expect.objectContaining({
    evidenceContractVersion: '1.0',
    dataMode: 'MODEL_PREDICTION',
    verificationStatus: 'MODEL_INFERENCE'
  }));
});

test('unavailable payload carries a structured reason and compatibility error', () => {
  const result = unavailablePayload('SOURCE_DOWN', 'The source timed out.');
  expect(result).toEqual(expect.objectContaining({
    success: false,
    dataMode: 'UNAVAILABLE',
    verificationStatus: 'NOT_AVAILABLE',
    unavailableReason: { code: 'SOURCE_DOWN', message: 'The source timed out.' },
    error: { code: 'SOURCE_DOWN', message: 'The source timed out.' }
  }));
});
