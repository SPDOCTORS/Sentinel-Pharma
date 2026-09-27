const labels = {
  SOURCE_BACKED: 'Verified source',
  MODEL_PREDICTION: 'Model prediction',
  DEMO_SYNTHETIC: 'Demo / synthetic',
  UNAVAILABLE: 'Unavailable'
};

const styles = {
  SOURCE_BACKED: 'bg-emerald-500/20 text-emerald-100 border-emerald-300/40',
  MODEL_PREDICTION: 'bg-violet-500/20 text-violet-100 border-violet-300/40',
  DEMO_SYNTHETIC: 'bg-amber-500/20 text-amber-100 border-amber-300/40',
  UNAVAILABLE: 'bg-rose-500/20 text-rose-100 border-rose-300/40'
};

export default function EvidenceModeBadge({ dataMode = 'UNAVAILABLE' }) {
  return <span className={`text-xs px-2 py-1 rounded-lg border font-semibold ${styles[dataMode] || styles.UNAVAILABLE}`}>
    {labels[dataMode] || labels.UNAVAILABLE}
  </span>;
}
