const { normalizeReportEvidence } = require('../src/controllers/archivalController');

test('legacy stored citations retain content but are marked unverified on read', () => {
  const report = normalizeReportEvidence({
    results: { citations: [{ title: 'Historic record', sourceId: 'old-source' }] }
  });

  expect(report.evidence.citations[0]).toEqual(expect.objectContaining({
    dataMode: 'UNAVAILABLE', verificationStatus: 'LEGACY_UNVERIFIED'
  }));
  expect(report.evidence.verificationStatus).toBe('LEGACY_UNVERIFIED');
});
