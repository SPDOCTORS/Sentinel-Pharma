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
  Search,
  Loader2,
  Brain,
  TrendingUp,
  FileText,
  Eye,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
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
import CitationPanel from '../components/dashboard/CitationPanel';
import ReportGenerator from '../components/dashboard/ReportGenerator';
import WatchAlertModule from '../components/dashboard/WatchAlertModule';
import RepurposingDiscoveryPanel from '../components/dashboard/RepurposingDiscoveryPanel';
import ExperimentalRepurposingExplorer from '../components/dashboard/ExperimentalRepurposingExplorer';
import KnowledgeGraphEnhanced from '../components/graph/KnowledgeGraphEnhanced';
import StrategySelector from '../components/StrategySelector';

const ResearchDashboard = () => {
  // useResearch gives safe defaults if provider isn't present
  const { privacyMode } = useResearch();
  const { selectedModel } = useModel(); // Get selected model from ModelContext
  const { user } = useAuth();

  const [drugName, setDrugName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [showGraph, setShowGraph] = useState(false);
  const [activeTab, setActiveTab] = useState('results'); // 'results', 'graph', 'citations', 'watch'
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showStrategySelector, setShowStrategySelector] = useState(false);
  const [diseaseQuery, setDiseaseQuery] = useState('');
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [discoveryResults, setDiscoveryResults] = useState(null);
  const [candidateEvidence, setCandidateEvidence] = useState({});
  const [candidateEvidenceLoading, setCandidateEvidenceLoading] = useState({});

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
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!drugName.trim()) {
      setError('Please enter a drug or molecule name');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults(null);
    setSelectedAgent(null);
    setActiveTab('agents');

    // update statuses to thinking
    setAgentStatuses(prev => prev.map(agent => ({ ...agent, status: 'thinking' })));

    try {
      // Actual API call with selected model provider
      const response = await researchService.analyze(drugName, privacyMode, selectedModel);

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
          ([key, name]) => name === agent.name
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

      setActiveTab('agents');
    } catch (err) {
      console.error('Research failed:', err);
      setError(err.response?.data?.error || 'Failed to process research request');
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
      setDiscoveryError(err.response?.data?.error || 'Failed to discover repurposing candidates');
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
    setActiveTab('agents');
    setAgentStatuses(prev => prev.map(agent => ({ ...agent, status: 'idle' })));
  };

  const completionCount = agentStatuses.filter(a => a.status === 'completed').length;
  const quality = results?.metadata?.quality;

  const tabClassMap = {
    results: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-200',
    graph: 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-200',
    citations: 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200',
    watch: 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-200'
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-10 px-1 md:px-0">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl px-5 md:px-8 py-7 md:py-9 border border-cyan-300/25 bg-gradient-to-br from-slate-950 via-[#0b2e44] to-[#0b4c4a] text-white shadow-2xl animate-rise">
        <div className="absolute -top-12 -right-12 h-48 w-48 bg-cyan-300/20 blur-3xl rounded-full" />
        <div className="absolute -bottom-12 -left-12 h-44 w-44 bg-emerald-300/20 blur-3xl rounded-full" />
        <div className="relative">
          <h1 className="section-title text-3xl md:text-5xl font-extrabold mb-3 flex items-center tracking-tight">
            <Sparkles className="w-7 h-7 md:w-8 md:h-8 mr-3 text-cyan-200 shrink-0" />
            Drug Repurposing Intelligence
          </h1>
          <p className="text-cyan-100/90 text-base md:text-lg max-w-3xl leading-relaxed">
            Discover candidate therapies from a biomedical knowledge graph and validate pathways with explainable evidence trails.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5 text-sm">
            <span className="px-3 py-1.5 rounded-full bg-slate-900/35 border border-cyan-200/30 text-cyan-50">10 Specialized Agents</span>
            <span className="px-3 py-1.5 rounded-full bg-slate-900/35 border border-cyan-200/30 text-cyan-50">GNN Link Prediction</span>
            <span className="px-3 py-1.5 rounded-full bg-slate-900/35 border border-cyan-200/30 text-cyan-50">Interactive Evidence + 3D View</span>
          </div>
          <div className="mt-5 grid sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-cyan-200/25 bg-slate-900/35 px-3 py-2.5">
              <p className="uppercase tracking-wide text-cyan-100/75">Signed In</p>
              <p className="mt-1 text-sm font-semibold text-white truncate">{user?.name || user?.email || 'Research User'}</p>
              <p className="text-[11px] text-cyan-100/70 truncate">{user?.email || 'No email available'}</p>
            </div>
            <div className="rounded-xl border border-cyan-200/25 bg-slate-900/35 px-3 py-2.5">
              <p className="uppercase tracking-wide text-cyan-100/75">Role</p>
              <p className="mt-1 text-sm font-semibold text-white">{String(user?.role || 'researcher').toUpperCase()}</p>
            </div>
            <div className="rounded-xl border border-cyan-200/25 bg-slate-900/35 px-3 py-2.5">
              <p className="uppercase tracking-wide text-cyan-100/75">Inference Mode</p>
              <p className="mt-1 text-sm font-semibold text-white">{privacyMode === 'secure' ? 'LOCAL SECURE' : 'CLOUD'}</p>
            </div>
          </div>
        </div>
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
      />

      <ExperimentalRepurposingExplorer service={researchService} />

      {/* Search Form */}
      <div className="dash-surface rounded-3xl p-5 md:p-6 border border-gray-100 dark:border-slate-700 animate-rise">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowStrategySelector(!showStrategySelector)}
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Use Strategic Query Library
              <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${showStrategySelector ? 'rotate-180' : ''}`} />
            </button>
            {showStrategySelector && (
              <div className="mt-3">
                <StrategySelector onSelectQuery={handleStrategySelect} />
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <AutoSuggestInput
                value={drugName}
                onChange={setDrugName}
                onSelect={(value) => setDrugName(value)}
                placeholder="Enter drug name (e.g., Aspirin, Metformin, Imatinib, Semaglutide)"
                disabled={isLoading}
              />
              <div className="mt-2 text-xs text-cyan-100/80">
                Current molecule: <span className="font-semibold text-cyan-50">{drugName || 'Not entered yet'}</span>
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading || !drugName.trim()}
              className={`btn-premium px-8 py-3.5 rounded-2xl font-semibold text-white transition-all flex items-center justify-center space-x-2 shadow-lg ${
                isLoading || !drugName.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : privacyMode === 'secure'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700'
                    : 'bg-gradient-to-r from-cyan-500 to-sky-600 hover:from-cyan-600 hover:to-sky-700'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5" />
                  <span>Analyze with 10 Agents</span>
                </>
              )}
            </button>
          </div>

          {/* Mode Indicator */}
          <div className={`text-sm text-center py-3 rounded-xl flex items-center justify-center space-x-2 ${
            privacyMode === 'secure'
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
              : 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
          }`}>
            <Shield className="w-4 h-4" />
            <span>
              Processing in <strong>{privacyMode === 'secure' ? 'Local Secure Mode (Llama 3)' : 'Cloud Mode (Gemini)'}</strong>
            </span>
          </div>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="animate-soft bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* Agent Status Cards */}
      {(isLoading || results) && (
        <div className="dash-card rounded-3xl p-6 md:p-7 space-y-5 animate-rise">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center mr-3 shadow-lg shadow-cyan-200/70">
                  <Users className="w-5 h-5 text-white" />
                </div>
                AI Agent Overview
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-13">
                Click on any completed agent to view detailed analysis
              </p>
            </div>
            {results && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
                <span className="text-sm text-green-700 font-medium flex items-center">
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
        <div className="dash-card rounded-3xl p-8 text-center animate-rise">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-100 rounded-full mb-4">
            <Brain className="w-8 h-8 text-cyan-600 animate-pulse" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Agents Thinking...
          </h3>
          <p className="text-gray-600">
            Our AI agents are analyzing {drugName} for repurposing opportunities
          </p>
          <div className="mt-6 flex justify-center">
            <div className="flex space-x-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-3 h-3 bg-cyan-500 rounded-full agent-thinking"
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
          <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-2xl p-1 shadow-lg shadow-cyan-200/60 animate-rise">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-green-500 dark:from-emerald-500 dark:to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-200 dark:shadow-green-900/50">
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Analysis Complete!</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
                    <span className="font-medium text-emerald-600">{drugName}</span> analyzed successfully •
                    <span className="text-gray-400 ml-1">{results.results?.processingTimeMs || 0}ms</span>
                  </p>
                  {quality?.score && (
                    <div className="mt-2 space-y-2">
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <Sparkles className="w-3.5 h-3.5" />
                        Quality Score {quality.score}/10 • {quality.grade}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                          Confidence: <strong>{quality.confidenceLevel || 'N/A'}</strong>
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                          Risk: <strong>{quality.riskSeverity || 'N/A'}</strong>
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                          Coverage: <strong>{quality.completedAgents ?? 0}/{quality.expectedAgents ?? 0}</strong>
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                          Output: <strong>{results.results?.simulation_disclosure?.label || 'N/A'}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {results?.requestId && (
                  <Link
                    to={`/report/${results.requestId}`}
                    className="inline-flex items-center px-4 py-2 rounded-xl bg-cyan-500 text-white font-medium hover:bg-cyan-600 transition-colors"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Report
                  </Link>
                )}
                <ReportGenerator
                  data={results}
                  molecule={drugName}
                />
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="dash-card rounded-2xl overflow-hidden animate-rise">
            <div className="bg-gradient-to-r from-cyan-500 via-teal-500 to-orange-500 p-1">
              <div className="bg-white dark:bg-slate-800 rounded-t-xl">
                <nav className="flex space-x-1 p-2.5 md:p-3 overflow-x-auto">
                  {[
                    { id: 'results', label: 'Summary & ROI', icon: TrendingUp },
                    { id: 'graph', label: 'Knowledge Graph', icon: Network },
                    { id: 'citations', label: 'Citations', icon: FileText },
                    { id: 'watch', label: 'Watch & Alert', icon: Eye }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`btn-premium flex items-center space-x-2 px-4 md:px-5 py-2.5 rounded-xl font-medium transition-all duration-200 whitespace-nowrap ${
                        activeTab === tab.id
                          ? `${tabClassMap[tab.id]} scale-105`
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <tab.icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </nav>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {/* Results Tab */}
              {activeTab === 'results' && (
                <div className="space-y-6">
                  <BenchmarkProductPanel agentResults={results.results} molecule={drugName} />
                  <ComprehensiveSummary agentResults={results.results} molecule={drugName} />
                </div>
              )}

              {activeTab === 'graph' && (
                <KnowledgeGraphEnhanced
                  molecule={drugName}
                  data={results.results?.vision}
                  graphData={results.results?.knowledge_graph || results.results?.vision?.knowledge_graph}
                />
              )}

              {activeTab === 'citations' && (
                <CitationPanel
                  agentResults={results.results}
                  molecule={drugName}
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
              className="px-6 py-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl font-medium text-gray-700 dark:text-gray-200 transition-colors"
            >
              Start New Research
            </button>
          </div>
        </div>
      )}

      {/* Agent Detail Modal */}
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
