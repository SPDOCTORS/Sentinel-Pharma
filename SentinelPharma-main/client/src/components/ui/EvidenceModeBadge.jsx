const labels = {
  SOURCE_BACKED: 'Source-backed evidence',
  MODEL_PREDICTION: 'Model prediction',
  DEMO_SYNTHETIC: 'Demo / synthetic',
  UNAVAILABLE: 'Unavailable'
};

const styles = {
  SOURCE_BACKED: 'evidence-badge--source',
  MODEL_PREDICTION: 'evidence-badge--prediction',
  DEMO_SYNTHETIC: 'evidence-badge--demo',
  UNAVAILABLE: 'evidence-badge--unavailable'
};

export default function EvidenceModeBadge({ dataMode = 'UNAVAILABLE', verificationStatus, hasRecords = true }) {
  const isVerified = dataMode === 'SOURCE_BACKED' &&
    verificationStatus === 'VERIFIED_SOURCE' &&
    hasRecords !== false;

  const label = isVerified
    ? 'Verified source record'
    : labels[dataMode] || labels.UNAVAILABLE;
  return <span className={`evidence-badge ${styles[dataMode] || styles.UNAVAILABLE}`}>
    {label}
  </span>;
}
