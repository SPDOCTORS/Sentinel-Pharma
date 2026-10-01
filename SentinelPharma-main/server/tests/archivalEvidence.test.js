const { normalizeReportEvidence } = require('../src/controllers/archivalController');

test('legacy stored citations retain content but are marked unverified on read', () => {
  const report = normalizeReportEvidence({
    results: { citations: [{ title: 'Historic record', sourceId: 'old-source' }] }
  });

  expect(report.evidence.citations[0]).toEqual(expect.objectContaining({
    dataMode: 'UNAVAILABLE', verificationStatus: 'LEGACY_UNVERIFIED'
  }));
  expect(report.evidence.verificationStatus).toBe('LEGACY_UNVERIFIED');
  expect(report.evidence.evidenceContractVersion).toBe('1.0');
});

test('modern stored citation provenance is preserved on read', () => {
  const report = normalizeReportEvidence({
    results: { citations: [{
      evidenceContractVersion: '1.0', dataMode: 'SOURCE_BACKED',
      verificationStatus: 'VERIFIED_SOURCE', sourceId: '123', retrievedAt: '2026-01-01T00:00:00Z'
    }] }
  });

  expect(report.evidence.verificationStatus).toBe('VERIFIED_SOURCE');
  expect(report.evidence.dataModes).toEqual(['SOURCE_BACKED']);
});
