const { trialLink, pubmedLink, buildCandidateEvidenceSummary } = require('../src/utils/candidateEvidence');

const trial = { id: 'NCT:NCT01234567', sourceType: 'CLINICALTRIALS_GOV', metadata: {
  interventions: [{ name: 'Metformin', type: 'DRUG' }], conditions: ['Pancreatic Cancer']
}};

test('drug and disease trial matches are direct only when both source fields match', () => {
  expect(trialLink('metformin', 'pancreatic cancer', trial)).toEqual(expect.objectContaining({
    relationshipType: 'CLINICAL_TRIAL_MATCH', linkStatus: 'DIRECT_MATCH'
  }));
  expect(trialLink('metformin', 'lung cancer', trial).linkStatus).toBe('PARTIAL_MATCH');
});

test('PubMed co-mention is not represented as validation', () => {
  const link = pubmedLink('metformin', 'pancreatic cancer', {
    id: 'PMID:123', sourceType: 'PUBMED', claim: 'Metformin in pancreatic cancer', metadata: {}
  });
  expect(link.relationshipType).toBe('DRUG_DISEASE_CO_MENTION');
  expect(link.linkStatus).toBe('DIRECT_MATCH');
  expect(JSON.stringify(link)).not.toMatch(/VALIDAT|EFFICACY|PROVEN/i);
});

test('candidate summary keeps prediction and evidence counts separate', () => {
  const summary = buildCandidateEvidenceSummary('Metformin', { score: 0.72 }, [], [trial], 'pancreatic cancer');
  expect(summary.prediction).toEqual({ dataMode: 'MODEL_PREDICTION', rankingScore: 0.72 });
  expect(summary.evidenceSummary).toEqual({ pubmedCount: 0, clinicalTrialCount: 1 });
});
