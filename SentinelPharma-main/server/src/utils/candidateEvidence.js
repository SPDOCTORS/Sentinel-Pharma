const normalizeText = (value) => String(value || '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const mentions = (value, term) => {
  const normalizedTerm = normalizeText(term);
  return Boolean(normalizedTerm) && normalizeText(value).includes(normalizedTerm);
};

const trialLink = (candidate, disease, evidence) => {
  const interventions = evidence?.metadata?.interventions || [];
  const conditions = evidence?.metadata?.conditions || [];
  const intervention = interventions.find((item) => mentions(item?.name, candidate));
  const condition = conditions.find((item) => mentions(item, disease));
  const direct = Boolean(intervention && condition);
  return {
    candidateId: candidate, evidenceId: evidence?.id, sourceType: evidence?.sourceType,
    relationshipType: direct ? 'CLINICAL_TRIAL_MATCH' : (intervention ? 'DRUG_MENTION' : (condition ? 'DISEASE_MENTION' : 'OTHER')),
    linkStatus: direct ? 'DIRECT_MATCH' : ((intervention || condition) ? 'PARTIAL_MATCH' : 'UNRESOLVED'),
    matchBasis: { drugMatched: intervention?.name || null, conditionMatched: condition || null }, metadata: {}
  };
};

const pubmedLink = (candidate, disease, evidence) => {
  const searchable = [evidence?.claim, evidence?.metadata?.abstract].filter(Boolean).join(' ');
  const drugMatched = mentions(searchable, candidate);
  const conditionMatched = mentions(searchable, disease);
  const direct = drugMatched && conditionMatched;
  return {
    candidateId: candidate, evidenceId: evidence?.id, sourceType: evidence?.sourceType,
    relationshipType: direct ? 'DRUG_DISEASE_CO_MENTION' : (drugMatched ? 'DRUG_MENTION' : (conditionMatched ? 'DISEASE_MENTION' : 'OTHER')),
    linkStatus: direct ? 'DIRECT_MATCH' : ((drugMatched || conditionMatched) ? 'PARTIAL_MATCH' : 'UNRESOLVED'),
    matchBasis: { drugMatched: drugMatched ? candidate : null, conditionMatched: conditionMatched ? disease : null }, metadata: {}
  };
};

const buildCandidateEvidenceSummary = (candidate, prediction, pubmedEvidence = [], trialEvidence = [], disease) => ({
  candidate,
  prediction: { dataMode: 'MODEL_PREDICTION', rankingScore: prediction?.score ?? null },
  evidenceSummary: { pubmedCount: pubmedEvidence.length, clinicalTrialCount: trialEvidence.length },
  evidenceLinks: [
    ...pubmedEvidence.map((item) => pubmedLink(candidate, disease, item)),
    ...trialEvidence.map((item) => trialLink(candidate, disease, item))
  ]
});

module.exports = { normalizeText, trialLink, pubmedLink, buildCandidateEvidenceSummary };
