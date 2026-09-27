const DATA_MODE = Object.freeze({
  SOURCE_BACKED: 'SOURCE_BACKED',
  MODEL_PREDICTION: 'MODEL_PREDICTION',
  DEMO_SYNTHETIC: 'DEMO_SYNTHETIC',
  UNAVAILABLE: 'UNAVAILABLE'
});

const isSourceBackedEvidence = (item) => item?.dataMode === DATA_MODE.SOURCE_BACKED && Boolean(item?.sourceId || item?.sourceUrl);
const isModelPrediction = (item) => item?.dataMode === DATA_MODE.MODEL_PREDICTION;
const isDemoEvidence = (item) => item?.dataMode === DATA_MODE.DEMO_SYNTHETIC;

const filterEvidenceForProductionReport = (items = []) =>
  (Array.isArray(items) ? items : []).filter((item) => isSourceBackedEvidence(item) || isModelPrediction(item));

const summarizeDataModes = (items = []) => [...new Set(
  (Array.isArray(items) ? items : []).map((item) => item?.dataMode || 'LEGACY_UNVERIFIED')
)];

const normalizeLegacyEvidence = (item) => ({
  ...item,
  dataMode: item?.dataMode || 'UNAVAILABLE',
  verificationStatus: item?.verificationStatus || 'LEGACY_UNVERIFIED'
});

module.exports = { DATA_MODE, isSourceBackedEvidence, isModelPrediction, isDemoEvidence, filterEvidenceForProductionReport, summarizeDataModes, normalizeLegacyEvidence };
