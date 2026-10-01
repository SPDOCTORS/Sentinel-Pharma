const DATA_MODE = Object.freeze({
  SOURCE_BACKED: 'SOURCE_BACKED',
  MODEL_PREDICTION: 'MODEL_PREDICTION',
  DEMO_SYNTHETIC: 'DEMO_SYNTHETIC',
  UNAVAILABLE: 'UNAVAILABLE'
});

const EVIDENCE_CONTRACT_VERSION = '1.0';

const VERIFICATION_STATUS = Object.freeze({
  VERIFIED_SOURCE: 'VERIFIED_SOURCE',
  UNVERIFIED_SOURCE: 'UNVERIFIED_SOURCE',
  MODEL_INFERENCE: 'MODEL_INFERENCE',
  DEMO_ONLY: 'DEMO_ONLY',
  NOT_AVAILABLE: 'NOT_AVAILABLE'
});

const DEFAULT_VERIFICATION = Object.freeze({
  [DATA_MODE.SOURCE_BACKED]: VERIFICATION_STATUS.UNVERIFIED_SOURCE,
  [DATA_MODE.MODEL_PREDICTION]: VERIFICATION_STATUS.MODEL_INFERENCE,
  [DATA_MODE.DEMO_SYNTHETIC]: VERIFICATION_STATUS.DEMO_ONLY,
  [DATA_MODE.UNAVAILABLE]: VERIFICATION_STATUS.NOT_AVAILABLE
});

const isSourceBackedEvidence = (item) => item?.dataMode === DATA_MODE.SOURCE_BACKED &&
  Boolean(item?.sourceId || item?.sourceUrl) && Boolean(item?.retrievedAt);
const isModelPrediction = (item) => item?.dataMode === DATA_MODE.MODEL_PREDICTION;
const isDemoEvidence = (item) => item?.dataMode === DATA_MODE.DEMO_SYNTHETIC;

const filterEvidenceForProductionReport = (items = []) =>
  (Array.isArray(items) ? items : []).filter((item) => isSourceBackedEvidence(item) || isModelPrediction(item));

const filterTraceableCitations = (items = []) =>
  (Array.isArray(items) ? items : []).filter(isSourceBackedEvidence);

const summarizeDataModes = (items = []) => [...new Set(
  (Array.isArray(items) ? items : []).map((item) => item?.dataMode || 'LEGACY_UNVERIFIED')
)];

const normalizeLegacyEvidence = (item) => ({
  ...item,
  evidenceContractVersion: item?.evidenceContractVersion || EVIDENCE_CONTRACT_VERSION,
  dataMode: item?.dataMode || 'UNAVAILABLE',
  verificationStatus: item?.verificationStatus || 'LEGACY_UNVERIFIED',
  unavailableReason: item?.unavailableReason || (!item?.dataMode ? {
    code: 'LEGACY_PROVENANCE_MISSING',
    message: 'This stored record predates the evidence contract and cannot be verified.'
  } : undefined)
});

const normalizeProvenanceEnvelope = (payload = {}, fallbackMode = DATA_MODE.UNAVAILABLE) => {
  const dataMode = Object.values(DATA_MODE).includes(payload?.dataMode) ? payload.dataMode : fallbackMode;
  const allowedVerification = dataMode === DATA_MODE.SOURCE_BACKED
    ? [VERIFICATION_STATUS.VERIFIED_SOURCE, VERIFICATION_STATUS.UNVERIFIED_SOURCE]
    : [DEFAULT_VERIFICATION[dataMode]];
  const verificationStatus = allowedVerification.includes(payload?.verificationStatus)
    ? payload.verificationStatus
    : DEFAULT_VERIFICATION[dataMode];
  return {
    ...payload,
    evidenceContractVersion: payload?.evidenceContractVersion || EVIDENCE_CONTRACT_VERSION,
    dataMode,
    verificationStatus
  };
};

const unavailablePayload = (code, message, details = {}) => normalizeProvenanceEnvelope({
  success: false,
  retrievedAt: new Date().toISOString(),
  ...details,
  unavailableReason: { code, message },
  error: { code, message }
}, DATA_MODE.UNAVAILABLE);

module.exports = {
  DATA_MODE,
  VERIFICATION_STATUS,
  EVIDENCE_CONTRACT_VERSION,
  isSourceBackedEvidence,
  isModelPrediction,
  isDemoEvidence,
  filterEvidenceForProductionReport,
  filterTraceableCitations,
  summarizeDataModes,
  normalizeLegacyEvidence,
  normalizeProvenanceEnvelope,
  unavailablePayload
};
