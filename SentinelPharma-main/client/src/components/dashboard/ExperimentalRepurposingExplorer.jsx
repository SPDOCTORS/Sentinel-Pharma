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

  return <section className="research-lab-panel space-y-6">
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center text-xl font-bold tracking-tight text-white md:text-2xl"><FlaskConical className="w-6 h-6 mr-2 text-violet-300" />Experimental Drug Repurposing</h2>
        <span className="rounded-full border border-amber-300/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-100">Experimental · Research Use</span>
      </div>
      <p className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-50">Experimental research system. Model rankings are not probabilities and do not establish therapeutic efficacy or provide clinical advice.</p>
    </header>

    <form onSubmit={load} className="grid gap-3 md:grid-cols-[1fr_130px_auto]" aria-label="Experimental drug candidate search">
      <label className="grid gap-1 text-sm text-cyan-100">Drug canonical ID
        <input value={drugId} onChange={(event) => setDrugId(event.target.value)} className="rounded-xl border border-cyan-300/35 bg-slate-900/70 px-4 py-3 text-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="CHEMBL:CHEMBL1000" />
      </label>
      <label className="grid gap-1 text-sm text-cyan-100">Candidates
        <select value={topK} onChange={(event) => setTopK(Number(event.target.value))} className="rounded-xl border border-cyan-300/35 bg-slate-900/70 px-3 py-3 text-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-400">
          {[5, 10, 20, 50].map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
      </label>
      <button type="submit" disabled={loading || !drugId.trim()} className="self-end rounded-xl bg-violet-300 px-5 py-3 font-semibold text-slate-950 shadow-sm transition-colors hover:bg-violet-200 disabled:opacity-60">
        {loading ? <Loader2 className="w-5 h-5 animate-spin" aria-label="Loading candidates" /> : <span className="flex items-center gap-2"><Search className="w-4 h-4" />Load candidates</span>}
      </button>
    </form>
    {error && <p role="alert" className="rounded-xl border border-rose-300/35 bg-rose-500/15 p-3 text-rose-100"><AlertCircle className="inline w-4 h-4 mr-2" />{error}</p>}
    {loading && <div className="h-32 rounded-2xl animate-pulse bg-slate-800/60" aria-label="Loading experimental candidates" />}
    {!loading && !results && !error && <p className="rounded-xl border border-dashed border-cyan-300/30 p-5 text-cyan-100/75">Enter a canonical drug ID to explore frozen experimental candidates. CETIRIZINE is available as <strong>CHEMBL:CHEMBL1000</strong>.</p>}

    {results && <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
      <div className="space-y-5">
        <section aria-labelledby="known-indications-heading" className="rounded-2xl border border-emerald-300/25 bg-slate-950/35 p-4">
          <h3 id="known-indications-heading" className="font-bold text-emerald-100">Known Indications <span className="text-sm font-normal">({known?.indicationCount ?? 0})</span></h3>
          {known?.indications?.length ? <ul className="mt-2 flex flex-wrap gap-2">{known.indications.map((item) => <li key={item.disease.id} className="rounded-lg bg-emerald-500/10 px-2 py-1 text-xs text-emerald-50">{item.disease.name || item.disease.id}</li>)}</ul> : <p className="mt-2 text-sm text-cyan-100/70">No known indications were returned.</p>}
        </section>
        <section aria-labelledby="candidate-heading" className="space-y-3">
          <div><h3 id="candidate-heading" className="font-bold text-cyan-100">Experimental Repurposing Candidates <span className="text-sm font-normal">({results.candidateCount})</span></h3><p className="text-xs text-cyan-100/65">Experimental model score is a ranking score, not a probability or measure of clinical efficacy.</p></div>
          {results.candidates?.length ? <ol className="space-y-2">{results.candidates.map((item) => <li key={item.candidate.disease.id}>
            <button type="button" onClick={() => choose(item.candidate)} className="w-full rounded-xl border border-cyan-300/25 bg-slate-900/60 p-4 text-left hover:bg-cyan-400/10 focus:outline-none focus:ring-2 focus:ring-cyan-300">
              <span className="flex items-start justify-between gap-3"><span><strong className="text-cyan-50">#{item.candidate.rank} {item.candidate.disease.name || item.candidate.disease.id}</strong><span className="block text-xs text-cyan-100/65 mt-1">{item.candidate.disease.id} · Unobserved candidate · Experimental model prediction</span></span><ChevronRight className="w-5 h-5 text-cyan-300" /></span>
              <span className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded bg-violet-500/15 px-2 py-1 text-violet-100">Experimental model score: {item.candidate.modelScore.toFixed(6)}</span><span className="rounded bg-slate-700/70 px-2 py-1 text-cyan-100">Structural lookup: {item.structuralEvidence.lookupStatus === 'AVAILABLE' ? 'Available' : 'Unavailable'}</span><span className="rounded bg-amber-500/15 px-2 py-1 text-amber-100">{item.structuralEvidence.supportStatus === 'NO_STRUCTURAL_SUPPORT' ? 'No direct structural support found' : 'Structural support found'}</span></span>
            </button>
          </li>)}</ol> : <p className="rounded-xl border border-dashed border-cyan-300/30 p-4 text-cyan-100/75">No experimental candidates were returned.</p>}
        </section>
      </div>
      <aside aria-live="polite" className="rounded-2xl border border-violet-300/25 bg-slate-950/45 p-4 space-y-4">
        <h3 className="font-bold text-violet-100">Candidate Detail</h3>
        {detailLoading && <div className="h-44 animate-pulse rounded-xl bg-slate-800/60" aria-label="Loading candidate detail" />}
        {!detailLoading && !selected && <p className="text-sm text-cyan-100/70">Select an experimental candidate to view prediction, structural evidence, external evidence, and provenance.</p>}
        {selected && <><section><h4 className="font-semibold text-cyan-100">Experimental Prediction</h4><p className="mt-1 text-sm text-cyan-50">#{selected.candidate.rank} {selected.candidate.disease.name || selected.candidate.disease.id}</p><p className="text-sm text-violet-100">Experimental model score: {selected.candidate.modelScore.toFixed(6)}</p><p className="text-xs text-cyan-100/65">Experimental model prediction · Unobserved candidate</p></section>
          <section className="border-t border-slate-700 pt-3"><h4 className="font-semibold text-cyan-100">Structural Evidence</h4><p className="text-sm text-cyan-100">Structural lookup: {selected.structuralEvidence.lookupStatus === 'AVAILABLE' ? 'Available' : 'Unavailable'}</p><p className="text-sm text-amber-100">Structural support: {selected.structuralEvidence.supportStatus === 'NO_STRUCTURAL_SUPPORT' ? 'No direct structural support found' : selected.structuralEvidence.supportStatus}</p>{selected.structuralEvidence.supportStatus === 'NO_STRUCTURAL_SUPPORT' ? <p className="mt-1 text-xs text-cyan-100/65">Structural lookup completed successfully, but no direct shared-target or frozen-pathway support was found for this candidate.</p> : <><p className="text-xs text-cyan-100/65">Shared targets: {selected.structuralEvidence.sharedTargetCount}</p><ul className="text-xs text-cyan-100/65">{selected.structuralEvidence.sharedTargets.map((target) => <li key={target.id}>{target.name || target.id}</li>)}</ul></>}<p className="mt-2 text-xs text-cyan-100/55">Source-backed structural graph: {selected.structuralEvidence.graphDatasetVersion}</p></section>
          <section className="border-t border-slate-700 pt-3"><h4 className="font-semibold text-cyan-100">External Evidence</h4><p className="text-sm text-cyan-100">PubMed: {externalState(selected.externalEvidence.pubmed)}</p><p className="text-sm text-cyan-100">ClinicalTrials.gov: {externalState(selected.externalEvidence.clinicalTrials)}</p><button type="button" onClick={searchEvidence} disabled={evidenceLoading} className="mt-3 rounded-lg border border-cyan-300/35 px-3 py-2 text-sm text-cyan-50 hover:bg-cyan-400/15 disabled:opacity-60">{evidenceLoading ? 'Searching external evidence…' : 'Search External Evidence'}</button></section>
          <details className="border-t border-slate-700 pt-3 text-xs text-cyan-100/65"><summary className="cursor-pointer font-semibold text-cyan-100">Provenance & limitations</summary><p className="mt-2">R-GCN on {selected.model.graphDatasetVersion}; structural evidence from {selected.structuralEvidence.graphDatasetVersion}. Model prediction is experimental. Structural support does not establish efficacy, and missing external records do not establish ineffectiveness.</p></details>
        </>}
      </aside>
    </div>}
  </section>;
}
