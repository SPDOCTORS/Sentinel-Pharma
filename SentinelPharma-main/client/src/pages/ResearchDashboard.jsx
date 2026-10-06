// ResearchDashboard.jsx
/**
 * SentinelPharma Research Dashboard
 * ==============================
 * Main dashboard for drug repurposing analysis.
 *
 * NOTE: uses the safe `useResearch()` hook from ResearchContext
 * which returns safe defaults when the provider is missing.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2,
  Brain,
  TrendingUp,
  FileText,
  Eye,
  AlertCircle,
  CheckCircle2,
  Shield,
  Users,
  Network,
  Ship,
  BarChart3,
  Globe,
  Database,
  ChevronDown,
  Sparkles
} from 'lucide-react';

// Use the safe hook exported from ResearchContext (returns fallbacks when provider missing)
import { useResearch } from '../context/ResearchContext';
import { useModel } from '../context/ModelContext';
import { useAuth } from '../context/AuthContext';

import { researchService } from '../services/api';
import AgentStatusCard from '../components/dashboard/AgentStatusCard';
import AgentDetailPanel from '../components/dashboard/AgentDetailPanel';
import ComprehensiveSummary from '../components/dashboard/ComprehensiveSummary';
import BenchmarkProductPanel from '../components/dashboard/BenchmarkProductPanel';
import AutoSuggestInput from '../components/dashboard/AutoSuggestInput';
import CitationPanel, { CitationSidebar } from '../components/dashboard/CitationPanel';
import LiveResearchSummary from '../components/dashboard/LiveResearchSummary';
import EmbeddedMoleculeViewer from '../components/dashboard/EmbeddedMoleculeViewer';
import ReportGenerator from '../components/dashboard/ReportGenerator';
import WatchAlertModule from '../components/dashboard/WatchAlertModule';
import RepurposingDiscoveryPanel from '../components/dashboard/RepurposingDiscoveryPanel';
import ExperimentalRepurposingExplorer from '../components/dashboard/ExperimentalRepurposingExplorer';
import KnowledgeGraphEnhanced from '../components/graph/KnowledgeGraphEnhanced';
import LiveKnowledgeGraphPanel from '../components/graph/LiveKnowledgeGraphPanel';
import StrategySelector from '../components/StrategySelector';
import EvidenceProvenanceNotice from '../components/ui/EvidenceProvenanceNotice';
import WorkspacePanel from '../components/ui/WorkspacePanel';

const apiErrorMessage = (error, fallback) => {
  const payload = error?.response?.data;
  return payload?.unavailableReason?.message || payload?.error?.message ||
    (typeof payload?.error === 'string' ? payload.error : null) || fallback;
};

const ResearchDashboard = () => {
  // useResearch gives safe defaults if provider isn't present
  const { privacyMode } = useResearch();
  const { selectedModel } = useModel(); // Get selected model from ModelContext
  const { user } = useAuth();

  const [drugName, setDrugName] = useState('');
  const [indication, setIndication] = useState('');
  const [researchMode, setResearchMode] = useState('live');
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('results'); // 'results', 'graph', 'citations', 'watch'
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showStrategySelector, setShowStrategySelector] = useState(false);
  const [diseaseQuery, setDiseaseQuery] = useState('');
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [discoveryResults, setDiscoveryResults] = useState(null);
  const [candidateEvidence, setCandidateEvidence] = useState({});
  const [candidateEvidenceLoading, setCandidateEvidenceLoading] = useState({});
  const [activeInvestigation, setActiveInvestigation] = useState(null);

  // 7 Mandatory Agents + 3 Strategic Agents (EY Focus)
  const [agentStatuses, setAgentStatuses] = useState([
    { name: 'Master Orchestrator', status: 'idle', icon: Brain, key: 'orchestrator', color: 'indigo', category: 'core' },
    { name: 'IQVIA Insights Agent', status: 'idle', icon: BarChart3, key: 'iqvia', color: 'blue', category: 'mandatory' },
    { name: 'EXIM Trends Agent', status: 'idle', icon: Ship, key: 'exim', color: 'cyan', category: 'mandatory' },
    { name: 'Patent Landscape Agent', status: 'idle', icon: FileText, key: 'patent', color: 'purple', category: 'mandatory' },
    { name: 'Clinical Trials Agent', status: 'idle', icon: Shield, key: 'clinical', color: 'green', category: 'mandatory' },
    { name: 'Internal Knowledge Agent', status: 'idle', icon: Database, key: 'internal', color: 'orange', category: 'mandatory' },
    { name: 'Web Intelligence Agent', status: 'idle', icon: Globe, key: 'web_intel', color: 'pink', category: 'mandatory' },
    { name: 'Regulatory Compliance', status: 'idle', icon: Shield, key: 'regulatory', color: 'red', category: 'strategic' },
    { name: 'Patient Sentiment', status: 'idle', icon: Users, key: 'patient_sentiment', color: 'rose', category: 'strategic' },
    { name: 'ESG & Sustainability', status: 'idle', icon: TrendingUp, key: 'esg', color: 'emerald', category: 'strategic' }
  ]);

  /**
   * Handle research form submission
   */
  const handleSubmit = async (e, overrides = {}) => {
    e?.preventDefault?.();

    const requestedDrug = String(overrides.drugName ?? drugName).trim();
    const requestedDisease = String(overrides.indication ?? indication).trim();
    const requestedMode = overrides.researchMode ?? researchMode;

    if (!requestedDrug) {
      setError('Please enter a drug or molecule name');
      return;
    }

    setActiveInvestigation(overrides.candidate
      ? { candidate: overrides.candidate, disease: requestedDisease }
      : null);

    setIsLoading(true);
    setError(null);
    setResults(null);
    setSelectedAgent(null);
    setActiveTab(requestedMode === 'live' ? 'results' : 'agents');

    // update statuses to thinking
    setAgentStatuses(prev => prev.map(agent => ({ ...agent, status: 'thinking' })));

    try {
      // Actual API call with selected model provider
      const response = await researchService.analyze(requestedDrug, privacyMode, selectedModel, requestedDisease || null, requestedMode);

      setResults(response.data);

      // Cache report payload for resilient preview retrieval when backend status cache is unavailable.
      if (response.data?.requestId) {
        const cacheKey = `sentinel_report_${response.data.requestId}`;
        localStorage.setItem(cacheKey, JSON.stringify(response.data));

        const indexKey = 'sentinel_report_index';
        const existing = JSON.parse(localStorage.getItem(indexKey) || '[]');
        const nextIndex = [response.data.requestId, ...existing.filter((id) => id !== response.data.requestId)].slice(0, 25);
        localStorage.setItem(indexKey, JSON.stringify(nextIndex));
      }

      // Map backend agent keys to frontend agent names
      const backendToFrontendMap = {
        'orchestrator': 'Master Orchestrator',
        'iqvia': 'IQVIA Insights Agent',
        'exim': 'EXIM Trends Agent',
        'patent': 'Patent Landscape Agent',
        'clinical': 'Clinical Trials Agent',
        'internal_knowledge': 'Internal Knowledge Agent',
        'web_intelligence': 'Web Intelligence Agent',
        'regulatory': 'Regulatory Compliance',
        'patient_sentiment': 'Patient Sentiment',
        'esg': 'ESG & Sustainability'
      };

      // Update agent statuses based on actual API response
      setAgentStatuses(prev => prev.map(agent => {
        // Find the backend key for this agent
        const backendKey = Object.entries(backendToFrontendMap).find(
          ([, name]) => name === agent.name
        )?.[0];

        // Check if data exists for this agent
        let hasData = backendKey && response.data?.results?.[backendKey];

        // The orchestrator represents the aggregate synthesis, so treat a successful
        // analysis response as evidence even if the backend omits a dedicated key.
        if (agent.name === 'Master Orchestrator') {
          hasData = hasData || !!response.data?.results;
        }
        
        return {
          ...agent,
          status: hasData ? 'completed' : 'idle'
        };
      }));

      setActiveTab(requestedMode === 'live' ? 'results' : 'agents');
    } catch (err) {
      console.error('Research failed:', err);
      setError(apiErrorMessage(err, 'Failed to process research request'));
      setAgentStatuses(prev => prev.map(agent => ({ ...agent, status: 'error' })));
    } finally {
      setIsLoading(false);
    }
  };

  const handleStrategySelect = (query) => {
    setDrugName(query.molecule);
    setShowStrategySelector(false);
  };

  const handleDiscoverySubmit = async (e) => {
    e.preventDefault();

    if (!diseaseQuery.trim()) {
      setDiscoveryError('Please enter a disease');
      return;
    }

    setDiscoveryLoading(true);
    setDiscoveryError(null);

    try {
      const response = await researchService.discoverRepurposing(diseaseQuery.trim(), 5);
      setDiscoveryResults(response.data);
      setCandidateEvidence({});
    } catch (err) {
      console.error('Repurposing discovery failed:', err);
      setDiscoveryError(apiErrorMessage(err, 'Failed to discover repurposing candidates'));
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const handleLoadCandidateEvidence = async (candidate) => {
    const key = candidate.drug;
    setCandidateEvidenceLoading((previous) => ({ ...previous, [key]: true }));
    try {
      const response = await researchService.getCandidateEvidence(key, discoveryResults.disease, candidate.score, 10);
      setCandidateEvidence((previous) => ({ ...previous, [key]: response.data }));
    } catch (err) {
      setCandidateEvidence((previous) => ({ ...previous, [key]: { error: err.response?.data?.error?.message || 'Evidence is unavailable.' } }));
    } finally {
      setCandidateEvidenceLoading((previous) => ({ ...previous, [key]: false }));
    }
  };

  const handleInvestigateCandidate = async (candidate, candidateDisease) => {
    const candidateDrug = candidate?.drugName || candidate?.drug || candidate?.name;
    const disease = String(candidateDisease || discoveryResults?.disease || diseaseQuery || indication).trim();
    if (!candidateDrug || !disease) return;

    setDrugName(candidateDrug);
    setIndication(disease);
    setResearchMode('live');
    await handleSubmit(null, {
      drugName: candidateDrug,
      indication: disease,
      researchMode: 'live',
      candidate
    });
  };

  const handleAgentClick = (agent) => {
    if (agent.status === 'completed') {
      setSelectedAgent(selectedAgent === agent.name ? null : agent.name);
    }
  };

  const getAgentData = (agentName) => {
    if (!results?.results) return null;

    const keyMap = {
      'Master Orchestrator': 'orchestrator',
      'IQVIA Insights Agent': 'iqvia',
      'EXIM Trends Agent': 'exim',
      'Patent Landscape Agent': 'patent',
      'Clinical Trials Agent': 'clinical',
      'Internal Knowledge Agent': 'internal_knowledge',
      'Web Intelligence Agent': 'web_intelligence',
      'Regulatory Compliance': 'regulatory',
      'Patient Sentiment': 'patient_sentiment',
      'ESG & Sustainability': 'esg'
    };

    return results.results[keyMap[agentName]] || null;
  };

  const handleReset = () => {
    setDrugName('');
    setResults(null);
    setError(null);
    setSelectedAgent(null);
    setActiveInvestigation(null);
    setActiveTab('agents');
    setAgentStatuses(prev => prev.map(agent => ({ ...agent, status: 'idle' })));
  };

  const completionCount = agentStatuses.filter(a => a.status === 'completed').length;
  const quality = results?.metadata?.quality;

  const tabClassMap = {
    results: 'research-tab--active',
    rankings: 'research-tab--active',
    graph: 'research-tab--active',
    citations: 'research-tab--active',
    watch: 'research-tab--active'
  };

  return (
    <div className="research-dashboard space-y-6 pb-10">
      {/* Header */}
      <header className="research-page-header">
        <div className="max-w-3xl">
          <p className="research-eyebrow">Research workspace</p>
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-[var(--research-ink)] md:text-4xl">Drug repurposing evidence review</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--research-muted)] md:text-[0.95rem]">
            Use two explicit workflows: drug–disease evidence retrieval and disease-first candidate discovery.
          </p>
        </div>
        <div className="research-session-card">
          <span className="research-session-card__avatar" aria-hidden="true">{String(user?.name || user?.email || 'R').charAt(0).toUpperCase()}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--research-ink)]">{user?.name || user?.email || 'Research User'}</span>
            <span className="block text-xs capitalize text-[var(--research-muted)]">{String(user?.role || 'researcher')}</span>
          </span>
          <span className="research-session-card__mode"><Shield className="h-3.5 w-3.5" />{privacyMode === 'secure' ? 'Local' : 'Cloud'}</span>
        </div>
      </header>

      {/* Search Form */}
      <WorkspacePanel
        eyebrow={researchMode === 'live' ? 'Flow 1 · Drug and disease inputs' : 'Demonstration mode'}
        title={researchMode === 'live' ? 'Drug–Disease Evidence' : 'New research'}
        description={researchMode === 'live'
          ? 'The drug and disease affect source retrieval and the pair-specific V5 evidence graph. Model rankings are separate and conditioned on disease only.'
          : 'Run the existing synthetic demonstration with its current provenance labels.'}
        actions={(
          <button
            type="button"
            onClick={() => setShowStrategySelector(!showStrategySelector)}
            className="research-secondary-button"
            aria-expanded={showStrategySelector}
          >
            <Sparkles className="h-4 w-4" />
            Query library
            <ChevronDown className={`h-4 w-4 transition-transform ${showStrategySelector ? 'rotate-180' : ''}`} />
          </button>
        )}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {showStrategySelector && <div className="border-b border-[var(--research-border)] pb-4"><StrategySelector onSelectQuery={handleStrategySelect} /></div>}

          <div className="grid gap-4 md:grid-cols-[1fr_1fr_210px]">
            <label className="research-field-label">Molecule or drug
              <AutoSuggestInput
                value={drugName}
                onChange={setDrugName}
                onSelect={(value) => setDrugName(value)}
                placeholder="e.g., Metformin"
                disabled={isLoading}
              />
            </label>
            <label className="research-field-label">Disease or indication <span className="font-normal text-[var(--research-muted)]">(optional)</span>
              <input value={indication} onChange={(event) => setIndication(event.target.value)} disabled={isLoading} placeholder="e.g., Type 2 Diabetes" className="research-input" />
            </label>
            <label className="research-field-label">Research mode
              <select value={researchMode} onChange={(event) => setResearchMode(event.target.value)} disabled={isLoading} className="research-input">
                <option value="live">Live evidence</option>
                <option value="demo">Synthetic demonstration</option>
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--research-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="research-status-note flex-1">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[var(--research-evidence)]" />
              <span>
                {researchMode === 'live'
                  ? 'Retrieved records identify their source and retrieval time. Source identity does not establish therapeutic efficacy.'
                  : `Synthetic demonstration in ${privacyMode === 'secure' ? 'local secure' : 'cloud'} mode; outputs remain labelled demo-only.`}
              </span>
            </div>
            <button
              type="submit"
              disabled={isLoading || !drugName.trim()}
              className="research-primary-button min-w-52"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5" />
                  <span>{researchMode === 'live' ? 'Retrieve drug–disease evidence' : 'Run demonstration'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </WorkspacePanel>

      {!results && !isLoading && !error && (
        <section className="research-empty-state" aria-label="Research output guide">
          <div><Database className="h-5 w-5 text-[var(--research-evidence)]" /><h3 className="mt-3">Named source records</h3><p>PubMed and ClinicalTrials.gov records retain identifiers, URLs, and retrieval timestamps.</p></div>
          <div><TrendingUp className="h-5 w-5 text-[var(--research-prediction)]" /><h3 className="mt-3">Disease-first discovery</h3><p>GraphSAGE and V5 shadow rankings use disease only and remain separate from this evidence query.</p></div>
          <div><FileText className="h-5 w-5 text-[var(--research-primary)]" /><h3 className="mt-3">Persisted research report</h3><p>Completed requests are saved under an auditable request ID for later review.</p></div>
        </section>
      )}

      {/* Error */}
      {error && (
        <div role="alert" className="research-alert research-alert--error animate-soft">
          <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* Agent Status Cards */}
      {(researchMode === 'demo' && (isLoading || results)) && (
        <div className="research-output-card space-y-5 animate-rise">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="research-eyebrow">Analysis pipeline</p>
              <h2 className="flex items-center text-lg font-bold text-[var(--research-ink)]">
                <Users className="mr-2 h-5 w-5 text-[var(--research-primary)]" />
                AI Agent Overview
              </h2>
              <p className="mt-1 text-sm text-[var(--research-muted)]">
                Click on any completed agent to view detailed analysis
              </p>
            </div>
            {results && (
              <div className="research-completion-badge">
                <span className="flex items-center text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {completionCount} of {agentStatuses.length} agents completed
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-5 gap-4">
            {agentStatuses.map((agent, index) => (
              <AgentStatusCard
                key={agent.name}
                name={agent.name}
                status={agent.status}
                icon={agent.icon}
                delay={index * 80}
                onClick={() => handleAgentClick(agent)}
                isSelected={selectedAgent === agent.name}
                hasResults={!!getAgentData(agent.name) || agent.status === 'completed'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="research-output-card py-12 text-center animate-rise" aria-live="polite">
          <div className="research-loading-icon">
            <Brain className="h-7 w-7 animate-pulse" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-[var(--research-ink)]">
            {researchMode === 'live' ? 'Retrieving source evidence...' : 'Agents Thinking...'}
          </h3>
          <p className="text-sm text-[var(--research-muted)]">
            {researchMode === 'live' ? `Checking PubMed and ClinicalTrials.gov for ${drugName}` : `Our AI agents are analyzing ${drugName} for repurposing opportunities`}
          </p>
          <div className="mt-6 flex justify-center">
            <div className="flex space-x-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-[var(--research-primary)] agent-thinking"
                  style={{ animationDelay: `${i * 0.3}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results Display */}
      {results && !isLoading && (
        <div className="space-y-6">
          {/* Success Header */}
          <div className="research-success-card animate-rise">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="research-success-card__icon">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="research-eyebrow">Completed request</p>
                  <h3 className="text-xl font-bold text-[var(--research-ink)]">{results.researchMode === 'live' ? 'Research retrieval complete' : 'Analysis complete'}</h3>
                  <p className="mt-1 text-sm text-[var(--research-muted)]">
                    {results.researchMode === 'live' ? (
                      <>
                        Evidence retrieved for <span className="font-medium text-emerald-600">{drugName}</span>
                        {results.disease ? ` and ${results.disease}` : ''}
                      </>
                    ) : (
                      <><span className="font-medium text-emerald-600">{drugName}</span> analyzed successfully</>
                    )} •
                    <span className="text-gray-400 ml-1">{results.results?.processingTimeMs || 0}ms</span>
                  </p>
                  {quality?.score && (
                    <div className="mt-2 space-y-2">
                      <div className="research-quality-badge">
                        <Sparkles className="w-3.5 h-3.5" />
                        Quality Score {quality.score}/10 • {quality.grade}
                      </div>
                      <div className="research-metadata-row">
                        <span>
                          Confidence: <strong>{quality.confidenceLevel || 'N/A'}</strong>
                        </span>
                        <span>
                          Risk: <strong>{quality.riskSeverity || 'N/A'}</strong>
                        </span>
                        <span>
                          Coverage: <strong>{quality.completedAgents ?? 0}/{quality.expectedAgents ?? 0}</strong>
                        </span>
                        <span>
                          Output: <strong>{results.results?.simulation_disclosure?.label || 'N/A'}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 max-w-2xl">
                    <EvidenceProvenanceNotice payload={results} />
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {results?.requestId && (
                  <Link
                    to={`/report/${results.requestId}`}
                    className="research-primary-button"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Report
                  </Link>
                )}
                <ReportGenerator
                  results={results}
                  molecule={drugName}
                  mode={results.processingMode}
                />
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="research-results-shell animate-rise">
            <div>
              <div>
                <nav className="research-tabs" aria-label="Research result views">
                  {[
                    { id: 'results', label: results.researchMode === 'live' ? 'Evidence summary' : 'Summary & ROI', icon: TrendingUp },
                    ...(results.researchMode === 'live' ? [{ id: 'rankings', label: 'Disease-first rankings', icon: Brain }] : []),
                    { id: 'graph', label: results.researchMode === 'live' ? 'V5 Evidence Graph' : 'Knowledge Graph', icon: Network },
                    { id: 'citations', label: 'Citations', icon: FileText },
                    ...(results.researchMode === 'live' ? [] : [{ id: 'watch', label: 'Watch & Alert', icon: Eye }])
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`research-tab ${
                        activeTab === tab.id
                          ? tabClassMap[tab.id]
                          : ''
                      }`}
                      aria-selected={activeTab === tab.id}
                    >
                      <tab.icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </nav>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-4 md:p-6">
              {/* Results Tab */}
              {activeTab === 'results' && (
                <div className="space-y-6">
                  {results.researchMode === 'live' ? <LiveResearchSummary report={results} view="evidence" /> : <><BenchmarkProductPanel agentResults={results.results} molecule={drugName} /><ComprehensiveSummary agentResults={results.results} molecule={drugName} /></>}
                  {results.researchMode === 'live' && activeInvestigation && (
                    <section className="research-ranking-panel" aria-labelledby="investigation-structure-heading">
                      <div className="research-result-section-heading">
                        <div>
                          <p className="research-eyebrow">Selected candidate</p>
                          <h3 id="investigation-structure-heading" className="text-base font-bold text-[var(--research-ink)]">Verified structure investigation</h3>
                          <p className="mt-1 text-sm text-[var(--research-muted)]">
                            {activeInvestigation.candidate.drugName || activeInvestigation.candidate.drug || activeInvestigation.candidate.name} + {activeInvestigation.disease}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <EmbeddedMoleculeViewer
                          molecule={activeInvestigation.candidate.drugName || activeInvestigation.candidate.drug || activeInvestigation.candidate.name}
                          structureMapping={activeInvestigation.candidate.interaction}
                          target={activeInvestigation.candidate.target}
                        />
                      </div>
                    </section>
                  )}
                </div>
              )}

              {activeTab === 'rankings' && results.researchMode === 'live' && (
                <LiveResearchSummary
                  report={results}
                  view="rankings"
                  onInvestigateCandidate={(candidate) => handleInvestigateCandidate(candidate, results.disease || indication)}
                  investigatingCandidate={isLoading ? activeInvestigation?.candidate : null}
                />
              )}

              {activeTab === 'graph' && (
                results.researchMode === 'live'
                  ? <LiveKnowledgeGraphPanel molecule={drugName} graph={results.results?.knowledge_graph} />
                  : <KnowledgeGraphEnhanced
                    molecule={drugName}
                    data={results.results?.vision}
                    graphData={results.results?.knowledge_graph || results.results?.vision?.knowledge_graph}
                  />
              )}

              {activeTab === 'citations' && (
                <CitationPanel
                  agentResults={results.results}
                  molecule={drugName}
                  onViewCitation={setSelectedCitation}
                />
              )}

              {activeTab === 'watch' && (
                <WatchAlertModule
                  agentResults={results.results}
                  molecule={drugName}
                />
              )}
            </div>
          </div>

          {/* New Research Button */}
          <div className="text-center">
            <button
              onClick={handleReset}
              className="research-secondary-button px-5 py-3"
            >
              Start New Research
            </button>
          </div>
        </div>
      )}

      <section className="space-y-4 border-t border-[var(--research-border)] pt-8" aria-labelledby="additional-tools-title">
        <div className="max-w-3xl">
          <p className="research-eyebrow">Flow 2 · Disease input only</p>
          <h2 id="additional-tools-title" className="text-xl font-bold tracking-tight text-[var(--research-ink)]">Disease-First Candidate Discovery</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--research-muted)]">Rank candidate drugs from the disease input. No molecule from the evidence workflow affects these scores.</p>
        </div>
        <RepurposingDiscoveryPanel
          disease={diseaseQuery}
          setDisease={setDiseaseQuery}
          onSubmit={handleDiscoverySubmit}
          loading={discoveryLoading}
          error={discoveryError}
          data={discoveryResults}
          candidateEvidence={candidateEvidence}
          candidateEvidenceLoading={candidateEvidenceLoading}
          onLoadCandidateEvidence={handleLoadCandidateEvidence}
          onInvestigateCandidate={handleInvestigateCandidate}
          investigatingCandidate={isLoading ? activeInvestigation?.candidate : null}
        />
        <ExperimentalRepurposingExplorer service={researchService} />
      </section>

      {/* Agent Detail Modal */}
      {selectedCitation && <CitationSidebar isOpen citation={selectedCitation} onClose={() => setSelectedCitation(null)} />}
      {selectedAgent && (
        <AgentDetailPanel
          agent={agentStatuses.find(a => a.name === selectedAgent)}
          data={getAgentData(selectedAgent)}
          onClose={() => setSelectedAgent(null)}
          molecule={drugName}
        />
      )}
    </div>
  );
};

export default ResearchDashboard;
