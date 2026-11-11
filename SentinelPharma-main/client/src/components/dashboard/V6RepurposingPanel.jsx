import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  BookOpen,
  Box,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  ExternalLink,
  FileText,
  Filter,
  FlaskConical,
  Info,
  Layers,
  Loader2,
  Microscope,
  Network,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import EmbeddedMoleculeViewer from './EmbeddedMoleculeViewer';

const PRESET_DISEASES = [
  { id: 'EFO:0000180', name: 'HIV-1 infection' },
  { id: 'EFO:0000195', name: 'Metabolic syndrome' },
  { id: 'EFO:0000266', name: 'Aortic stenosis' },
  { id: 'EFO:0000305', name: 'Breast carcinoma' },
  { id: 'EFO:0000249', name: "Alzheimer's disease" }
];

const formatRelationType = (type) => {
  if (!type) return 'Interaction';
  return String(type)
    .replace(/^DRUG_TARGET_/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatFeatureValue = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '0.0000';
  const num = Number(val);
  if (num === 0) return '0.0000';
  const abs = Math.abs(num);
  if (abs < 0.001) {
    return num.toExponential(3);
  }
  return num.toFixed(4);
};

export default function V6RepurposingPanel({
  service,
  onInvestigateCandidate,
  investigatingCandidate
}) {
  const [diseaseInput, setDiseaseInput] = useState('EFO:0000180');
  const [topK, setTopK] = useState(10);
  const [excludeKnown, setExcludeKnown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [statusMeta, setStatusMeta] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [dossierTab, setDossierTab] = useState('graph'); // 'graph' | 'literature' | 'structure'
  const [candidateEvidence, setCandidateEvidence] = useState({});
  const [candidateEvidenceLoading, setCandidateEvidenceLoading] = useState({});
  const [showMetadata, setShowMetadata] = useState(false);
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(false);

  // Fetch V6 manifest & graph status metadata on mount
  useEffect(() => {
    let isMounted = true;
    if (!service?.v6Status) return;
    const fetchStatus = async () => {
      try {
        const response = await service.v6Status();
        if (isMounted) {
          setStatusMeta(response.data);
        }
      } catch (err) {
        // Status fetch is non-blocking
        console.warn('V6 status check failed:', err);
      }
    };
    fetchStatus();
    return () => {
      isMounted = false;
    };
  }, [service]);

  const handleSearch = async (e, diseaseOverride = null) => {
    if (e?.preventDefault) e.preventDefault();
    const query = (diseaseOverride ?? diseaseInput).trim();
    if (!query) {
      setError('Please provide a valid disease name or canonical ID (e.g., EFO:0000180).');
      return;
    }
    if (!service?.v6Repurpose) {
      setError('Service unavailable.');
      return;
    }

    setLoading(true);
    setError(null);
    setExpandedRow(null);

    try {
      const response = await service.v6Repurpose(query, topK, excludeKnown);
      setData(response.data);
    } catch (err) {
      const respData = err?.response?.data;
      if (err?.response?.status === 404) {
        setError(
          respData?.error ||
            `Unsupported disease: '${query}' was not found in the frozen V6 biomedical graph. Try one of the indexed examples below.`
        );
      } else {
        setError(
          respData?.error ||
            'V6 Ranking Service is currently unavailable. Please verify the service connection and try again.'
        );
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePresetClick = (preset) => {
    setDiseaseInput(preset.id);
    handleSearch(null, preset.id);
  };

  const handleLoadEvidence = async (cand) => {
    const drugName = cand.drug?.name || cand.drug?.id;
    const diseaseName = data?.disease?.name || data?.disease?.id || diseaseInput;
    if (!drugName || !diseaseName) return;

    setCandidateEvidenceLoading((prev) => ({ ...prev, [drugName]: true }));
    try {
      if (service?.getCandidateEvidence) {
        const response = await service.getCandidateEvidence(
          drugName,
          diseaseName,
          cand.rankingScore,
          10
        );
        setCandidateEvidence((prev) => ({ ...prev, [drugName]: response.data }));
      } else {
        setCandidateEvidence((prev) => ({
          ...prev,
          [drugName]: { error: 'Evidence service unavailable.' }
        }));
      }
    } catch (err) {
      setCandidateEvidence((prev) => ({
        ...prev,
        [drugName]: {
          error: err.response?.data?.error?.message || err.message || 'Evidence is unavailable.'
        }
      }));
    } finally {
      setCandidateEvidenceLoading((prev) => ({ ...prev, [drugName]: false }));
    }
  };

  const handleInvestigateRow = (cand, index) => {
    if (expandedRow === index && dossierTab === 'literature') {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(index);
    setDossierTab('literature');
    const drugName = cand.drug?.name || cand.drug?.id;
    if (drugName && !candidateEvidence[drugName] && !candidateEvidenceLoading[drugName]) {
      handleLoadEvidence(cand);
    }
  };

  const handleInspectRow = (index) => {
    if (expandedRow === index) {
      setExpandedRow(null);
    } else {
      setExpandedRow(index);
      setDossierTab('graph');
    }
  };

  const toggleRowExpansion = (index) => {
    handleInspectRow(index);
  };

  const candidates = data?.candidates || [];

  return (
    <section
      className="research-panel space-y-5 animate-rise border border-[var(--research-border)] bg-[var(--research-surface)] rounded-xl p-5 shadow-sm"
      aria-labelledby="v6-repurposing-title"
    >
      {/* Header */}
      <header className="space-y-3 border-b border-[var(--research-border)] pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
              <Network className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  id="v6-repurposing-title"
                  className="text-base font-bold text-[var(--research-ink)] md:text-lg"
                >
                  V6 Connectivity-Aware Hybrid Drug Repurposing
                </h3>
                <span className="rounded-full border border-teal-300 dark:border-teal-700/60 bg-teal-50 dark:bg-teal-950/40 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 dark:text-teal-200">
                  V6 Locked Evaluation Model
                </span>
                <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                  Disease-First
                </span>
              </div>
              <p className="text-xs text-[var(--research-muted)] mt-0.5">
                Ranks candidate drugs from disease input using the frozen connectivity-aware bilinear interaction hybrid (2-Hop + Disease Popularity + R-GCN).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowMetadata(!showMetadata)}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--research-muted)] hover:text-[var(--research-ink)] bg-[var(--research-surface-muted)] hover:bg-slate-200/60 dark:hover:bg-slate-700/60 px-2.5 py-1.5 rounded-lg border border-[var(--research-border)] transition-colors"
              title="Toggle frozen manifest and graph provenance details"
            >
              <Database className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
              <span>Manifest & Specs</span>
              {showMetadata ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* Collapsible Model & Manifest Metadata */}
        {showMetadata && (
          <div className="mt-3 rounded-lg border border-[var(--research-border)] bg-[var(--research-surface-muted)] p-3 text-xs text-[var(--research-muted)] space-y-2">
            <div className="font-semibold text-[var(--research-ink)] flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-teal-600" />
              <span>Frozen Model & Evaluation Manifest Specification</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="font-medium text-[var(--research-ink)]">Manifest:</span>{' '}
                <span className="font-mono text-[10px]">
                  {statusMeta?.manifest?.manifestVersion || 'v6-locked-final-test-evaluation-manifest-v1'}
                </span>
              </div>
              <div>
                <span className="font-medium text-[var(--research-ink)]">Biomedical Graph:</span>{' '}
                <span>
                  {statusMeta?.biomedicalGraph?.numEntities?.toLocaleString() || '12,985'} nodes ·{' '}
                  {statusMeta?.biomedicalGraph?.numRelations?.toLocaleString() || '109,007'} edges
                </span>
              </div>
              <div>
                <span className="font-medium text-[var(--research-ink)]">Graph Coverage:</span>{' '}
                <span>
                  {statusMeta?.biomedicalGraph?.numDrugs?.toLocaleString() || '6,057'} drugs ·{' '}
                  {statusMeta?.biomedicalGraph?.numDiseases?.toLocaleString() || '2,605'} diseases
                </span>
              </div>
              <div>
                <span className="font-medium text-[var(--research-ink)]">Primary Checkpoint:</span>{' '}
                <span>Seed {statusMeta?.model?.checkpoint?.seed || 42} (Frozen weights)</span>
              </div>
            </div>
          </div>
        )}

        {/* Compact Experimental Disclaimer Banner with Expandable Details */}
        <div className="rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/90 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-semibold text-amber-950 dark:text-amber-100 mr-1.5">
                  Experimental Research System · Model Predictions Only:
                </span>
                <span className="text-[11px] text-amber-900/90 dark:text-amber-200/90">
                  Scores indicate uncalibrated relative ranking order (not clinical probabilities). Graph paths reflect multi-hop network connectivity.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDisclaimerExpanded(!disclaimerExpanded)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100 hover:underline px-1.5 py-0.5 rounded transition-colors"
              aria-expanded={disclaimerExpanded}
            >
              <span>{disclaimerExpanded ? 'Hide Details' : 'Details'}</span>
              {disclaimerExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {disclaimerExpanded && (
            <div className="mt-2.5 pt-2 border-t border-amber-200 dark:border-amber-800/60 text-[11px] space-y-1.5 text-amber-900/90 dark:text-amber-200/90 animate-rise">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Uncalibrated Relative Ranking Scores:</strong> Output scores represent monotonic ranking values reflecting relative candidate prioritization for the queried disease. They are <em>not</em> calibrated probabilities of clinical efficacy, therapeutic outcome, or FDA approval.
                </li>
                <li>
                  <strong>Curated Labels Semantics:</strong> A candidate marked as <em>Unobserved in Reference Graph</em> indicates absence from curated ChEMBL/OpenTargets labels in the training graph, and does <em>not</em> denote therapeutic novelty, clinical efficacy, or lack of efficacy.
                </li>
                <li>
                  <strong>Computational Graph Evidence:</strong> Shared-target paths (Drug &rarr; Target &rarr; Disease) represent multi-hop computational graph connectivity, <em>not</em> clinical proof of therapeutic mechanism.
                </li>
              </ul>
            </div>
          )}
        </div>
      </header>

      {/* Disease Search & Filter Controls */}
      <form onSubmit={handleSearch} className="space-y-3" aria-label="V6 disease candidate search">
        <div className="grid gap-3 sm:grid-cols-[1fr_170px_auto]">
          <div>
            <label htmlFor="v6-disease-input" className="research-field-label text-xs">
              Disease Name or Canonical ID
            </label>
            <div className="relative mt-1">
              <input
                id="v6-disease-input"
                type="text"
                value={diseaseInput}
                onChange={(e) => setDiseaseInput(e.target.value)}
                placeholder="e.g. EFO:0000180 or HIV-1 infection"
                className="research-input text-xs py-2"
                style={{ paddingLeft: '2.25rem' }}
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--research-muted)] pointer-events-none" />
            </div>
          </div>

          <div>
            <label htmlFor="v6-topk-select" className="research-field-label text-xs">
              Top Candidates
            </label>
            <select
              id="v6-topk-select"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="research-input text-xs mt-1 py-2"
            >
              <option value={10}>Top 10 candidates</option>
              <option value={20}>Top 20 candidates</option>
              <option value={50}>Top 50 candidates</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading || !diseaseInput.trim()}
              className="research-primary-button w-full sm:w-auto text-xs font-semibold px-4 py-2 h-[38px] disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Ranking...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5" />
                  <span>Rank Candidates</span>
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter Switch & Quick Example Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Preset Chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--research-muted)]">
            <span className="text-[11px] font-medium mr-1">Examples:</span>
            {PRESET_DISEASES.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                  diseaseInput === preset.id || diseaseInput.toLowerCase() === preset.name.toLowerCase()
                    ? 'border-teal-400 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 font-semibold'
                    : 'border-[var(--research-border)] bg-[var(--research-surface)] hover:bg-[var(--research-surface-muted)] text-[var(--research-ink)]'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>

          {/* Exclude Known Indications Toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--research-ink)] select-none">
            <input
              type="checkbox"
              checked={excludeKnown}
              onChange={(e) => setExcludeKnown(e.target.checked)}
              className="rounded border-[var(--research-border-strong)] text-teal-600 focus:ring-teal-500 h-3.5 w-3.5"
            />
            <span className="text-[11px] font-medium text-[var(--research-ink)] flex items-center gap-1">
              <Filter className="w-3 h-3 text-[var(--research-muted)]" />
              Filter curated reference indications
            </span>
          </label>
        </div>
      </form>

      {/* Error Notice */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-200 flex items-start gap-2.5 animate-rise"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Query Resolution Error</p>
            <p className="text-[11px] leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Results View */}
      {data && !loading && (
        <div className="space-y-4 pt-2 animate-rise">
          {/* Query Summary Stats Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--research-surface-muted)] border border-[var(--research-border)] rounded-lg p-3 text-xs">
            <div className="flex items-center gap-3">
              <div>
                <span className="text-[var(--research-muted)]">Queried Disease:</span>{' '}
                <span className="font-semibold text-[var(--research-ink)]">
                  {data.disease?.name}
                </span>{' '}
                <span className="font-mono text-[10px] text-[var(--research-muted)]">
                  ({data.disease?.id})
                </span>
              </div>
              <div className="hidden sm:inline-block h-3 w-px bg-[var(--research-border)]" />
              <div className="hidden sm:block">
                <span className="text-[var(--research-muted)]">Training Popularity:</span>{' '}
                <span className="font-medium text-[var(--research-ink)]">
                  {data.disease?.trainingPopularity ?? 0} indications
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-[var(--research-muted)]">
              <span>
                Total Candidate Pool: <strong className="text-[var(--research-ink)]">{data.totalCandidatesScored?.toLocaleString() || 6057} drugs</strong>
              </span>
              <span>&bull;</span>
              <span>
                Showing Top: <strong className="text-[var(--research-ink)]">{candidates.length}</strong>
              </span>
            </div>
          </div>

          {/* Compact Candidate Table */}
          <div className="overflow-x-auto rounded-lg border border-[var(--research-border)] bg-[var(--research-surface)]">
            <table className="w-full text-left text-xs" aria-label="V6 Ranked Candidates">
              <thead className="bg-[var(--research-surface-muted)] text-[var(--research-muted)] text-[11px] font-semibold uppercase tracking-wider border-b border-[var(--research-border)]">
                <tr>
                  <th scope="col" className="px-3.5 py-2.5 w-14 text-center">
                    Rank
                  </th>
                  <th scope="col" className="px-3.5 py-2.5">
                    Candidate Drug
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 w-44">
                    <div className="flex flex-col">
                      <span>Relative Score</span>
                      <span className="text-[9px] font-normal lowercase tracking-normal text-[var(--research-muted)]">
                        (uncalibrated)
                      </span>
                    </div>
                  </th>
                  <th scope="col" className="px-3.5 py-2.5">
                    Connectivity
                  </th>
                  <th scope="col" className="px-3.5 py-2.5">
                    Curated Status
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 text-right w-48">
                    Evidence &amp; Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--research-border)] text-[var(--research-ink)]">
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--research-muted)]">
                      No candidate drugs met the specified filters. Try disabling "Filter curated reference indications".
                    </td>
                  </tr>
                ) : (
                  candidates.map((cand, idx) => {
                    const isExpanded = expandedRow === idx;
                    const isConnected = cand.isTwoHopConnected;
                    const isCurated = cand.isKnownIndication;
                    const candDrug = cand.drug?.name || cand.drug?.id;
                    const diseaseName = data.disease?.name || data.disease?.id || diseaseInput;
                    const evidenceData = candidateEvidence[candDrug];
                    const isEvidenceLoading = Boolean(candidateEvidenceLoading[candDrug]);

                    return (
                      <React.Fragment key={cand.drug?.id || idx}>
                        <tr
                          className={`transition-colors hover:bg-[var(--research-surface-muted)]/70 ${
                            isExpanded ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''
                          }`}
                        >
                          {/* Rank */}
                          <td className="px-3.5 py-2.5 text-center font-bold text-[var(--research-muted)]">
                            #{cand.rank}
                          </td>

                          {/* Drug Name & Canonical ID */}
                          <td className="px-3.5 py-2.5">
                            <div className="font-semibold text-[var(--research-ink)]">
                              {cand.drug?.name || 'Unknown Compound'}
                            </div>
                            <div className="font-mono text-[10px] text-[var(--research-muted)]">
                              {cand.drug?.id}
                            </div>
                          </td>

                          {/* Relative Ranking Score */}
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-2">
                              <span
                                className="font-mono font-semibold text-xs text-teal-700 dark:text-teal-400"
                                title="Uncalibrated candidate relative score (higher indicates higher model preference, not a probability)"
                              >
                                {cand.rankingScore?.toFixed(4)}
                              </span>
                              <div
                                className="w-16 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
                                title={`Relative Score: ${cand.rankingScore?.toFixed(4)} (Logit: ${cand.logit?.toFixed(3)}). Uncalibrated ranking metric for comparative sorting; not a probability.`}
                              >
                                <div
                                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(100, Math.max(5, (cand.rankingScore || 0) * 100))}%`
                                  }}
                                />
                              </div>
                            </div>
                            <span
                              className="text-[10px] text-[var(--research-muted)] block"
                              title="Raw model output logit before sigmoid. Used solely for relative rank ordering."
                            >
                              Logit: {cand.logit?.toFixed(3)} &bull; uncalibrated
                            </span>
                          </td>

                          {/* Connectivity */}
                          <td className="px-3.5 py-2.5">
                            {isConnected ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <Network className="w-3.5 h-3.5 text-emerald-600" />
                                Connected ({cand.sharedTargetCount} target{cand.sharedTargetCount === 1 ? '' : 's'})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                Disconnected (0 targets)
                              </span>
                            )}
                          </td>

                          {/* Indication Status Badge */}
                          <td className="px-3.5 py-2.5">
                            {isCurated ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                title="Candidate pair is documented in curated reference datasets (ChEMBL indications / OpenTargets)."
                              >
                                <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                Curated Reference
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                title="Candidate pair is absent from curated reference datasets. Does not denote therapeutic novelty or lack of efficacy."
                              >
                                <Info className="w-3 h-3 text-amber-600" />
                                Unobserved in Graph
                              </span>
                            )}
                          </td>

                          {/* Evidence & Investigate Actions */}
                          <td className="px-3.5 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleInvestigateRow(cand, idx)}
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded transition-colors ${
                                  isExpanded && dossierTab === 'literature'
                                    ? 'bg-teal-700 text-white shadow-xs'
                                    : 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs'
                                }`}
                                aria-label={`Investigate candidate ${cand.drug?.name || cand.drug?.id}`}
                                title="Open investigation dossier with literature, clinical trials, and 3D evidence"
                              >
                                <Microscope className="w-3.5 h-3.5" />
                                <span>Investigate</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleInspectRow(idx)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--research-muted)] hover:text-[var(--research-ink)] bg-[var(--research-surface-muted)] hover:bg-slate-200/60 dark:hover:bg-slate-700/60 px-2 py-1 rounded border border-[var(--research-border)] transition-colors"
                                aria-expanded={isExpanded}
                                aria-label={`Inspect dossier for ${cand.drug?.name || cand.drug?.id}`}
                                title={isExpanded ? 'Collapse dossier' : 'Inspect dossier & graph evidence'}
                              >
                                <span>Inspect</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Candidate Investigation Dossier */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80 dark:bg-slate-900/40">
                            <td colSpan={6} className="px-4 py-4 space-y-4">
                              <div className="rounded-xl border border-[var(--research-border)] bg-[var(--research-surface)] p-4 space-y-4 shadow-sm">
                                {/* Dossier Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--research-border)] pb-3">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--research-surface-muted)] text-[var(--research-muted)] border border-[var(--research-border)]">
                                        Candidate #{cand.rank}
                                      </span>
                                      <h4 className="text-base font-bold text-[var(--research-ink)]">
                                        {cand.drug?.name || 'Unknown Compound'}
                                      </h4>
                                      <span className="font-mono text-xs text-[var(--research-muted)]">
                                        ({cand.drug?.id})
                                      </span>
                                      <span className="text-[11px] px-2 py-0.5 rounded-md border font-semibold bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 border-teal-200 dark:border-teal-800">
                                        Score: {formatFeatureValue(cand.rankingScore)} (uncalibrated)
                                      </span>
                                      {isCurated ? (
                                        <span className="text-[11px] px-2 py-0.5 rounded-md border font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 inline-flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                          Curated Reference
                                        </span>
                                      ) : (
                                        <span className="text-[11px] px-2 py-0.5 rounded-md border font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 inline-flex items-center gap-1">
                                          <Info className="w-3 h-3 text-amber-600" />
                                          Unobserved in Graph
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-[var(--research-muted)]">
                                      Investigation dossier for pair: <strong className="text-[var(--research-ink)] font-semibold">{candDrug}</strong> + <strong className="text-[var(--research-ink)] font-semibold">{diseaseName}</strong>
                                    </p>
                                  </div>

                                  {/* Live Multi-Agent Investigation Action */}
                                  {onInvestigateCandidate && (
                                    <div className="flex items-center gap-2 self-start sm:self-auto">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const candidatePayload = {
                                            drug: candDrug,
                                            drugName: cand.drug?.name || candDrug,
                                            drugId: cand.drug?.id,
                                            canonicalDrugId: cand.drug?.id,
                                            disease: diseaseName,
                                            diseaseName: data.disease?.name || diseaseName,
                                            diseaseId: data.disease?.id,
                                            canonicalDiseaseId: data.disease?.id,
                                            target: cand.sharedTargets?.[0]?.targetName || cand.sharedTargets?.[0]?.targetId || 'Multiple reference targets',
                                            score: cand.rankingScore,
                                            interaction: cand.interaction || {
                                              dataMode: 'UNAVAILABLE',
                                              unavailableReason: {
                                                message: 'No verified drug/target-to-PDB mapping with provenance is available for this experimental V6 candidate.'
                                              }
                                            }
                                          };
                                          onInvestigateCandidate(candidatePayload, diseaseName);
                                        }}
                                        disabled={
                                          investigatingCandidate?.drug === candDrug ||
                                          investigatingCandidate?.drugName === candDrug
                                        }
                                        className="research-primary-button text-xs py-1.5 px-3.5 inline-flex items-center gap-1.5 shrink-0"
                                      >
                                        <Brain className="w-3.5 h-3.5" />
                                        <span>
                                          {investigatingCandidate?.drug === candDrug ||
                                          investigatingCandidate?.drugName === candDrug
                                            ? 'Opening Live Investigation…'
                                            : 'Launch Full Live Investigation'}
                                        </span>
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Dossier Navigation Tabs */}
                                <div className="border-b border-[var(--research-border)]">
                                  <nav className="flex gap-2" aria-label="Candidate dossier tabs">
                                    <button
                                      type="button"
                                      onClick={() => setDossierTab('literature')}
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
                                        dossierTab === 'literature'
                                          ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                                          : 'border-transparent text-[var(--research-muted)] hover:text-[var(--research-ink)]'
                                      }`}
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      <span>Literature &amp; Clinical Trials</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDossierTab('graph')}
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
                                        dossierTab === 'graph'
                                          ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                                          : 'border-transparent text-[var(--research-muted)] hover:text-[var(--research-ink)]'
                                      }`}
                                    >
                                      <Network className="w-3.5 h-3.5" />
                                      <span>Knowledge Graph &amp; Model Decomposition</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDossierTab('structure')}
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
                                        dossierTab === 'structure'
                                          ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                                          : 'border-transparent text-[var(--research-muted)] hover:text-[var(--research-ink)]'
                                      }`}
                                    >
                                      <Box className="w-3.5 h-3.5" />
                                      <span>Verified 3D Structure</span>
                                    </button>
                                  </nav>
                                </div>

                                {/* Tab 1: Literature & Clinical Trials */}
                                {dossierTab === 'literature' && (
                                  <div className="space-y-3 pt-1 text-xs">
                                    {/* Model Prediction Attribution Notice */}
                                    <div className="rounded-md border border-teal-300/30 bg-teal-500/5 dark:bg-teal-950/20 p-2.5 text-xs">
                                      <div className="font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5" />
                                        <span>MODEL PREDICTION · V6 CONNECTIVITY-AWARE HYBRID</span>
                                      </div>
                                      <div className="text-[var(--research-muted)] mt-0.5">
                                        Uncalibrated relative ranking score: {formatFeatureValue(cand.rankingScore)} (logit: {cand.logit?.toFixed(3)}). This ranking score prioritizes candidate hypotheses within the 6,057-drug graph space; it does not constitute clinical proof of efficacy.
                                      </div>
                                    </div>

                                    {/* Loading State */}
                                    {isEvidenceLoading && (
                                      <div className="flex items-center justify-center p-6 gap-2 text-xs text-[var(--research-muted)] bg-[var(--research-surface-muted)] rounded-lg border border-[var(--research-border)]">
                                        <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                                        <span>Searching PubMed literature archives and ClinicalTrials.gov registries...</span>
                                      </div>
                                    )}

                                    {/* Error State */}
                                    {evidenceData?.error && !isEvidenceLoading && (
                                      <div className="rounded-md border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
                                        <span>Evidence retrieval notice: {evidenceData.error}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleLoadEvidence(cand)}
                                          className="underline font-semibold ml-2 hover:text-rose-900"
                                        >
                                          Retry
                                        </button>
                                      </div>
                                    )}

                                    {/* Trigger load button if not loaded yet */}
                                    {!evidenceData && !isEvidenceLoading && (
                                      <div className="p-4 rounded-lg border border-dashed border-[var(--research-border)] text-center space-y-2">
                                        <p className="text-[var(--research-muted)]">
                                          Biomedical literature and clinical trials evidence have not yet been queried for this pair.
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() => handleLoadEvidence(cand)}
                                          className="research-secondary-button text-xs py-1.5 px-3 inline-flex items-center gap-1"
                                        >
                                          <BookOpen className="w-3.5 h-3.5" />
                                          <span>Query PubMed &amp; ClinicalTrials.gov</span>
                                        </button>
                                      </div>
                                    )}

                                    {/* Loaded Evidence */}
                                    {evidenceData && !isEvidenceLoading && !evidenceData.error && (() => {
                                      const lit = evidenceData.literatureEvidence || [];
                                      const trials = evidenceData.clinicalTrialEvidence || [];
                                      const evidenceLinks = evidenceData.candidateEvidence?.evidenceLinks || [];

                                      // Helper to find relevance link classification for a record
                                      const findEvidenceLink = (evidenceId, altId) => {
                                        return evidenceLinks.find(
                                          (link) => link.evidenceId === evidenceId || link.evidenceId === altId || (altId && String(link.evidenceId || '').includes(altId))
                                        );
                                      };

                                      return (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          {/* PubMed Literature Section */}
                                          <div className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/20 p-3 space-y-2">
                                            <div className="flex items-center justify-between pb-1 border-b border-blue-200/50 dark:border-blue-800/40">
                                              <div className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 text-xs">
                                                <BookOpen className="w-3.5 h-3.5" />
                                                <span>PubMed Literature ({lit.length} records)</span>
                                              </div>
                                              <span className="text-[10px] text-[var(--research-muted)]">
                                                Source: NCBI PubMed
                                              </span>
                                            </div>
                                            <p className="text-[10px] text-[var(--research-muted)] italic">
                                              Exact relevance tags reflect documented co-mentions; biomedical literature context does not prove therapeutic efficacy.
                                            </p>

                                            {lit.length > 0 ? (
                                              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                {lit.slice(0, 5).map((paper, pIdx) => {
                                                  const paperTitle = paper.claim || paper.title || 'Biomedical research article';
                                                  const pmid = paper.sourceId || paper.pmid;
                                                  const rawId = paper.id || (pmid ? `PMID:${pmid}` : null);
                                                  const link = findEvidenceLink(rawId, pmid);
                                                  const linkStatus = link?.linkStatus || 'DIRECT_MATCH';
                                                  const relType = link?.relationshipType || 'DRUG_DISEASE_CO_MENTION';
                                                  const journal = paper.metadata?.journal || paper.journal || paper.source;
                                                  const year = paper.publishedAt || paper.year;
                                                  const authors = paper.metadata?.authors || paper.authors || [];
                                                  const pubmedUrl = paper.sourceUrl || (pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null);

                                                  return (
                                                    <div
                                                      key={pmid || pIdx}
                                                      className="bg-[var(--research-surface)] border border-[var(--research-border)] rounded p-2 text-xs space-y-1.5"
                                                    >
                                                      <div className="flex items-start justify-between gap-2">
                                                        <div className="font-semibold text-[var(--research-ink)]">
                                                          {paperTitle}
                                                        </div>
                                                        {linkStatus === 'DIRECT_MATCH' ? (
                                                          <span
                                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 shrink-0 border border-emerald-200 dark:border-emerald-800"
                                                            title="Direct Drug–Disease Co-mention: Document explicitly references both candidate drug and target disease."
                                                          >
                                                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                                            Direct Co-mention
                                                          </span>
                                                        ) : linkStatus === 'PARTIAL_MATCH' ? (
                                                          <span
                                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 shrink-0 border border-amber-200 dark:border-amber-800"
                                                            title="Partial Mention: References drug only or disease only. Not direct supporting pair evidence."
                                                          >
                                                            <Info className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                                            {relType === 'DRUG_MENTION' ? 'Drug Mention Only' : relType === 'DISEASE_MENTION' ? 'Disease Mention Only' : 'Partial Match'}
                                                          </span>
                                                        ) : (
                                                          <span
                                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0 border border-slate-200 dark:border-slate-700"
                                                            title="Unverified / Exploratory context: General query match without confirmed co-mention."
                                                          >
                                                            <AlertCircle className="w-2.5 h-2.5 text-slate-500" />
                                                            Unverified Context
                                                          </span>
                                                        )}
                                                      </div>
                                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--research-muted)]">
                                                        {journal && (
                                                          <span>
                                                            {journal} {year ? `(${year})` : ''}
                                                          </span>
                                                        )}
                                                        {authors?.length > 0 && (
                                                          <span>
                                                            {authors.slice(0, 2).join(', ')}
                                                            {authors.length > 2 ? ' et al.' : ''}
                                                          </span>
                                                        )}
                                                        {pubmedUrl && (
                                                          <a
                                                            href={pubmedUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-teal-600 dark:text-teal-400 hover:underline font-mono inline-flex items-center gap-0.5 ml-auto font-medium"
                                                          >
                                                            PMID: {pmid || 'PubMed'}{' '}
                                                            <ExternalLink className="w-2.5 h-2.5" />
                                                          </a>
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <div className="rounded border border-dashed border-slate-300 dark:border-slate-700 bg-[var(--research-surface)] p-3 text-[11px] text-[var(--research-muted)]">
                                                <div className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                                                  Literature Status: UNAVAILABLE
                                                </div>
                                                No indexed biomedical literature co-mentioning "{candDrug}" and "{diseaseName}" was located in PubMed reference archives.
                                              </div>
                                            )}
                                          </div>

                                          {/* ClinicalTrials.gov Section */}
                                          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/20 p-3 space-y-2">
                                            <div className="flex items-center justify-between pb-1 border-b border-emerald-200/50 dark:border-emerald-800/40">
                                              <div className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 text-xs">
                                                <FlaskConical className="w-3.5 h-3.5" />
                                                <span>ClinicalTrials.gov ({trials.length} records)</span>
                                              </div>
                                              <span className="text-[10px] text-[var(--research-muted)]">
                                                Source: ClinicalTrials.gov
                                              </span>
                                            </div>
                                            <p className="text-[10px] text-[var(--research-muted)] italic">
                                              Exact trial match tags reflect protocol conditions; exploratory matches are not clinical proof of efficacy.
                                            </p>

                                            {trials.length > 0 ? (
                                              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                {trials.slice(0, 5).map((trial, tIdx) => {
                                                  const trialId =
                                                    trial.sourceId || trial.nctId || `Trial-${tIdx + 1}`;
                                                  const rawId = trial.id || (trialId ? `NCT:${trialId}` : null);
                                                  const link = findEvidenceLink(rawId, trialId);
                                                  const linkStatus = link?.linkStatus || 'DIRECT_MATCH';
                                                  const relType = link?.relationshipType || 'CLINICAL_TRIAL_MATCH';
                                                  const status =
                                                    trial.metadata?.overallStatus ||
                                                    trial.status ||
                                                    'Status unavailable';
                                                  const phases = trial.metadata?.phases?.length
                                                    ? trial.metadata.phases.join(', ')
                                                    : trial.phase;

                                                  return (
                                                    <div
                                                      key={trialId}
                                                      className="bg-[var(--research-surface)] border border-[var(--research-border)] rounded p-2 text-xs space-y-1.5"
                                                    >
                                                      <div className="flex items-start justify-between gap-2">
                                                        <span className="font-semibold text-[var(--research-ink)]">
                                                          {trialId} &bull;{' '}
                                                          {trial.claim || trial.title || 'Clinical Study'}
                                                        </span>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                          {phases && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                                                              {phases}
                                                            </span>
                                                          )}
                                                          {linkStatus === 'DIRECT_MATCH' ? (
                                                            <span
                                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-800"
                                                              title="Direct Study Match: Protocol directly pairs this candidate drug with the queried disease condition."
                                                            >
                                                              <CheckCircle2 className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400" />
                                                              Direct Study Match
                                                            </span>
                                                          ) : linkStatus === 'PARTIAL_MATCH' ? (
                                                            <span
                                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                                                              title="Partial Match: Study investigates the drug or condition separately. Not direct supporting pair evidence."
                                                            >
                                                              <Info className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                                              {relType === 'DRUG_MENTION' ? 'Drug Match Only' : relType === 'DISEASE_MENTION' ? 'Condition Match Only' : 'Partial Trial Match'}
                                                            </span>
                                                          ) : (
                                                            <span
                                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                                              title="Unverified / Exploratory Match: Study record does not confirm direct pair pairing."
                                                            >
                                                              <AlertCircle className="w-2.5 h-2.5 text-slate-500" />
                                                              Unverified Record
                                                            </span>
                                                          )}
                                                        </div>
                                                      </div>
                                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--research-muted)]">
                                                        <span>
                                                          Status:{' '}
                                                          <strong className="text-[var(--research-ink)]">
                                                            {status}
                                                          </strong>
                                                        </span>
                                                        <span>
                                                          Results Posted:{' '}
                                                          {trial.metadata?.hasResults === true
                                                            ? 'Yes'
                                                            : trial.metadata?.hasResults === false
                                                            ? 'No'
                                                            : 'Unavailable'}
                                                        </span>
                                                        {trial.sourceUrl && (
                                                          <a
                                                            href={trial.sourceUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5 font-medium ml-auto"
                                                          >
                                                            Open ClinicalTrials.gov{' '}
                                                            <ExternalLink className="w-2.5 h-2.5" />
                                                          </a>
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <div className="rounded border border-dashed border-slate-300 dark:border-slate-700 bg-[var(--research-surface)] p-3 text-[11px] text-[var(--research-muted)]">
                                                <div className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                                                  Clinical Trials Status: UNAVAILABLE
                                                </div>
                                                No clinical trial registrations evaluating "{candDrug}" for "{diseaseName}" were located on ClinicalTrials.gov.
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}

                                {/* Tab 2: Knowledge Graph & Model Decomposition */}
                                {dossierTab === 'graph' && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Left Column: Shared-Target Computational Graph Evidence */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between border-b border-[var(--research-border)] pb-1.5">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--research-ink)]">
                                          <Network className="w-3.5 h-3.5 text-teal-600" />
                                          <span>Computational Graph Evidence Paths</span>
                                        </div>
                                        <span className="text-[10px] text-[var(--research-muted)]">
                                          Drug &rarr; Shared Target &rarr; Disease
                                        </span>
                                      </div>

                                      {isConnected && cand.sharedTargets?.length > 0 ? (
                                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                          {cand.sharedTargets.map((st, sIdx) => (
                                            <div
                                              key={st.targetId || sIdx}
                                              className="rounded border border-[var(--research-border)] bg-[var(--research-surface)] p-2 text-xs space-y-1"
                                            >
                                              <div className="flex items-center justify-between">
                                                <span className="font-semibold text-[var(--research-ink)]">
                                                  {st.targetName || st.targetId}
                                                </span>
                                                <span className="font-mono text-[9px] text-[var(--research-muted)]">
                                                  {st.targetId}
                                                </span>
                                              </div>
                                              <div className="grid grid-cols-3 gap-2 text-[10px] text-[var(--research-muted)]">
                                                <div>
                                                  Type:{' '}
                                                  <span className="font-semibold text-teal-700 dark:text-teal-300">
                                                    {formatRelationType(st.drugRelationType)}
                                                  </span>
                                                </div>
                                                <div>
                                                  Drug Weight:{' '}
                                                  <span className="font-mono font-medium text-[var(--research-ink)]">
                                                    {st.drugTargetWeight?.toFixed(2) ?? '1.00'}
                                                  </span>
                                                </div>
                                                <div>
                                                  Path Contrib:{' '}
                                                  <span className="font-mono font-medium text-[var(--research-ink)]">
                                                    {formatFeatureValue(st.pathContribution)}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="rounded border border-dashed border-[var(--research-border)] p-3 text-[11px] text-[var(--research-muted)] bg-[var(--research-surface)]">
                                          No direct 2-hop shared targets found in reference graph. Candidate ranking score is driven by global graph topology (R-GCN embeddings) and disease background popularity.
                                        </div>
                                      )}

                                      <p className="text-[10px] text-[var(--research-muted)] italic">
                                        Multi-hop computational paths from curated ChEMBL &amp; OpenTargets graph data; not clinical proof of therapeutic efficacy.
                                      </p>
                                    </div>

                                    {/* Right Column: Model Score Decomposition & Feature Vector */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between border-b border-[var(--research-border)] pb-1.5">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--research-ink)]">
                                          <Brain className="w-3.5 h-3.5 text-teal-600" />
                                          <span>Model Feature Decomposition</span>
                                        </div>
                                        <span className="text-[10px] text-[var(--research-muted)]">
                                          Bilinear Interaction Terms
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded border border-[var(--research-border)] bg-[var(--research-surface)] p-2">
                                          <div className="text-[10px] text-[var(--research-muted)]">
                                            2-Hop Direct Score
                                          </div>
                                          <div className="font-mono font-bold text-sm text-[var(--research-ink)]">
                                            {formatFeatureValue(cand.features?.twoHopScore)}
                                          </div>
                                        </div>

                                        <div className="rounded border border-[var(--research-border)] bg-[var(--research-surface)] p-2">
                                          <div className="text-[10px] text-[var(--research-muted)]">
                                            Disease Popularity
                                          </div>
                                          <div className="font-mono font-bold text-sm text-[var(--research-ink)]">
                                            {formatFeatureValue(cand.features?.diseasePopularity)}
                                          </div>
                                        </div>

                                        <div className="rounded border border-[var(--research-border)] bg-[var(--research-surface)] p-2">
                                          <div className="text-[10px] text-[var(--research-muted)]">
                                            R-GCN Embedding Score
                                          </div>
                                          <div className="font-mono font-bold text-sm text-[var(--research-ink)]">
                                            {formatFeatureValue(cand.features?.rGcnScore)}
                                          </div>
                                        </div>

                                        <div className="rounded border border-[var(--research-border)] bg-[var(--research-surface)] p-2">
                                          <div className="text-[10px] text-[var(--research-muted)]">
                                            Interaction Term (2-Hop &times; R-GCN)
                                          </div>
                                          <div className="font-mono font-bold text-sm text-[var(--research-ink)]">
                                            {formatFeatureValue(cand.features?.interactionTerm)}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Provenance Footer */}
                                      <div className="rounded border border-[var(--research-border)] bg-[var(--research-surface)] p-2 text-[10px] text-[var(--research-muted)] space-y-0.5">
                                        <div>
                                          <span className="font-medium text-[var(--research-ink)]">Provenance:</span>{' '}
                                          {cand.provenance?.model || 'SentinelPharma-V6-ConnectivityAwareHybrid'} &bull; Checkpoint Seed {cand.provenance?.checkpointSeed || 42}
                                        </div>
                                        <div>
                                          <span className="font-medium text-[var(--research-ink)]">Indication Note:</span>{' '}
                                          {cand.indicationProvenance || 'Evaluated against curated reference datasets.'}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Tab 3: Verified 3D Structure */}
                                {dossierTab === 'structure' && (
                                  <div className="pt-1">
                                    <EmbeddedMoleculeViewer
                                      molecule={candDrug}
                                      structureMapping={
                                        cand.interaction || {
                                          dataMode: 'UNAVAILABLE',
                                          unavailableReason: {
                                            message:
                                              'No verified drug/target-to-PDB mapping with provenance is available for this experimental candidate. Molecular geometry has not been generated or inferred.'
                                          }
                                        }
                                      }
                                      target={
                                        cand.sharedTargets?.[0]?.targetName ||
                                        cand.sharedTargets?.[0]?.targetId ||
                                        'Primary Biological Target'
                                      }
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
