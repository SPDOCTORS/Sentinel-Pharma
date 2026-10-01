import EvidenceModeBadge from './EvidenceModeBadge';

const descriptions = {
  SOURCE_BACKED: 'Records were retrieved from named external sources. Source identity is verified; the records do not by themselves establish efficacy.',
  MODEL_PREDICTION: 'This is a model-ranked inference, not source-backed biomedical evidence or a probability of clinical success.',
  DEMO_SYNTHETIC: 'This is a synthetic demonstration. Claims, scores and recommendations must not be treated as real-world evidence.',
  UNAVAILABLE: 'No substitute evidence was generated. The requested data or service is unavailable.'
};

export default function EvidenceProvenanceNotice({ payload = {} }) {
  const dataMode = payload.dataMode || 'UNAVAILABLE';
  const reason = payload.unavailableReason?.message || payload.error?.message;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-900/60" role="status">
      <div className="flex flex-wrap items-center gap-2">
        <EvidenceModeBadge dataMode={dataMode} verificationStatus={payload.verificationStatus} />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Evidence contract v{payload.evidenceContractVersion || 'not supplied'}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
        {descriptions[dataMode] || descriptions.UNAVAILABLE}
      </p>
      {dataMode === 'UNAVAILABLE' && reason && (
        <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">Reason: {reason}</p>
      )}
    </div>
  );
}
