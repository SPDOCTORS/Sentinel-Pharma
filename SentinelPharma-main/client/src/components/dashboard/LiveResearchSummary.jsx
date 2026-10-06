import { BookOpen, CheckCircle2, Clock3, Database, FlaskConical, ShieldCheck, Sparkles } from 'lucide-react';

import EvidenceModeBadge from '../ui/EvidenceModeBadge';
import EvidenceProvenanceNotice from '../ui/EvidenceProvenanceNotice';

const formatTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const candidateName = (candidate = {}) => candidate.drugName || candidate.drug || candidate.name || 'Unknown candidate';
const candidateScore = (candidate = {}) => candidate.score ?? candidate.predictionScore;

const displayScore = (value) => {
  if (value === null || value === undefined) return 'Unavailable';
  if (typeof value !== 'number') return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
};

const scoreWidth = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
};

const LiveResearchSummary = ({ report, view = 'all', onInvestigateCandidate, investigatingCandidate }) => {
  const sources = report?.results?.sourceResults || {};
  const prediction = report?.results?.modelPrediction || {};
  const candidates = prediction.candidates || [];
  const shadowPrediction = report?.results?.shadowModelPrediction;
  const shadowCandidates = shadowPrediction?.candidates || [];
  const showEvidence = view !== 'rankings';
  const showRankings = view !== 'evidence';

  return (
    <div className="space-y-6" data-testid="live-research-summary">
      {showEvidence && <>
      <EvidenceProvenanceNotice payload={report} />

      {report?.results?.summary?.overallAssessment && (
        <div className="research-result-summary">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--research-evidence)]" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--research-muted)]">Research summary</p>
            <p className="mt-1 text-sm leading-6 text-[var(--research-ink)]">{report.results.summary.overallAssessment}</p>
          </div>
        </div>
      )}

      <section aria-labelledby="source-coverage-heading">
        <div className="research-result-section-heading">
          <div>
            <p className="research-eyebrow">Evidence coverage</p>
            <h3 id="source-coverage-heading" className="text-base font-bold text-[var(--research-ink)]">Named biomedical sources</h3>
          </div>
          <span className="research-count-label">{Object.values(sources).filter((source) => source.success).length} of 2 available</span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[["pubmed", "PubMed", BookOpen], ["clinicalTrials", "ClinicalTrials.gov", FlaskConical]].map(([key, label, Icon]) => {
            const source = sources[key] || {};
            const available = source.dataMode === 'SOURCE_BACKED' && source.success;
            return (
              <article key={key} className={`research-source-card ${available ? 'research-source-card--available' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="research-source-card__icon"><Icon className="h-5 w-5" /></span>
                  <EvidenceModeBadge dataMode={source.dataMode} verificationStatus={source.verificationStatus} />
                </div>
                <h4 className="mt-4 font-semibold text-[var(--research-ink)]">{label}</h4>
                <p className="mt-1 text-sm text-[var(--research-muted)]">
                  {source.success ? `${source.count} records retrieved` : source.unavailableReason?.message || 'No source data available'}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--research-border)] pt-3 text-xs text-[var(--research-muted)]">
                  {available && <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-[var(--research-evidence)]" />Source identity verified</span>}
                  {source.retrievedAt && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatTimestamp(source.retrievedAt)}</span>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      </>}

      {showRankings && <>
      <div className="research-result-summary" role="note">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[var(--research-prediction)]" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--research-muted)]">Disease-conditioned model output</p>
          <p className="mt-1 text-sm leading-6 text-[var(--research-ink)]">
            These rankings use only the disease input{report?.disease ? ` (${report.disease})` : ''}. The molecule entered in the evidence flow does not affect either ranking.
          </p>
        </div>
      </div>
      <section className="research-ranking-panel" aria-labelledby="candidate-ranking-heading">
        <div className="research-result-section-heading">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="research-eyebrow mb-0">Inference channel</p>
              <EvidenceModeBadge dataMode={prediction.dataMode} verificationStatus={prediction.verificationStatus} />
            </div>
            <h3 id="candidate-ranking-heading" className="mt-2 flex items-center gap-2 text-base font-bold text-[var(--research-ink)]">
              <Sparkles className="h-4 w-4 text-[var(--research-prediction)]" />
              Disease-conditioned GraphSAGE candidate ranking
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--research-muted)]">
              {prediction.dataMode === 'MODEL_PREDICTION'
                ? 'The disease input determines this ranking. Scores order model-generated hypotheses; they are not probabilities or verified clinical evidence.'
                : prediction.unavailableReason?.message || 'No ranking available.'}
            </p>
          </div>
          {prediction.generatedAt && <span className="research-count-label">Generated {formatTimestamp(prediction.generatedAt)}</span>}
        </div>

        {prediction.dataMode === 'MODEL_PREDICTION' && (
          candidates.length > 0 ? (
            <ol className="mt-4 divide-y divide-[var(--research-border)] overflow-hidden rounded-xl border border-[var(--research-border)] bg-[var(--research-surface)]">
              {candidates.map((candidate, index) => {
                const score = candidateScore(candidate);
                return (
                  <li key={candidate.drugId || candidate.drugName || index} className="research-ranking-row">
                    <span className="research-rank-number" aria-label={`Rank ${candidate.rank || index + 1}`}>{candidate.rank || index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--research-ink)]">{candidateName(candidate)}</span>
                        {candidate.drugId && <span className="research-id-label">{candidate.drugId}</span>}
                        {candidate.evidenceLevel && <span className="research-id-label">{candidate.evidenceLevel}</span>}
                      </div>
                      {(candidate.target || candidate.rationale) && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--research-muted)]">{candidate.target ? `Target: ${candidate.target}` : candidate.rationale}</p>}
                      {onInvestigateCandidate && (
                        <button
                          type="button"
                          onClick={() => onInvestigateCandidate(candidate)}
                          disabled={investigatingCandidate === candidate}
                          className="mt-2 text-xs font-semibold text-[var(--research-primary)] disabled:opacity-60"
                        >
                          {investigatingCandidate === candidate ? 'Opening investigation…' : 'Investigate candidate + disease'}
                        </button>
                      )}
                    </div>
                    <div className="w-28 shrink-0 text-right sm:w-40">
                      <div className="flex items-center justify-between gap-2 text-xs text-[var(--research-muted)]"><span>Model score</span><strong className="font-mono text-[var(--research-prediction)]">{displayScore(score)}</strong></div>
                      <div className="research-score-track mt-2" aria-hidden="true"><span style={{ width: `${scoreWidth(score)}%` }} /></div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : <div className="research-result-empty mt-4"><Database className="h-5 w-5" />No candidate rows were returned by the model.</div>
        )}
      </section>

      {shadowPrediction && (
        <section className="research-ranking-panel" aria-labelledby="shadow-ranking-heading" data-testid="v5-shadow-ranking">
          <div className="research-result-section-heading">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="research-eyebrow mb-0">Shadow evaluation channel</p>
                <EvidenceModeBadge dataMode={shadowPrediction.dataMode} verificationStatus={shadowPrediction.verificationStatus} />
                <span className="research-id-label">Not primary</span>
              </div>
              <h3 id="shadow-ranking-heading" className="mt-2 flex items-center gap-2 text-base font-bold text-[var(--research-ink)]">
                <FlaskConical className="h-4 w-4 text-[var(--research-prediction)]" />
                Disease-conditioned frozen V5 shadow ranking
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--research-muted)]">
                {shadowPrediction.dataMode === 'MODEL_PREDICTION'
                  ? 'This disease-conditioned comparison cannot replace the primary ranker. The evidence-flow molecule does not affect its scores.'
                  : shadowPrediction.unavailableReason?.message || 'The shadow ranking is unavailable.'}
              </p>
            </div>
            {shadowPrediction.modelLineage?.graphDatasetVersion && (
              <span className="research-count-label">{shadowPrediction.modelLineage.graphDatasetVersion}</span>
            )}
          </div>

          {shadowPrediction.dataMode === 'MODEL_PREDICTION' && (
            shadowCandidates.length > 0 ? (
              <ol className="mt-4 divide-y divide-[var(--research-border)] overflow-hidden rounded-xl border border-[var(--research-border)] bg-[var(--research-surface)]">
                {shadowCandidates.map((candidate, index) => {
                  const score = candidateScore(candidate);
                  return (
                    <li key={candidate.drugId || candidate.drugName || index} className="research-ranking-row">
                      <span className="research-rank-number" aria-label={`Shadow rank ${candidate.rank || index + 1}`}>{candidate.rank || index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--research-ink)]">{candidateName(candidate)}</span>
                          {candidate.drugId && <span className="research-id-label">{candidate.drugId}</span>}
                          {candidate.evidenceLevel && <span className="research-id-label">{candidate.evidenceLevel}</span>}
                        </div>
                        {onInvestigateCandidate && (
                          <button
                            type="button"
                            onClick={() => onInvestigateCandidate(candidate)}
                            disabled={investigatingCandidate === candidate}
                            className="mt-2 text-xs font-semibold text-[var(--research-primary)] disabled:opacity-60"
                          >
                            {investigatingCandidate === candidate ? 'Opening investigation…' : 'Investigate candidate + disease'}
                          </button>
                        )}
                      </div>
                      <div className="w-28 shrink-0 text-right sm:w-40">
                        <div className="flex items-center justify-between gap-2 text-xs text-[var(--research-muted)]"><span>Shadow score</span><strong className="font-mono text-[var(--research-prediction)]">{displayScore(score)}</strong></div>
                        <div className="research-score-track mt-2" aria-hidden="true"><span style={{ width: `${scoreWidth(score)}%` }} /></div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : <div className="research-result-empty mt-4"><Database className="h-5 w-5" />No candidate rows were returned by the shadow model.</div>
          )}
        </section>
      )}
      </>}
    </div>
  );
};

export default LiveResearchSummary;
