import EvidenceProvenanceNotice from '../ui/EvidenceProvenanceNotice';

const LiveResearchSummary = ({ report }) => {
  const sources = report?.results?.sourceResults || {};
  const prediction = report?.results?.modelPrediction || {};
  return (
    <div className="space-y-5" data-testid="live-research-summary">
      <EvidenceProvenanceNotice payload={report} />
      <p className="text-sm text-slate-600">{report?.results?.summary?.overallAssessment}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {[["pubmed", "PubMed"], ["clinicalTrials", "ClinicalTrials.gov"]].map(([key, label]) => {
          const source = sources[key] || {};
          return <section key={key} className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold">{label} — {source.dataMode === 'SOURCE_BACKED' ? 'Source-backed' : 'Unavailable'}</h3>
            <p className="text-sm text-slate-600">{source.success ? `${source.count} records retrieved` : source.unavailableReason?.message || 'No source data available'}</p>
            {source.retrievedAt && <p className="text-xs text-slate-500">Retrieved {source.retrievedAt}</p>}
          </section>;
        })}
      </div>
      <section className="rounded-xl border border-violet-200 p-4">
        <h3 className="font-semibold">GNN candidate ranking — {prediction.dataMode === 'MODEL_PREDICTION' ? 'Model prediction' : 'Unavailable'}</h3>
        <p className="text-sm text-slate-600">{prediction.dataMode === 'MODEL_PREDICTION' ? 'Predictions are not verified clinical evidence or probabilities of success.' : prediction.unavailableReason?.message || 'No ranking available.'}</p>
        {prediction.dataMode === 'MODEL_PREDICTION' && <ol className="mt-2 list-decimal pl-5 text-sm">
          {(prediction.candidates || []).map((candidate, index) => <li key={candidate.drugId || candidate.drugName || index}>{candidate.drugName || candidate.drug || candidate.name || 'Unknown candidate'} — score {candidate.score ?? candidate.predictionScore ?? 'unavailable'}</li>)}
        </ol>}
      </section>
    </div>
  );
};

export default LiveResearchSummary;
