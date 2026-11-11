import React, { useState } from 'react';
import { AlertCircle, ChevronRight, FlaskConical, Loader2, Search } from 'lucide-react';

const messageForError = (error) => error?.response?.status === 404
  ? 'That drug or candidate was not found in the frozen experimental dataset.'
  : 'Experimental repurposing is currently unavailable. Please try again later.';

const externalState = (item) => {
  if (!item || item.error?.code === 'NOT_REQUESTED') return 'Not searched';
  if (item.dataMode === 'UNAVAILABLE') return 'Unavailable';
  return item.verificationStatus === 'VERIFIED_SOURCE' ? 'Verified source' : 'Source-backed';
};

export default function ExperimentalRepurposingExplorer({ service }) {
  const [drugId, setDrugId] = useState('CHEMBL:CHEMBL1000');
  const [topK, setTopK] = useState(10);
  const [results, setResults] = useState(null);
  const [known, setKnown] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async (event) => {
    event.preventDefault();
    if (!drugId.trim()) return;
    setLoading(true); setError(null); setResults(null); setKnown(null); setSelected(null);
    try {
      const [candidateResponse, knownResponse] = await Promise.all([
        service.experimentalCandidates(drugId.trim(), topK), service.experimentalKnownIndications(drugId.trim())
      ]);
      setResults(candidateResponse.data); setKnown(knownResponse.data);
    } catch (requestError) { setError(messageForError(requestError)); } finally { setLoading(false); }
  };

  const choose = async (candidate) => {
    setDetailLoading(true); setError(null);
    try {
      const response = await service.experimentalCandidateDetail(drugId.trim(), candidate.disease.id);
      setSelected(response.data);
    } catch (requestError) { setError(messageForError(requestError)); } finally { setDetailLoading(false); }
  };

  const searchEvidence = async () => {
    if (!selected) return;
    setEvidenceLoading(true); setError(null);
    try {
      const response = await service.experimentalEvidence(drugId.trim(), selected.candidate.disease.id);
      setSelected(response.data);
    } catch (requestError) { setError(messageForError(requestError)); } finally { setEvidenceLoading(false); }
  };

  return (
    <section className="research-panel space-y-5 animate-rise" aria-labelledby="experimental-repurposing-title">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="experimental-repurposing-title" className="flex items-center text-lg font-bold tracking-tight text-[var(--research-ink)] md:text-xl">
            <FlaskConical className="w-5 h-5 mr-2 text-[var(--research-primary)]" />
            Experimental Drug Repurposing
          </h2>
          <span className="rounded-full border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
            Experimental · Research Use
          </span>
        </div>
        <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <span>Experimental research system. Model rankings are not probabilities and do not establish therapeutic efficacy or provide clinical advice.</span>
        </div>
      </header>

      <form onSubmit={load} className="grid gap-3 md:grid-cols-[1fr_130px_auto]" aria-label="Experimental drug candidate search">
        <label className="research-field-label">
          Drug canonical ID
          <input
            value={drugId}
            onChange={(event) => setDrugId(event.target.value)}
            className="research-input text-xs"
            placeholder="CHEMBL:CHEMBL1000"
          />
        </label>
        <label className="research-field-label">
          Candidates
          <select
            value={topK}
            onChange={(event) => setTopK(Number(event.target.value))}
            className="research-input text-xs"
          >
            {[5, 10, 20, 50].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <button
          type="submit"
          disabled={loading || !drugId.trim()}
          className="research-primary-button self-end text-xs font-semibold px-4 py-2 h-auto min-h-[38px] disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-label="Loading candidates" />
          ) : (
            <span className="flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              Load candidates
            </span>
          )}
        </button>
      </form>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="h-28 rounded-lg animate-pulse bg-[var(--research-surface-muted)] border border-[var(--research-border)]" aria-label="Loading experimental candidates" />
      )}

      {!loading && !results && !error && (
        <div className="rounded-lg border border-dashed border-[var(--research-border-strong)] bg-[var(--research-surface-muted)] p-4 text-xs text-[var(--research-muted)]">
          Enter a canonical drug ID to explore frozen experimental candidates. CETIRIZINE is available as <strong className="text-[var(--research-ink)] font-semibold">CHEMBL:CHEMBL1000</strong>.
        </div>
      )}

      {results && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
          <div className="space-y-4">
            <section aria-labelledby="known-indications-heading" className="rounded-lg border border-[var(--research-border)] bg-[var(--research-surface)] p-3.5 space-y-2">
              <h3 id="known-indications-heading" className="text-xs font-bold uppercase tracking-wider text-[var(--research-muted)]">
                Known Indications <span className="font-normal lowercase">({known?.indicationCount ?? 0})</span>
              </h3>
              {known?.indications?.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {known.indications.map((item) => (
                    <li
                      key={item.disease.id}
                      className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200"
                    >
                      {item.disease.name || item.disease.id}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--research-muted)]">No known indications were returned.</p>
              )}
            </section>

            <section aria-labelledby="candidate-heading" className="space-y-3">
              <div>
                <h3 id="candidate-heading" className="text-sm font-bold text-[var(--research-ink)]">
                  Experimental Repurposing Candidates <span className="font-normal text-xs text-[var(--research-muted)]">({results.candidateCount})</span>
                </h3>
                <p className="text-xs text-[var(--research-muted)] mt-0.5">
                  Experimental model score is a ranking score, not a probability or measure of clinical efficacy.
                </p>
              </div>

              {results.candidates?.length ? (
                <ol className="space-y-2">
                  {results.candidates.map((item) => (
                    <li key={item.candidate.disease.id}>
                      <button
                        type="button"
                        onClick={() => choose(item.candidate)}
                        className="w-full rounded-lg border border-[var(--research-border)] bg-[var(--research-surface)] p-3 text-left hover:border-[var(--research-border-strong)] hover:bg-[var(--research-surface-muted)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--research-primary)]"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span>
                            <strong className="text-sm font-bold text-[var(--research-ink)]">
                              #{item.candidate.rank} {item.candidate.disease.name || item.candidate.disease.id}
                            </strong>
                            <span className="block text-xs text-[var(--research-muted)] mt-0.5">
                              {item.candidate.disease.id} · Unobserved candidate · Experimental model prediction
                            </span>
                          </span>
                          <ChevronRight className="w-4 h-4 text-[var(--research-muted)] shrink-0" />
                        </span>
                        <span className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
                          <span className="rounded-md border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                            Experimental model score: {item.candidate.modelScore.toFixed(6)}
                          </span>
                          <span className="rounded-md border border-[var(--research-border)] bg-[var(--research-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--research-muted)]">
                            Structural lookup: {item.structuralEvidence.lookupStatus === 'AVAILABLE' ? 'Available' : 'Unavailable'}
                          </span>
                          <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${item.structuralEvidence.supportStatus === 'NO_STRUCTURAL_SUPPORT' ? 'border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300' : 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'}`}>
                            {item.structuralEvidence.supportStatus === 'NO_STRUCTURAL_SUPPORT' ? 'No direct structural support found' : 'Structural support found'}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--research-border)] p-4 text-xs text-[var(--research-muted)]">
                  No experimental candidates were returned.
                </div>
              )}
            </section>
          </div>

          <aside aria-live="polite" className="rounded-lg border border-[var(--research-border)] bg-[var(--research-surface)] p-4 space-y-3.5 shadow-sm">
            <h3 className="text-sm font-bold text-[var(--research-ink)]">Candidate Detail</h3>
            {detailLoading && (
              <div className="h-44 animate-pulse rounded-lg bg-[var(--research-surface-muted)] border border-[var(--research-border)]" aria-label="Loading candidate detail" />
            )}
            {!detailLoading && !selected && (
              <p className="text-xs text-[var(--research-muted)] leading-relaxed">
                Select an experimental candidate to view prediction, structural evidence, external evidence, and provenance.
              </p>
            )}
            {selected && (
              <>
                <section className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--research-muted)]">Experimental Prediction</h4>
                  <p className="text-sm font-bold text-[var(--research-ink)]">
                    #{selected.candidate.rank} {selected.candidate.disease.name || selected.candidate.disease.id}
                  </p>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                    Experimental model score: {selected.candidate.modelScore.toFixed(6)}
                  </p>
                  <p className="text-xs text-[var(--research-muted)]">
                    Experimental model prediction · Unobserved candidate
                  </p>
                </section>

                <section className="border-t border-[var(--research-border)] pt-3 space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--research-muted)]">Structural Evidence</h4>
                  <p className="text-xs text-[var(--research-ink)]">
                    Structural lookup: {selected.structuralEvidence.lookupStatus === 'AVAILABLE' ? 'Available' : 'Unavailable'}
                  </p>
                  <p className="text-xs text-[var(--research-ink)]">
                    Structural support: {selected.structuralEvidence.supportStatus === 'NO_STRUCTURAL_SUPPORT' ? 'No direct structural support found' : selected.structuralEvidence.supportStatus}
                  </p>
                  {selected.structuralEvidence.supportStatus === 'NO_STRUCTURAL_SUPPORT' ? (
                    <p className="text-xs text-[var(--research-muted)]">
                      Structural lookup completed successfully, but no direct shared-target or frozen-pathway support was found for this candidate.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-[var(--research-muted)]">Shared targets: {selected.structuralEvidence.sharedTargetCount}</p>
                      <ul className="text-xs text-[var(--research-muted)] list-disc list-inside">
                        {selected.structuralEvidence.sharedTargets.map((target) => (
                          <li key={target.id}>{target.name || target.id}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p className="text-[11px] text-[var(--research-muted)] pt-1">
                    Source-backed structural graph: {selected.structuralEvidence.graphDatasetVersion}
                  </p>
                </section>

                <section className="border-t border-[var(--research-border)] pt-3 space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--research-muted)]">External Evidence</h4>
                  <p className="text-xs text-[var(--research-ink)]">
                    PubMed: {externalState(selected.externalEvidence.pubmed)}
                  </p>
                  <p className="text-xs text-[var(--research-ink)]">
                    ClinicalTrials.gov: {externalState(selected.externalEvidence.clinicalTrials)}
                  </p>
                  <button
                    type="button"
                    onClick={searchEvidence}
                    disabled={evidenceLoading}
                    className="research-secondary-button text-xs py-1.5 px-3 mt-2"
                  >
                    {evidenceLoading ? 'Searching external evidence…' : 'Search External Evidence'}
                  </button>
                </section>

                <details className="border-t border-[var(--research-border)] pt-2.5 text-xs text-[var(--research-muted)]">
                  <summary className="cursor-pointer font-semibold text-xs text-[var(--research-ink)] hover:text-[var(--research-primary)]">
                    Provenance &amp; limitations
                  </summary>
                  <p className="mt-1.5 leading-relaxed text-[11px]">
                    R-GCN on {selected.model.graphDatasetVersion}; structural evidence from {selected.structuralEvidence.graphDatasetVersion}. Model prediction is experimental. Structural support does not establish efficacy, and missing external records do not establish ineffectiveness.
                  </p>
                </details>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
