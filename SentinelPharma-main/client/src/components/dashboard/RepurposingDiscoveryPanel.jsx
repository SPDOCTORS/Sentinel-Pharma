import React from 'react';
import { FlaskConical, Loader2, AlertCircle, Network, Microscope, Activity, Clock3 } from 'lucide-react';
import EmbeddedMoleculeViewer from './EmbeddedMoleculeViewer';
import EvidenceModeBadge from '../ui/EvidenceModeBadge';

const scoreColor = (score) => {
  if (score >= 0.85) return 'text-emerald-200 bg-emerald-500/20 border-emerald-300/40';
  if (score >= 0.7) return 'text-cyan-100 bg-cyan-500/20 border-cyan-300/40';
  return 'text-amber-100 bg-amber-500/20 border-amber-300/40';
};

const evidenceBadge = (level = 'predicted') => {
  const normalized = String(level).toLowerCase();
  if (normalized === 'validated') {
    return {
      label: 'Validated',
      className: 'text-emerald-100 bg-emerald-500/20 border-emerald-300/40'
    };
  }
  if (normalized === 'fallback') {
    return {
      label: 'Fallback',
      className: 'text-amber-100 bg-amber-500/20 border-amber-300/40'
    };
  }
  if (normalized === 'repurposed') {
    return {
      label: 'Repurposed',
      className: 'text-cyan-100 bg-cyan-500/20 border-cyan-300/40'
    };
  }
  return {
    label: 'Predicted',
    className: 'text-violet-100 bg-violet-500/20 border-violet-300/40'
  };
};

const RepurposingDiscoveryPanel = ({
  disease,
  setDisease,
  onSubmit,
  loading,
  error,
  data,
  candidateEvidence = {},
  candidateEvidenceLoading = {},
  onLoadCandidateEvidence,
  onInvestigateCandidate,
  investigatingCandidate
}) => {
  const outbreakPresets = [
    'COVID-19',
    'Novel respiratory viral syndrome',
    'Post-viral inflammatory syndrome'
  ];

  return (
    <section className="research-lab-panel space-y-6 animate-rise text-slate-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center text-xl font-bold tracking-tight text-white md:text-2xl">
            <FlaskConical className="w-6 h-6 mr-2 text-cyan-300" />
          Emergency Drug Repurposing Engine
        </h2>
        <p className="text-cyan-100/70 mt-2 max-w-2xl">
          Search a new or fast-spreading disease and rank already known medicines that could be investigated faster than discovering a drug from scratch.
        </p>
        </div>
        <div className="hidden md:flex items-center px-3 py-2 rounded-xl bg-cyan-400/15 text-cyan-100 text-xs font-semibold border border-cyan-300/35">
          Disease to Existing Drugs
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-cyan-300/25 bg-slate-950/45 p-4">
          <div className="flex items-center text-cyan-100 font-semibold text-sm">
            <Activity className="w-4 h-4 mr-2 text-cyan-300" />
            Outbreak Need
          </div>
          <p className="mt-2 text-sm text-cyan-100/70">
            When a disease appears suddenly, the system starts from the disease and searches approved or known drugs.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-300/25 bg-slate-950/45 p-4">
          <div className="flex items-center text-emerald-100 font-semibold text-sm">
            <Clock3 className="w-4 h-4 mr-2 text-emerald-300" />
            Faster Shortlist
          </div>
          <p className="mt-2 text-sm text-cyan-100/70">
            Existing safety, dosage, manufacturing, and clinical signals help prioritize candidates for validation.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-300/25 bg-slate-950/45 p-4">
          <div className="flex items-center text-amber-100 font-semibold text-sm">
            <Network className="w-4 h-4 mr-2 text-amber-300" />
            Evidence Trail
          </div>
          <p className="mt-2 text-sm text-cyan-100/70">
            Each candidate is shown with a drug-to-target-to-pathway-to-disease trail for review.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={disease}
          onChange={(e) => setDisease(e.target.value)}
          placeholder="Enter disease (e.g., COVID-19, Pulmonary Fibrosis, Rheumatoid Arthritis)"
          className="flex-1 px-4 py-3.5 rounded-2xl border border-cyan-300/35 bg-slate-900/70 text-cyan-50 placeholder:text-cyan-100/40 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !disease.trim()}
          className="flex items-center justify-center rounded-xl bg-emerald-300 px-6 py-3.5 font-semibold text-slate-950 shadow-sm transition-colors hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Discovering
            </>
          ) : (
            'Discover Candidates'
          )}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {outbreakPresets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setDisease(preset)}
            disabled={loading}
            className="px-3 py-2 rounded-xl border border-cyan-300/25 bg-slate-900/60 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/15 disabled:opacity-60"
          >
            {preset}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-rose-500/20 border border-rose-300/35 rounded-xl p-3 text-rose-100 flex items-center">
          <AlertCircle className="w-4 h-4 mr-2" />
          {error}
        </div>
      )}

      {!loading && !error && !data?.candidates?.length && (
        <div className="animate-soft rounded-2xl border border-dashed border-cyan-300/35 bg-cyan-500/10 p-5 md:p-6 flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-900/60 border border-cyan-300/25 flex items-center justify-center text-cyan-300">
            <Microscope className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-cyan-100">Start disease-first discovery</p>
            <p className="text-sm text-cyan-100/75 mt-1">
              Enter a disease to generate ranked repurposing candidates with interpretable biological evidence.
            </p>
          </div>
        </div>
      )}

      {data?.candidates?.length > 0 && (
        <div className="space-y-4 animate-rise">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-cyan-100">
                Disease-Conditioned Existing-Drug Candidates for {data.disease}
              </h3>
              {data.metadata?.purpose && (
                <p className="text-xs text-cyan-100/65 mt-1">{data.metadata.purpose}</p>
              )}
            </div>
            <span className="text-xs text-cyan-100/90 bg-cyan-500/15 border border-cyan-300/30 px-2 py-1 rounded-md">
              Model: {data.model}
            </span>
            <EvidenceModeBadge dataMode={data.dataMode || 'MODEL_PREDICTION'} />
          </div>
          <div className="rounded-2xl border border-cyan-300/20 bg-slate-950/45 p-3 text-xs text-cyan-100/75">
            <p className="mb-2 font-semibold text-cyan-100">Only the disease input affects this GraphSAGE ranking.</p>
            <span className="font-semibold text-emerald-200">Validated</span> means a direct drug-disease edge exists in the curated graph.
            <span className="font-semibold text-cyan-200 ml-2">Repurposed</span> means an existing drug is predicted for a new disease.
            <span className="font-semibold text-violet-200 ml-2">Predicted</span> means graph-only hypothesis.
            <span className="font-semibold text-amber-200 ml-2">Fallback</span> means heuristic emergency shortlist while model evidence is missing.
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {data.candidates.map((candidate, idx) => (
              <article
                key={`${candidate.drug}-${idx}`}
                className="rounded-2xl border border-cyan-300/20 p-4 md:p-5 bg-slate-900/65 space-y-3 shadow-md hover:shadow-[0_0_24px_rgba(52,211,255,0.22)] transition-all animate-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-cyan-50">#{idx + 1} {candidate.drug}</h4>
                    <p className="text-sm text-cyan-100/70">Target: {candidate.target}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-1 rounded-lg border font-semibold ${evidenceBadge(candidate.evidenceLevel).className}`}>
                      {evidenceBadge(candidate.evidenceLevel).label}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-lg border font-semibold ${scoreColor(candidate.score)}`}>
                      Score {(candidate.score * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <p className="text-sm text-cyan-100/80">{candidate.rationale}</p>

                <div className="rounded-lg border border-violet-300/30 p-3 bg-slate-950/45 text-xs">
                  <div className="font-semibold text-violet-200">MODEL PREDICTION</div>
                  <div className="text-cyan-100/75 mt-1">Ranking score: {(candidate.score * 100).toFixed(1)}%. This is a model prediction, not verified source evidence.</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onInvestigateCandidate?.(candidate, data.disease)}
                    disabled={investigatingCandidate === candidate}
                    className="rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-60"
                  >
                    {investigatingCandidate === candidate ? 'Opening investigation…' : 'Investigate candidate + disease'}
                  </button>
                  <button type="button" onClick={() => onLoadCandidateEvidence?.(candidate)} disabled={candidateEvidenceLoading[candidate.drug]}
                    className="text-xs px-3 py-2 rounded-lg border border-cyan-300/35 text-cyan-100 hover:bg-cyan-400/15 disabled:opacity-60">
                    {candidateEvidenceLoading[candidate.drug] ? 'Loading source evidence…' : 'Load literature and clinical trials'}
                  </button>
                </div>

                {candidateEvidence[candidate.drug]?.error && <p className="text-xs text-rose-200">{candidateEvidence[candidate.drug].error}</p>}
                {candidateEvidence[candidate.drug]?.candidateEvidence && (() => {
                  const sourceData = candidateEvidence[candidate.drug];
                  const trials = sourceData.clinicalTrialEvidence || [];
                  return <div className="space-y-2 text-xs">
                    <div className="rounded-lg border border-blue-300/30 p-3 bg-slate-950/45">
                      <div className="font-semibold text-blue-200">LITERATURE EVIDENCE</div>
                      <p className="text-cyan-100/75 mt-1">{sourceData.candidateEvidence.evidenceSummary.pubmedCount} PubMed source records. Co-mention is not evidence of efficacy.</p>
                    </div>
                    <div className="rounded-lg border border-emerald-300/30 p-3 bg-slate-950/45">
                      <div className="font-semibold text-emerald-200">CLINICAL TRIALS</div>
                      <p className="text-cyan-100/75 mt-1">{sourceData.candidateEvidence.evidenceSummary.clinicalTrialCount} ClinicalTrials.gov source records.</p>
                      {trials.map((trial) => <div key={trial.sourceId} className="mt-2 border-t border-emerald-300/15 pt-2">
                        <div className="font-semibold text-emerald-100">{trial.sourceId} · {trial.claim}</div>
                        <div className="text-cyan-100/75">{trial.metadata?.overallStatus || 'Status unavailable'}{trial.metadata?.phases?.length ? ` · ${trial.metadata.phases.join(', ')}` : ''}</div>
                        <div className="text-cyan-100/75">Results posted: {trial.metadata?.hasResults === true ? 'Yes' : trial.metadata?.hasResults === false ? 'No' : 'Unavailable'}</div>
                        <a href={trial.sourceUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200">Open ClinicalTrials.gov source</a>
                      </div>)}
                    </div>
                  </div>;
                })()}

                {(candidate.existingUse || candidate.emergencyFit || candidate.nextStep) && (
                  <div className="grid gap-2 text-xs">
                    {candidate.existingUse && (
                      <div className="rounded-lg border border-cyan-300/20 bg-slate-950/35 p-2">
                        <span className="font-semibold text-cyan-200">Existing use: </span>
                        <span className="text-cyan-100/75">{candidate.existingUse}</span>
                      </div>
                    )}
                    {candidate.emergencyFit && (
                      <div className="rounded-lg border border-emerald-300/20 bg-slate-950/35 p-2">
                        <span className="font-semibold text-emerald-200">Repurposing fit: </span>
                        <span className="text-cyan-100/75">{candidate.emergencyFit}</span>
                      </div>
                    )}
                    {candidate.nextStep && (
                      <div className="rounded-lg border border-amber-300/20 bg-slate-950/35 p-2">
                        <span className="font-semibold text-amber-200">Next validation: </span>
                        <span className="text-cyan-100/75">{candidate.nextStep}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-cyan-300/30 p-3 bg-slate-950/45">
                  <div className="text-xs font-semibold text-cyan-200 mb-2 flex items-center">
                    <Network className="w-3 h-3 mr-1" />
                    Evidence Trail
                  </div>
                  <div className="text-xs text-cyan-100/75 break-words">
                    {candidate.evidenceTrail.join(' -> ')}
                  </div>
                </div>

                <EmbeddedMoleculeViewer
                  molecule={candidate.drug}
                  structureMapping={candidate.interaction}
                  target={candidate.target}
                />
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default RepurposingDiscoveryPanel;
