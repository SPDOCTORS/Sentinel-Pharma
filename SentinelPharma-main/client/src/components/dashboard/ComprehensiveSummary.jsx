/**
 * Comprehensive Summary Dashboard
 * =================================
 * Aggregates data from all 10 AI agents into a unified view with:
 * - Executive summary with key metrics from all agents
 * - Multi-agent data visualization (charts, graphs)
 * - ROI analysis with integrated agent insights
 * - Risk assessment matrix
 * - Strategic recommendations synthesis
 */

import React, { useState, useMemo } from 'react';
import { 
  TrendingUp,
  TrendingDown,
  DollarSign,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Award,
  BarChart3,
  PieChart,
  Activity,
  Users,
  Globe,
  FileText,
  Pill,
  Sparkles,
  Info,
  Download,
  ChevronRight,
  LineChart
} from 'lucide-react';

const ComprehensiveSummary = ({ agentResults, molecule }) => {
  const [activeMetric, setActiveMetric] = useState('overview');

  if (!agentResults) return null;

  // Aggregate data from all agents
  const aggregatedData = useMemo(() => {
    const {
      iqvia,
      exim,
      patent,
      clinical,
      internal_knowledge,
      web_intelligence,
      regulatory,
      patient_sentiment,
      vision,
      validation,
      simulation_disclosure
    } = agentResults;

    // Market & Financial
    const marketSize = iqvia?.global_market_size_usd_bn || iqvia?.market_size?.total_market_usd_bn || 4.2;
    const rawCagr = iqvia?.five_year_cagr ?? '8.5';
    const cagr = typeof rawCagr === 'number'
      ? rawCagr
      : parseFloat(String(rawCagr).replace('%', ''));
    const projectedRevenue = Math.round(marketSize * 1000 * 0.05);
    const developmentCost = 250;
    const roi = Math.round(((projectedRevenue - developmentCost) / developmentCost) * 100);

    // Clinical & Safety
    const safetyScore = clinical?.safety_score || 8.5;
    const totalTrials = clinical?.total_trials_found || 0;
    const efficacyRating = clinical?.efficacy_rating || 'High';

    // IP & Patents
    const activePatents = patent?.active_patents || 0;
    const ftoStatus = patent?.freedom_to_operate || 'Clear';
    const patentExpiry = patent?.earliest_expiration || '2027';

    // Regulatory
    const complianceScore = regulatory?.compliance_score || 85;
    const approvalTimeline = regulatory?.approval_timeline || '18-24 months';
    const regulatoryPathway = regulatory?.recommended_pathway || '505(b)(2)';

    // Patient & Market Sentiment
    const patientSatisfaction = patient_sentiment?.satisfaction_score || 7.2;
    const unmetNeeds = patient_sentiment?.unmet_needs_count || 5;
    const marketSentiment = web_intelligence?.sentiment || 'Positive';

    // Supply Chain
    const tradeVolume = exim?.trade_value_usd_million || 850;
    const supplyRisk = exim?.overall_supply_risk || 'Medium';

    // Validation
    const confidenceScore = validation?.confidence_score || 85;
    const riskFlags = validation?.risk_flags?.length || 2;

    return {
      marketSize,
      cagr,
      projectedRevenue,
      developmentCost,
      roi,
      safetyScore,
      totalTrials,
      efficacyRating,
      activePatents,
      ftoStatus,
      patentExpiry,
      complianceScore,
      approvalTimeline,
      regulatoryPathway,
      patientSatisfaction,
      unmetNeeds,
      marketSentiment,
      tradeVolume,
      supplyRisk,
      confidenceScore,
      riskFlags,
      simulationLabel: simulation_disclosure?.label || 'N/A',
      // Agent summaries
      agentScores: {
        iqvia: 85,
        exim: 78,
        patent: 82,
        clinical: 90,
        internal: 88,
        web_intel: 75,
        regulatory: complianceScore,
        patient_sentiment: Math.round(patientSatisfaction * 10),
        vision: 80,
        validation: confidenceScore
      }
    };
  }, [agentResults]);

  // Calculate overall recommendation
  const getOverallRecommendation = () => {
    const score = (aggregatedData.roi + aggregatedData.safetyScore * 10 + aggregatedData.complianceScore + aggregatedData.confidenceScore) / 4;
    
    if (score > 150) return { text: 'STRONG BUY', color: 'emerald', icon: TrendingUp, desc: 'Excellent opportunity with favorable conditions' };
    if (score > 100) return { text: 'BUY', color: 'green', icon: TrendingUp, desc: 'Good opportunity with manageable risks' };
    if (score > 75) return { text: 'HOLD', color: 'yellow', icon: Target, desc: 'Moderate opportunity, monitor closely' };
    return { text: 'REVIEW', color: 'orange', icon: AlertTriangle, desc: 'Further analysis recommended' };
  };

  const recommendation = getOverallRecommendation();
  const RecommendationIcon = recommendation.icon;

  // Agent Performance Radar Chart (simplified)
  const AgentPerformanceChart = () => {
    const agents = Object.entries(aggregatedData.agentScores);
    const maxScore = 100;

    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center">
          <BarChart3 className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
          Agent Performance Scores
        </h4>
        {agents.map(([agent, score]) => (
          <div key={agent} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{agent.replace('_', ' ')}</span>
              <span className="font-bold text-gray-900 dark:text-white">{score}/100</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  score >= 85 ? 'bg-gradient-to-r from-green-500 to-green-600' :
                  score >= 70 ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                  'bg-gradient-to-r from-yellow-500 to-yellow-600'
                }`}
                style={{ width: `${(score / maxScore) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Multi-Metric Comparison Chart
  const MultiMetricChart = () => {
    const metrics = [
      { name: 'Market Size', value: aggregatedData.marketSize, max: 10, unit: 'B', color: '#3B82F6' },
      { name: 'Safety Score', value: aggregatedData.safetyScore, max: 10, unit: '/10', color: '#10B981' },
      { name: 'Compliance', value: aggregatedData.complianceScore, max: 100, unit: '%', color: '#8B5CF6' },
      { name: 'Patient Sat.', value: aggregatedData.patientSatisfaction, max: 10, unit: '/10', color: '#F59E0B' },
      { name: 'Confidence', value: aggregatedData.confidenceScore, max: 100, unit: '%', color: '#EF4444' }
    ];

    return (
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center">
          <Activity className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
          Key Metrics Overview
        </h4>
        <div className="grid grid-cols-5 gap-2 h-48">
          {metrics.map((metric, index) => {
            const percentage = (metric.value / metric.max) * 100;
            return (
              <div key={index} className="flex flex-col items-center">
                <div className="flex-1 w-full flex flex-col-reverse">
                  <div 
                    className="w-full rounded-t-lg transition-all duration-500 relative group cursor-pointer"
                    style={{ 
                      height: `${percentage}%`,
                      backgroundColor: metric.color
                    }}
                  >
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                      {metric.value}{metric.unit}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400 font-medium mt-2 text-center">{metric.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Risk Assessment Matrix
  const RiskMatrix = () => {
    const risks = [
      { category: 'Clinical', level: aggregatedData.safetyScore > 8 ? 'Low' : 'Medium', color: 'green' },
      { category: 'Regulatory', level: aggregatedData.complianceScore > 80 ? 'Low' : 'Medium', color: 'green' },
      { category: 'Market', level: aggregatedData.cagr > 8 ? 'Low' : 'High', color: 'green' },
      { category: 'IP', level: aggregatedData.ftoStatus === 'Clear' ? 'Low' : 'Medium', color: 'green' },
      { category: 'Supply Chain', level: aggregatedData.supplyRisk === 'Low' ? 'Low' : 'Medium', color: 'yellow' },
      { category: 'Patient', level: aggregatedData.patientSatisfaction > 7 ? 'Low' : 'Medium', color: 'green' }
    ];

    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center">
          <Shield className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
          Risk Assessment Matrix
        </h4>
        <div className="grid grid-cols-3 gap-2">
          {risks.map((risk, index) => (
            <div 
              key={index}
              className={`p-3 rounded-lg border-2 ${
                risk.level === 'Low' ? 'bg-green-50 border-green-200' :
                risk.level === 'Medium' ? 'bg-yellow-50 border-yellow-200' :
                'bg-red-50 border-red-200'
              }`}
            >
              <div className="text-xs font-medium text-gray-700">{risk.category}</div>
              <div className={`text-sm font-bold ${
                risk.level === 'Low' ? 'text-green-700' :
                risk.level === 'Medium' ? 'text-yellow-700' :
                'text-red-700'
              }`}>{risk.level} Risk</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Timeline Projection
  const TimelineProjection = () => {
    const phases = [
      { phase: 'Preclinical', duration: '6-12m', status: 'completed' },
      { phase: 'Phase I/II', duration: '12-18m', status: 'active' },
      { phase: 'Phase III', duration: '18-24m', status: 'upcoming' },
      { phase: 'Regulatory', duration: '12-18m', status: 'upcoming' },
      { phase: 'Launch', duration: '3-6m', status: 'future' }
    ];

    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center">
          <Clock className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
          Development Timeline ({aggregatedData.approvalTimeline})
        </h4>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
          <div className="space-y-3">
            {phases.map((phase, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                  phase.status === 'completed' ? 'bg-green-500' :
                  phase.status === 'active' ? 'bg-blue-500 animate-pulse' :
                  phase.status === 'upcoming' ? 'bg-gray-300' :
                  'bg-gray-200'
                }`}>
                  {phase.status === 'completed' && <CheckCircle className="w-4 h-4 text-white" />}
                  {phase.status === 'active' && <Activity className="w-4 h-4 text-white" />}
                  {phase.status === 'upcoming' && <Clock className="w-4 h-4 text-gray-600" />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{phase.phase}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{phase.duration}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Executive Summary Card */}
      <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 rounded-2xl shadow-lg dark:shadow-2xl p-6 border-2 border-indigo-200 dark:border-indigo-900/50">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 dark:from-indigo-500 dark:to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Executive Summary</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Comprehensive analysis of {molecule} by 10 AI agents</p>
            </div>
          </div>
          
          {/* Overall Recommendation */}
          <div className={`px-4 py-3 bg-${recommendation.color}-100 border-2 border-${recommendation.color}-300 rounded-xl`}>
            <div className="flex items-center space-x-2 mb-1">
              <RecommendationIcon className={`w-5 h-5 text-${recommendation.color}-700`} />
              <span className={`font-bold text-${recommendation.color}-800`}>{recommendation.text}</span>
            </div>
            <p className="text-xs text-gray-600">{recommendation.desc}</p>
          </div>
        </div>

        {/* Key Highlights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/80 dark:bg-slate-700/80 backdrop-blur rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-8 h-8 text-green-600" />
              <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{aggregatedData.roi}%</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Projected ROI</div>
          </div>

          <div className="bg-white/80 dark:bg-slate-700/80 backdrop-blur rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{aggregatedData.safetyScore}/10</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Safety Score</div>
          </div>

          <div className="bg-white/80 dark:bg-slate-700/80 backdrop-blur rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <FileText className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{aggregatedData.totalTrials}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Clinical Trials</div>
          </div>

          <div className="bg-white/80 dark:bg-slate-700/80 backdrop-blur rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <Target className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              <CheckCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{aggregatedData.confidenceScore}%</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Confidence</div>
          </div>
        </div>
      </div>

      {/* Detailed Metrics Section */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg dark:shadow-2xl overflow-hidden border border-gray-100 dark:border-slate-700">
        <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600">
          <h3 className="text-lg font-bold text-white flex items-center">
            <BarChart3 className="w-5 h-5 mr-2" />
            Detailed Analytics Dashboard
          </h3>
        </div>

        {/* Metric Tabs */}
        <div className="border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700">
          <div className="flex space-x-1 p-3 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'performance', label: 'Agent Performance', icon: BarChart3 },
              { id: 'risk', label: 'Risk Analysis', icon: Shield },
              { id: 'timeline', label: 'Timeline', icon: Clock }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveMetric(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  activeMetric === tab.id
                    ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="text-sm whitespace-nowrap">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Metric Content */}
        <div className="p-6">
          {activeMetric === 'overview' && <MultiMetricChart />}
          {activeMetric === 'performance' && <AgentPerformanceChart />}
          {activeMetric === 'risk' && <RiskMatrix />}
          {activeMetric === 'timeline' && <TimelineProjection />}
        </div>
      </div>

      {/* Agent-by-Agent Summary */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg dark:shadow-2xl p-6 border border-gray-100 dark:border-slate-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
          <Users className="w-5 h-5 mr-2 text-indigo-600" />
          Agent Insights Summary
        </h3>
        
        <div className="grid md:grid-cols-2 gap-4">
          {/* IQVIA */}
          <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <h4 className="font-semibold text-blue-900">IQVIA Market Intelligence</h4>
            </div>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Market size: <strong>${aggregatedData.marketSize}B</strong></li>
              <li>• 5Y CAGR: <strong>{aggregatedData.cagr}%</strong></li>
              <li>• Projected revenue: <strong>${aggregatedData.projectedRevenue}M</strong></li>
            </ul>
          </div>

          {/* Clinical */}
          <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="w-4 h-4 text-green-600" />
              <h4 className="font-semibold text-green-900">Clinical Trials Analysis</h4>
            </div>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Total trials: <strong>{aggregatedData.totalTrials}</strong></li>
              <li>• Safety score: <strong>{aggregatedData.safetyScore}/10</strong></li>
              <li>• Efficacy: <strong>{aggregatedData.efficacyRating}</strong></li>
            </ul>
          </div>

          {/* Patent */}
          <div className="bg-purple-50 border-l-4 border-purple-500 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <FileText className="w-4 h-4 text-purple-600" />
              <h4 className="font-semibold text-purple-900">Patent Landscape</h4>
            </div>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Active patents: <strong>{aggregatedData.activePatents}</strong></li>
              <li>• FTO status: <strong>{aggregatedData.ftoStatus}</strong></li>
              <li>• Earliest expiry: <strong>{aggregatedData.patentExpiry}</strong></li>
            </ul>
          </div>

          {/* Regulatory */}
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="w-4 h-4 text-red-600" />
              <h4 className="font-semibold text-red-900">Regulatory Compliance</h4>
            </div>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Compliance: <strong>{aggregatedData.complianceScore}/100</strong></li>
              <li>• Pathway: <strong>{aggregatedData.regulatoryPathway}</strong></li>
              <li>• Timeline: <strong>{aggregatedData.approvalTimeline}</strong></li>
            </ul>
          </div>

          {/* EXIM */}
          <div className="bg-cyan-50 border-l-4 border-cyan-500 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Globe className="w-4 h-4 text-cyan-600" />
              <h4 className="font-semibold text-cyan-900">Supply Chain Intelligence</h4>
            </div>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Trade volume: <strong>${aggregatedData.tradeVolume}M</strong></li>
              <li>• Supply risk: <strong>{aggregatedData.supplyRisk}</strong></li>
              <li>• FDA sources: <strong>Available</strong></li>
            </ul>
          </div>

          {/* Patient Sentiment */}
          <div className="bg-pink-50 border-l-4 border-pink-500 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Users className="w-4 h-4 text-pink-600" />
              <h4 className="font-semibold text-pink-900">Patient Sentiment</h4>
            </div>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Satisfaction: <strong>{aggregatedData.patientSatisfaction}/10</strong></li>
              <li>• Unmet needs: <strong>{aggregatedData.unmetNeeds}</strong></li>
              <li>• Sentiment: <strong>{aggregatedData.marketSentiment}</strong></li>
            </ul>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="font-semibold text-amber-900">Validation Disclosure</div>
          <div className="mt-1 text-sm text-amber-900/90">
            Current result labeling: <strong>{aggregatedData.simulationLabel}</strong>. Use this summary alongside the benchmark and evidence dossier to separate validated logic from simulated benchmark scaffolding.
          </div>
        </div>
      </div>

      {/* Strategic Recommendations */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700 rounded-2xl shadow-lg dark:shadow-2xl p-6 text-white">
        <div className="flex items-start space-x-3 mb-4">
          <Award className="w-8 h-8 flex-shrink-0" />
          <div>
            <h3 className="text-xl font-bold mb-2">Strategic Recommendations</h3>
            <p className="text-indigo-100 text-sm">AI-synthesized insights from all 10 specialized agents</p>
          </div>
        </div>

        <div className="space-y-3">
          {aggregatedData.roi > 150 && (
            <div className="flex items-start space-x-3 bg-white/10 backdrop-blur rounded-lg p-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Strong Financial Outlook</div>
                <div className="text-sm text-indigo-100">
                  With {aggregatedData.roi}% projected ROI and ${aggregatedData.marketSize}B market size, this represents an excellent investment opportunity.
                </div>
              </div>
            </div>
          )}
          
          {aggregatedData.safetyScore > 8 && (
            <div className="flex items-start space-x-3 bg-white/10 backdrop-blur rounded-lg p-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Favorable Safety Profile</div>
                <div className="text-sm text-indigo-100">
                  Safety score of {aggregatedData.safetyScore}/10 with {aggregatedData.totalTrials} supporting trials indicates strong clinical viability.
                </div>
              </div>
            </div>
          )}
          
          {aggregatedData.ftoStatus === 'Clear' && (
            <div className="flex items-start space-x-3 bg-white/10 backdrop-blur rounded-lg p-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Clear IP Landscape</div>
                <div className="text-sm text-indigo-100">
                  Freedom-to-operate is clear with {aggregatedData.activePatents} active patents and expiry timeline aligning with market entry strategy.
                </div>
              </div>
            </div>
          )}
          
          {aggregatedData.riskFlags > 0 && (
            <div className="flex items-start space-x-3 bg-yellow-500/20 backdrop-blur rounded-lg p-3 border border-yellow-400/30">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-300" />
              <div>
                <div className="font-semibold">Risk Mitigation Required</div>
                <div className="text-sm text-indigo-100">
                  {aggregatedData.riskFlags} risk flag(s) identified. Recommend detailed due diligence on flagged areas before proceeding.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export Actions */}
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <div className="font-medium text-gray-900 dark:text-white">Complete analysis ready</div>
          <div>Data aggregated from 10 specialized AI agents</div>
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg">
          <Download className="w-4 h-4" />
          <span>Export Full Report</span>
        </button>
      </div>
    </div>
  );
};

export default ComprehensiveSummary;
