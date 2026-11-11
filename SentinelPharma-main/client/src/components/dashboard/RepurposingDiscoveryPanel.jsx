import React, { useState } from 'react';
import { Brain, FlaskConical, Loader2, AlertCircle, Network, Microscope, Activity, FileText, Layers, Box } from 'lucide-react';
import EmbeddedMoleculeViewer from './EmbeddedMoleculeViewer';
import EvidenceModeBadge from '../ui/EvidenceModeBadge';

const scoreColor = (score) => {
  if (score >= 0.85) return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800';
  if (score >= 0.7) return 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-800';
  return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800';
};

const evidenceBadge = (level = 'predicted') => {
  const normalized = String(level).toLowerCase();
  if (normalized === 'validated') {
    return {
      label: 'Validated (Graph Edge)',
      title: 'Direct drug-disease edge in curated graph dataset; not clinical trial validation',
      className: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800'
    };
  }
  if (normalized === 'fallback') {
    return {
      label: 'Fallback',
      title: 'Heuristic emergency shortlist while model evidence is missing',
      className: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800'
    };
  }
  if (normalized === 'repurposed') {
    return {
      label: 'Repurposed',
      title: 'Existing drug predicted for new disease indication',
      className: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-800'
    };
  }
  return {
    label: 'Predicted',
    title: 'Graph-only link prediction hypothesis',
    className: 'text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-800'
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [candidateTab, setCandidateTab] = useState('evidence'); // 'evidence' | 'graph' | 'structure'

  const outbreakPresets = [
    'COVID-19',
    'Novel respiratory viral syndrome',
    'Post-viral inflammatory syndrome'
  ];

  const candidates = data?.candidates || [];
  const selectedCandidate = candidates[selectedIndex] || candidates[0];

  return (
    <section className="research-panel space-y-4 animate-rise" aria-labelledby="repurposing-discovery-title">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--research-border)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--research-action)]/10 text-[var(--research-action)]">
              <FlaskConical className="h-4 w-4" />
            </span>
            <h3 id="repurposing-discovery-title" className="text-base font-bold text-[var(--research-ink)]">
              Emergency Drug Repurposing Engine
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
              GraphSAGE · V5 Shadow Model
            </span>
          </div>
          <p className="text-xs text-[var(--research-muted)] mt-1 max-w-2xl">
            Conditioned on disease input only. Rapidly prioritizes known therapeutic compounds using GraphSAGE link prediction.
          </p>
        </div>
        <div className="flex items-center gap-1.5 self-start sm:self-auto text-xs text-[var(--research-muted)] bg-[var(--research-surface-muted)] px-2.5 py-1.5 rounded-lg border border-[var(--research-border)]">
          <Activity className="h-3.5 w-3.5 text-[var(--research-primary)]" />
          <span>Disease &rarr; Existing Drugs</span>
        </div>
      </div>

      {/* Compact Disease Search Form */}
      <div className="space-y-2">
        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={disease}
              onChange={(e) => setDisease(e.target.value)}
              placeholder="Enter disease (e.g., COVID-19, Pulmonary Fibrosis, Rheumatoid Arthritis)"
              className="research-input !mt-0 text-sm"
              disabled={loading}
              aria-label="Disease input"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !disease.trim()}
            className="research-primary-button px-5 py-2 text-xs font-semibold shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Discovering…</span>
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                <span>Discover Candidates</span>
              </>
            )}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-medium text-[var(--research-muted)]">Presets:</span>
          {outbreakPresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setDisease(preset)}
              disabled={loading}
              className="research-secondary-button text-[11px] py-1 px-2.5 rounded hover:border-[var(--research-primary)]"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !candidates.length && (
        <div className="rounded-lg border border-dashed border-[var(--research-border-strong)] bg-[var(--research-surface-muted)] p-4 flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-[var(--research-surface)] border border-[var(--research-border)] flex items-center justify-center text-[var(--research-primary)] shrink-0">
            <Microscope className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--research-ink)]">Disease-first candidate discovery ready</p>
            <p className="text-xs text-[var(--research-muted)] mt-0.5">
              Enter a target disease to generate ranked repurposing candidates evaluated by GraphSAGE &amp; V5 graph embeddings with interpretable evidence trails.
            </p>
          </div>
        </div>
      )}

      {/* Results Section */}
      {candidates.length > 0 && (
        <div className="space-y-4 animate-rise pt-1">
          {/* Results Summary Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--research-border)] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--research-ink)]">
                Disease-Conditioned Existing-Drug Candidates for {data.disease}
              </h3>
              {data.metadata?.purpose && (
                <p className="text-xs text-[var(--research-muted)] mt-0.5">{data.metadata.purpose}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--research-surface-muted)] text-[var(--research-muted)] border border-[var(--research-border)]">
                Model: {data.model}
              </span>
              <EvidenceModeBadge dataMode={data.dataMode || 'MODEL_PREDICTION'} />
            </div>
          </div>

          {/* GraphSAGE Isolation & Validation Disclaimer */}
          <div className="rounded-lg border border-[var(--research-border)] bg-[var(--research-surface-muted)] p-3 text-xs text-[var(--research-muted)] space-y-1.5">
            <p className="font-semibold text-[var(--research-ink)]">Only the disease input affects this GraphSAGE ranking.</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span><strong className="text-emerald-700 dark:text-emerald-300 font-semibold">Validated:</strong> Direct drug-disease edge in curated graph (not clinical trial validation).</span>
              <span><strong className="text-blue-700 dark:text-blue-300 font-semibold">Repurposed:</strong> Existing drug predicted for new disease.</span>
              <span><strong className="text-purple-700 dark:text-purple-300 font-semibold">Predicted:</strong> Graph-only link prediction hypothesis.</span>
              <span><strong className="text-amber-700 dark:text-amber-300 font-semibold">Fallback:</strong> Heuristic emergency shortlist.</span>
            </div>
            <p className="text-[11px] leading-relaxed border-t border-[var(--research-border)] pt-1 text-[var(--research-muted)]">
              Scores are <strong>uncalibrated ranking scores</strong> ordering hypotheses from highest to lowest graph affinity, not clinical success probabilities or safety determinations.
            </p>
          </div>

          {/* Compact Candidate Ranking Table */}
          <div className="overflow-x-auto rounded-lg border border-[var(--research-border)] bg-[var(--research-surface)]">
            <table className="w-full text-left text-xs" aria-label="Candidate ranking table">
              <thead className="border-b border-[var(--research-border)] bg-[var(--research-surface-muted)] text-[var(--research-muted)] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 w-14">Rank</th>
                  <th className="py-2.5 px-3">Candidate Drug</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3">GraphSAGE Score (Uncalibrated)</th>
                  <th className="py-2.5 px-3">Evidence Status</th>
                  <th className="py-2.5 px-3 text-right">Workspace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--research-border)]">
                {candidates.map((candidate, idx) => {
                  const isSelected = selectedCandidate === candidate;
                  return (
                    <tr
                      key={`${candidate.drug}-${idx}`}
                      onClick={() => setSelectedIndex(idx)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--research-surface-muted)] font-medium'
                          : 'hover:bg-[var(--research-surface-muted)]/50'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-[var(--research-muted)] font-mono font-bold">
                        #{idx + 1}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--research-ink)] font-bold">
                        {candidate.drug}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--research-muted)]">
                        {candidate.target}
                      </td>
                      <td className="py-2.5 px-3">
                        <span title="Uncalibrated GraphSAGE ranking score" className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${scoreColor(candidate.score)}`}>
                          {(candidate.score * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${evidenceBadge(candidate.evidenceLevel).className}`}>
                          {evidenceBadge(candidate.evidenceLevel).label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`text-xs px-2.5 py-1 rounded transition-colors ${
                            isSelected
                              ? 'bg-[var(--research-action)] text-white font-semibold'
                              : 'text-[var(--research-muted)] hover:text-[var(--research-ink)]'
                          }`}
                        >
                          {isSelected ? 'Inspecting' : 'Inspect'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Single Selected Candidate Workspace */}
          {selectedCandidate && (
            <div className="rounded-xl border border-[var(--research-border)] bg-[var(--research-surface)] p-4 space-y-3.5 shadow-sm">
              {/* Workspace Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--research-border)] pb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--research-surface-muted)] text-[var(--research-muted)] border border-[var(--research-border)]">
                      Rank #{candidates.indexOf(selectedCandidate) + 1}
                    </span>
                    <h4 className="text-base font-bold text-[var(--research-ink)]">
                      {selectedCandidate.drug}
                    </h4>
                    <span className={`text-[11px] px-2 py-0.5 rounded-md border font-semibold ${evidenceBadge(selectedCandidate.evidenceLevel).className}`}>
                      {evidenceBadge(selectedCandidate.evidenceLevel).label}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-md border font-semibold ${scoreColor(selectedCandidate.score)}`}>
                      Score {(selectedCandidate.score * 100).toFixed(1)}% (Uncalibrated)
                    </span>
                  </div>
                  <p className="text-xs text-[var(--research-muted)] mt-1">
                    Target: <strong className="text-[var(--research-ink)] font-semibold">{selectedCandidate.target}</strong> · {selectedCandidate.rationale}
                  </p>
                </div>

                {/* Primary Action Button */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => onInvestigateCandidate?.(selectedCandidate, data.disease)}
                    disabled={investigatingCandidate === selectedCandidate}
                    className="research-primary-button text-xs py-1.5 px-3.5 h-auto min-h-0 shrink-0"
                  >
                    {investigatingCandidate === selectedCandidate ? 'Opening investigation…' : 'Investigate candidate + disease'}
                  </button>
                </div>
              </div>

              {/* Workspace Navigation Tabs */}
              <div className="border-b border-[var(--research-border)]">
                <nav className="flex gap-2" aria-label="Candidate inspection tabs">
                  <button
                    type="button"
                    onClick={() => setCandidateTab('evidence')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
                      candidateTab === 'evidence'
                        ? 'border-[var(--research-action)] text-[var(--research-action)]'
                        : 'border-transparent text-[var(--research-muted)] hover:text-[var(--research-ink)]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Evidence &amp; Clinical Trials</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCandidateTab('graph')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
                      candidateTab === 'graph'
                        ? 'border-[var(--research-action)] text-[var(--research-action)]'
                        : 'border-transparent text-[var(--research-muted)] hover:text-[var(--research-ink)]'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Knowledge Graph Trail</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCandidateTab('structure')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
                      candidateTab === 'structure'
                        ? 'border-[var(--research-action)] text-[var(--research-action)]'
                        : 'border-transparent text-[var(--research-muted)] hover:text-[var(--research-ink)]'
                    }`}
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span>3D Molecular Structure</span>
                  </button>
                </nav>
              </div>

              {/* Tab 1: Evidence & Clinical Trials */}
              {candidateTab === 'evidence' && (
                <div className="space-y-3 pt-1">
                  {/* Model Prediction Attribution */}
                  <div className="rounded-md border border-purple-300/30 bg-purple-500/5 dark:bg-purple-950/20 p-2.5 text-xs">
                    <div className="font-semibold text-purple-700 dark:text-purple-300">MODEL PREDICTION · GRAPHSAGE</div>
                    <div className="text-[var(--research-muted)] mt-0.5">
                      Uncalibrated ranking score: {(selectedCandidate.score * 100).toFixed(1)}%. This is an uncalibrated model link prediction score ordering candidate hypotheses, not verified source evidence or clinical validation.
                    </div>
                  </div>

                  {/* Evidence Query Action */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onLoadCandidateEvidence?.(selectedCandidate)}
                      disabled={candidateEvidenceLoading[selectedCandidate.drug]}
                      className="research-secondary-button text-xs py-1.5 px-3 h-auto min-h-0"
                    >
                      {candidateEvidenceLoading[selectedCandidate.drug] ? 'Loading source evidence…' : 'Load literature and clinical trials'}
                    </button>
                  </div>

                  {/* Evidence Error */}
                  {candidateEvidence[selectedCandidate.drug]?.error && (
                    <p className="text-xs text-rose-600 dark:text-rose-400">
                      {candidateEvidence[selectedCandidate.drug].error}
                    </p>
                  )}

                  {/* Loaded Literature and Trial Evidence */}
                  {candidateEvidence[selectedCandidate.drug]?.candidateEvidence && (() => {
                    const sourceData = candidateEvidence[selectedCandidate.drug];
                    const trials = sourceData.clinicalTrialEvidence || [];
                    return (
                      <div className="space-y-2 text-xs">
                        <div className="rounded-md border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-2.5">
                          <div className="font-semibold text-blue-700 dark:text-blue-300">LITERATURE EVIDENCE</div>
                          <p className="text-[var(--research-muted)] mt-0.5">
                            {sourceData.candidateEvidence.evidenceSummary.pubmedCount} PubMed source records. Co-mention is not evidence of efficacy.
                          </p>
                        </div>
                        <div className="rounded-md border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5">
                          <div className="font-semibold text-emerald-700 dark:text-emerald-300">CLINICAL TRIALS</div>
                          <p className="text-[var(--research-muted)] mt-0.5">
                            {sourceData.candidateEvidence.evidenceSummary.clinicalTrialCount} ClinicalTrials.gov source records.
                          </p>
                          {trials.map((trial) => (
                            <div key={trial.sourceId} className="mt-2 border-t border-emerald-200/50 dark:border-emerald-800/30 pt-2">
                              <div className="font-semibold text-[var(--research-ink)]">{trial.sourceId} · {trial.claim}</div>
                              <div className="text-[var(--research-muted)]">
                                {trial.metadata?.overallStatus || 'Status unavailable'}
                                {trial.metadata?.phases?.length ? ` · ${trial.metadata.phases.join(', ')}` : ''}
                              </div>
                              <div className="text-[var(--research-muted)]">
                                Results posted: {trial.metadata?.hasResults === true ? 'Yes' : trial.metadata?.hasResults === false ? 'No' : 'Unavailable'}
                              </div>
                              <a
                                href={trial.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[var(--research-action)] hover:underline inline-flex items-center gap-1 mt-1 font-medium"
                              >
                                Open ClinicalTrials.gov source
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Candidate Clinical Details */}
                  {(selectedCandidate.existingUse || selectedCandidate.emergencyFit || selectedCandidate.nextStep) && (
                    <div className="grid gap-2 sm:grid-cols-3 text-xs">
                      {selectedCandidate.existingUse && (
                        <div className="rounded-md border border-[var(--research-border)] bg-[var(--research-surface-muted)] p-2">
                          <span className="font-semibold text-[var(--research-ink)]">Existing use: </span>
                          <span className="text-[var(--research-muted)]">{selectedCandidate.existingUse}</span>
                        </div>
                      )}
                      {selectedCandidate.emergencyFit && (
                        <div className="rounded-md border border-[var(--research-border)] bg-[var(--research-surface-muted)] p-2">
                          <span className="font-semibold text-[var(--research-ink)]">Repurposing fit: </span>
                          <span className="text-[var(--research-muted)]">{selectedCandidate.emergencyFit}</span>
                        </div>
                      )}
                      {selectedCandidate.nextStep && (
                        <div className="rounded-md border border-[var(--research-border)] bg-[var(--research-surface-muted)] p-2">
                          <span className="font-semibold text-[var(--research-ink)]">Next validation: </span>
                          <span className="text-[var(--research-muted)]">{selectedCandidate.nextStep}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Knowledge Graph Trail */}
              {candidateTab === 'graph' && (
                <div className="space-y-2.5 pt-1 text-xs">
                  <div className="rounded-lg border border-[var(--research-border)] bg-[var(--research-surface)] p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-[var(--research-ink)] flex items-center gap-1.5">
                        <Network className="w-3.5 h-3.5 text-[var(--research-primary)]" />
                        <span>Multi-Hop GraphSAGE Evidence Trail</span>
                      </div>
                      <span className="text-[10px] font-semibold text-[var(--research-muted)]">
                        {selectedCandidate.evidenceTrail?.length ? `${selectedCandidate.evidenceTrail.length} hops` : 'Inferred'}
                      </span>
                    </div>
                    {selectedCandidate.evidenceTrail?.length ? (
                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] pt-0.5">
                        {selectedCandidate.evidenceTrail.map((hop, hIdx) => {
                          const isFirst = hIdx === 0;
                          const isLast = hIdx === selectedCandidate.evidenceTrail.length - 1;
                          return (
                            <React.Fragment key={hIdx}>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] transition-colors ${
                                  isFirst
                                    ? 'border-[var(--research-primary)]/40 bg-[var(--research-surface-muted)] text-[var(--research-primary)] font-bold'
                                    : isLast
                                    ? 'border-purple-300/50 dark:border-purple-800/50 bg-purple-500/5 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300 font-bold'
                                    : 'border-[var(--research-border)] bg-[var(--research-surface-muted)] text-[var(--research-ink)] font-medium'
                                }`}
                              >
                                <span className="text-[9px] opacity-60 font-sans">{hIdx + 1}.</span>
                                {hop}
                              </span>
                              {!isLast && (
                                <span className="text-[var(--research-muted)] font-bold text-xs select-none">&rarr;</span>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[var(--research-muted)]">
                        Inferred edge: {selectedCandidate.drug} &rarr; {selectedCandidate.target} &rarr; {data.disease}
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-[var(--research-border)] bg-[var(--research-surface-muted)] p-2.5 space-y-0.5">
                    <p className="font-semibold text-[var(--research-ink)] text-xs">V5 Shadow Model Isolation</p>
                    <p className="text-[var(--research-muted)] leading-relaxed text-[11px]">
                      Link prediction embeddings are evaluated on disease-conditioned graph topology only.
                      No molecule from the single-pair evidence workflow affects these scores.
                    </p>
                  </div>

                  {selectedCandidate.interaction?.dataMode === 'UNAVAILABLE' && (
                    <div className="rounded-md border border-[var(--research-border)] bg-[var(--research-surface-muted)] p-2 text-[var(--research-muted)]">
                      Structure binding map status: <strong className="text-[var(--research-ink)]">UNAVAILABLE</strong>. Experimental ranking generated without crystallographic complex interface.
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: 3D Molecular Structure */}
              {candidateTab === 'structure' && (
                <div className="pt-0.5">
                  <EmbeddedMoleculeViewer
                    molecule={selectedCandidate.drug}
                    structureMapping={selectedCandidate.interaction}
                    target={selectedCandidate.target}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default RepurposingDiscoveryPanel;
