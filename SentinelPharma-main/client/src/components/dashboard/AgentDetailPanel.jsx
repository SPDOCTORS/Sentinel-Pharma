/**
 * SentinelPharma Agent Detail Panel Component
 * ========================================
 * Displays detailed results from individual AI agents.
 * Shows comprehensive data when an agent card is clicked.
 *
 * NOTE: Layout adjusted so footer (Export Report) is always visible.
 * Logic and data generation remain unchanged.
 */

import { 
  X, 
  FileText, 
  TrendingUp, 
  Eye, 
  Shield, 
  Users, 
  Network,
  Globe,
  Database,
  Ship,
  BarChart3,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Building2,
  Pill,
  FlaskConical,
  BookOpen,
  Sparkles
} from 'lucide-react';

const VITE_ENV = typeof import.meta !== 'undefined' ? (import.meta.env || {}) : {};
const NODE_ENV = (typeof process !== 'undefined' && process.env?.NODE_ENV) ? process.env.NODE_ENV : VITE_ENV.MODE;
const IS_DEV = NODE_ENV === 'development';

const AgentDetailPanel = ({ agent, data, onClose, molecule }) => {
  if (!agent) return null;

  // Generate comprehensive mock data based on molecule if no real data
  const generateMockData = (agentName, drug) => {
    const mockDataByAgent = {
      'Master Orchestrator': {
        processing_time: '14.2 seconds',
        confidence: 94,
        recommendation: `${drug} shows strong repurposing potential for oncology indications`,
        risk_level: 'Medium',
        roi_potential: 'High',
        estimated_value: '520M',
        agents_coordinated: 10,
        synthesis: `Comprehensive analysis of ${drug} reveals promising opportunities in drug repurposing. The molecule demonstrates favorable safety profile with established clinical history. Market analysis indicates significant unmet need in target indications.`
      },
      'IQVIA Insights Agent': {
        market_size: '3.2B',
        year: '2024',
        cagr: '7.8',
        projection_year: '2030',
        market_share: '15-22',
        competitors: ['Pfizer', 'Novartis', 'Roche', 'AstraZeneca', 'Merck'],
        price_per_unit: '55-85',
        regions: ['North America', 'Europe', 'Asia-Pacific', 'Latin America'],
        unmet_need: '8.7',
        therapy_area: 'Oncology/Immunology',
        patient_population: '2.4M patients globally',
        market_trends: [
          { trend: 'Shift to targeted therapies', impact: 'High' },
          { trend: 'Biosimilar competition', impact: 'Medium' },
          { trend: 'Value-based pricing', impact: 'High' }
        ]
      },
      'EXIM Trends Agent': {
        trade_volume: '1.8B',
        exporters: ['India', 'China', 'Germany', 'Ireland', 'Switzerland'],
        import_dependency: '42',
        supply_risk: 'Moderate',
        api_availability: 'High',
        api_suppliers: '18',
        cost_savings: '22-30',
        compliance_status: 'Cleared',
        trade_data: [
          { country: 'India', volume: '$650M', growth: '+12%' },
          { country: 'China', volume: '$420M', growth: '+8%' },
          { country: 'Germany', volume: '$280M', growth: '+5%' }
        ],
        tariff_info: 'Most Favored Nation rates apply',
        logistics_score: 8.2
      },
      'Patent Landscape Agent': {
        active_patents: 28,
        freedom_to_operate: 'Clear with design-around',
        earliest_expiration: '2026',
        patent_holders: ['Original Innovator', 'Teva', 'Sun Pharma', 'Dr. Reddys'],
        challenges: 4,
        filing_opportunity: 'Strong',
        ip_recommendation: 'File defensive patents for novel formulations and delivery systems',
        patents: [
          { id: 'US10234567', title: `${drug} extended release formulation`, status: 'Active', expiration: '2027', assignee: 'Pharma Corp' },
          { id: 'US10345678', title: `${drug} combination therapy`, status: 'Active', expiration: '2028', assignee: 'BioTech Inc' },
          { id: 'US10456789', title: `${drug} manufacturing process`, status: 'Expiring Soon', expiration: '2026', assignee: 'Generic Labs' }
        ],
        jurisdictions: ['US', 'EU', 'Japan', 'China', 'India']
      },
      'Clinical Trials Agent': {
        total_trials_found: 54,
        phase1: 15,
        phase2: 26,
        phase3: 13,
        safety_score: 8.8,
        efficacy_rating: 'High',
        current_phase: 'Phase 3',
        pathway: '505(b)(2)',
        endpoints_met: 87,
        indications: ['Type 2 Diabetes', 'NASH', 'Cardiovascular', 'Oncology', 'Neurodegenerative'],
        trials: [
          { nct_id: 'NCT04521234', title: `${drug} in Treatment-Resistant Cases`, status: 'Recruiting', phase: 'Phase 3', enrollment: '450' },
          { nct_id: 'NCT04532345', title: `${drug} Combination Study`, status: 'Active', phase: 'Phase 2', enrollment: '280' },
          { nct_id: 'NCT04543456', title: `Pediatric ${drug} Safety Study`, status: 'Completed', phase: 'Phase 2', enrollment: '120' }
        ],
        sponsors: ['NIH', 'Academic Centers', 'Pharma Companies']
      },
      'Internal Knowledge Agent': {
        documents_found: 18,
        relevance: 96,
        insights_count: 12,
        last_update: 'Today',
        strategic_fit: 'High',
        prior_research: 'Positive',
        resource_estimate: '$18-25M',
        timeline: '28-36 months',
        team_recommendation: 'Proceed to detailed feasibility study',
        documents: [
          { name: 'Q4 Strategic Portfolio Review.pdf', type: 'Strategy', relevance: 98 },
          { name: `${drug} Competitive Intelligence.pdf`, type: 'Market Intel', relevance: 95 },
          { name: 'Field Force Feedback Report.pdf', type: 'Sales Intel', relevance: 88 },
          { name: 'R&D Pipeline Assessment.pdf', type: 'R&D', relevance: 85 }
        ],
        key_insights: [
          'Internal modeling suggests 18% margin improvement opportunity',
          'Field team reports high physician interest in new indication',
          'Competitive intelligence indicates favorable market window through Q3 2026',
          'Manufacturing capacity available at existing facilities'
        ]
      },
      'Web Intelligence Agent': {
        news_count: 32,
        publications: 189,
        guidelines: 12,
        sentiment: 'Positive',
        positive_mentions: 82,
        kol_interest: 'High',
        kol_count: 28,
        social_score: 8.1,
        emerging_signal: 'Growing interest in combination therapies and new indications',
        news: [
          { title: `FDA grants breakthrough designation for ${drug} in rare disease`, source: 'Reuters Health', date: '3 days ago' },
          { title: `${drug} shows promise in Phase 3 cardiovascular outcomes trial`, source: 'BioPharma Dive', date: '1 week ago' },
          { title: `New treatment guidelines recommend ${drug} as first-line therapy`, source: 'Medscape', date: '2 weeks ago' }
        ],
        papers: [
          { title: `Long-term efficacy and safety of ${drug}: A systematic review`, journal: 'NEJM', citations: 67 },
          { title: `${drug} mechanism of action in metabolic disease`, journal: 'Nature Medicine', citations: 45 },
          { title: `Real-world outcomes with ${drug} therapy`, journal: 'Lancet', citations: 38 }
        ]
      },
      'Regulatory Compliance': {
        compliance_score: 88,
        compliance_grade: 'A-',
        warning_count: 1,
        recommended_pathway: '505(b)(2)',
        fda_status: 'Eligible for expedited review',
        ema_status: 'Aligned',
        safety_monitoring: 'Standard',
        approval_timeline: '18-24 months',
        fda_orange_book: {
          listed: true,
          patent_expiry: '2027',
          application_type: 'NDA',
          exclusivity_expiry: '2026'
        },
        black_box_warnings: [
          { warning: 'Cardiovascular risk in certain populations', severity: 'Moderate', mitigation: 'Patient selection criteria and monitoring protocol' }
        ],
        regulatory_pathway: {
          recommended: '505(b)(2)',
          rationale: 'Leverages existing safety data while allowing new indication claims',
          timeline: '18-24 months',
          cost_estimate: '$12-15M'
        }
      },
      'Patient Sentiment': {
        satisfaction_score: 7.6,
        unmet_needs_count: 6,
        complaints: 'Dosing frequency, gastrointestinal side effects, cost concerns',
        qol_score: 'Significant',
        preference: 72,
        adherence: 'Dosing complexity',
        opportunity: 'Once-daily extended-release formulation could address major patient concerns',
        sentiment_breakdown: {
          positive: 65,
          neutral: 22,
          negative: 13
        },
        unmet_needs: [
          { need: 'Reduced dosing frequency', priority: 'High', opportunity: 'Extended release formulation' },
          { need: 'Better GI tolerability', priority: 'High', opportunity: 'Modified release technology' },
          { need: 'Lower out-of-pocket cost', priority: 'Medium', opportunity: 'Patient assistance programs' },
          { need: 'Combination products', priority: 'Medium', opportunity: 'Fixed-dose combinations' }
        ],
        patient_quotes: [
          '"Would be great if I didn\'t have to take it multiple times a day"',
          '"The medication works but the side effects are challenging initially"',
          '"Cost is a barrier even with insurance"'
        ]
      },
      'ESG & Sustainability': {
        esg_score: 76,
        carbon_footprint: 'Medium-Low',
        carbon_reduction: '22',
        green_suppliers: 6,
        labor_score: 88,
        waste_score: 'A-',
        water_efficiency: '18',
        roadmap: 'Aligned with Science-Based Targets initiative for 2030',
        environmental_metrics: {
          ghg_emissions: '12,500 tonnes CO2e annually',
          renewable_energy: '45% of manufacturing',
          water_recycling: '68% rate',
          waste_diversion: '82% from landfill'
        },
        social_metrics: {
          diversity_score: 78,
          safety_incidents: 2,
          community_investment: '$2.4M annually',
          employee_satisfaction: 82
        },
        governance_metrics: {
          board_independence: 85,
          ethics_training: '100% completion',
          supplier_audits: 156,
          compliance_violations: 0
        },
        suppliers: [
          { name: 'GreenChem India', score: 85, certifications: ['ISO 14001', 'EcoVadis Gold'] },
          { name: 'SustainaPharma', score: 82, certifications: ['B Corp', 'ISO 14001'] },
          { name: 'BioSource EU', score: 79, certifications: ['EcoVadis Silver', 'GMP'] }
        ]
      }
    };
    return mockDataByAgent[agentName] || {};
  };

  // Use provided data or generate mock data
  // Debug: Log what data we received
  console.log(`[AgentDetailPanel] Agent: ${agent.name}, Data received:`, data ? 'YES' : 'NO', data);
  
  const agentData = data || generateMockData(agent.name, molecule || 'Drug');
  const isRealData = !!data; // Track if we're using real or mock data

  const docs = agent.name === 'Internal Knowledge Agent'
    ? (agentData.relevant_documents
      ? agentData.relevant_documents.map(doc => ({
          name: doc.title,
          type: doc.file_type ? doc.file_type.toUpperCase() : doc.department,
          relevance: Math.round((doc.relevance_score || 0) * 100),
          snippet: doc.snippet
        }))
      : agentData.documents || [
          { name: 'Q3 Strategy Deck.pdf', type: 'Strategy', relevance: 95 },
          { name: 'Field Intelligence Report.pdf', type: 'Market Intel', relevance: 88 },
          { name: 'Competitive Analysis 2024.pdf', type: 'Competition', relevance: 82 }
        ])
    : [];

  const relevanceVal = agent.name === 'Internal Knowledge Agent'
    ? (agentData.relevant_documents && agentData.relevant_documents.length > 0
      ? Math.round(Math.max(...agentData.relevant_documents.map(d => d.relevance_score || 0)) * 100)
      : (agentData.relevance || 94))
    : 94;

  const insights = agent.name === 'Internal Knowledge Agent'
    ? (agentData.rag_insights?.insights
      ? agentData.rag_insights.insights.map(ins => ins.insight)
      : agentData.key_insights || [
          'Internal pricing strategy suggests 15% margin opportunity',
          'Field team reports strong physician interest in new indication',
          'Competitive intelligence indicates market window through Q2 2025'
        ])
    : [];

  const insightsCount = agent.name === 'Internal Knowledge Agent'
    ? (agentData.rag_insights?.total_insights || agentData.insights_count || insights.length)
    : 8;

  const lastUpdate = agent.name === 'Internal Knowledge Agent'
    ? (agentData.analysis_date
      ? new Date(agentData.analysis_date).toLocaleDateString()
      : agentData.last_update || 'Today')
    : 'Today';

  // Helper to render LLM insights section
  const renderLLMInsights = () => {
    // Determine the LLM field name based on agent
    const llmFieldMap = {
      'Master Orchestrator': 'llm_synthesis',
      'IQVIA Insights Agent': 'llm_market_strategy',
      'EXIM Trends Agent': 'llm_supply_strategy',
      'Patent Landscape Agent': 'llm_strategy',
      'Clinical Trials Agent': 'llm_insights',
      'Internal Knowledge Agent': 'llm_synthesis',
      'Web Intelligence Agent': 'llm_intelligence',
      'Regulatory Compliance': 'llm_assessment',
      'Patient Sentiment': 'llm_insights',
      'ESG & Sustainability': 'llm_assessment',
      'Vision Agent': 'llm_insights',
      'Validation Agent': 'llm_validation'
    };

    const llmField = llmFieldMap[agent.name];
    const llmContent = agentData[llmField];
    const llmProvider = agentData.llm_provider;
    const providerDisplayName = llmProvider === 'gemini'
      ? 'Gemini'
      : llmProvider === 'ollama'
        ? 'Llama 3'
        : llmProvider === 'openai'
          ? 'GPT-4'
          : llmProvider;

    if (!llmContent) return null;

    return (
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-5 border-2 border-purple-200">
        <div className="flex items-start justify-between mb-3">
          <h4 className="text-lg font-semibold text-gray-900 flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-purple-600" />
            AI-Generated Strategic Insights
          </h4>
          {llmProvider && (
            <span className="px-3 py-1 bg-white border border-purple-300 rounded-full text-xs font-medium text-purple-700">
              {providerDisplayName} Analysis
            </span>
          )}
        </div>
        <div className="bg-white rounded-lg p-4 border border-purple-100">
          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
            {llmContent}
          </p>
        </div>
        {isRealData && (
          <div className="mt-2 flex items-center text-xs text-purple-600">
            <CheckCircle className="w-3 h-3 mr-1" />
            Live AI Analysis • Real-time Data
          </div>
        )}
      </div>
    );
  };

  // Add Sparkles icon to imports at top (it's already imported, so this is just a note)

  // Agent-specific configurations for all 10 agents (7 mandatory + 3 strategic)
  const agentConfigs = {
    'Master Orchestrator': {
      icon: Network,
      color: 'indigo',
      gradient: 'from-indigo-500 to-indigo-600',
      description: 'Orchestrates conversation, decomposes queries, and synthesizes final response'
    },
    'IQVIA Insights Agent': {
      icon: BarChart3,
      color: 'blue',
      gradient: 'from-blue-500 to-blue-600',
      description: 'Market size, CAGR trends, and therapy-level competition data'
    },
    'EXIM Trends Agent': {
      icon: Ship,
      color: 'cyan',
      gradient: 'from-cyan-500 to-cyan-600',
      description: 'Export-import data, trade volumes, and sourcing insights'
    },
    'Patent Landscape Agent': {
      icon: FileText,
      color: 'purple',
      gradient: 'from-purple-500 to-purple-600',
      description: 'USPTO patents, expiry timelines, and Freedom-to-Operate flags'
    },
    'Clinical Trials Agent': {
      icon: Shield,
      color: 'green',
      gradient: 'from-green-500 to-green-600',
      description: 'Trial pipeline data, sponsor profiles, and phase distributions'
    },
    'Internal Knowledge Agent': {
      icon: Database,
      color: 'orange',
      gradient: 'from-orange-500 to-orange-600',
      description: 'Summarizes uploaded internal PDFs and strategy documents'
    },
    'Web Intelligence Agent': {
      icon: Globe,
      color: 'pink',
      gradient: 'from-pink-500 to-pink-600',
      description: 'Real-time web search for guidelines, news, and publications'
    },
    // Strategic Agents (High Value - EY Focus)
    'Regulatory Compliance': {
      icon: Shield,
      color: 'red',
      gradient: 'from-red-500 to-red-600',
      description: 'FDA Orange Book, black-box warnings, and regulatory pathway assessment'
    },
    'Patient Sentiment': {
      icon: Users,
      color: 'rose',
      gradient: 'from-rose-500 to-rose-600',
      description: 'Unmet medical needs identification from patient forums and sentiment analysis'
    },
    'ESG & Sustainability': {
      icon: TrendingUp,
      color: 'emerald',
      gradient: 'from-emerald-500 to-emerald-600',
      description: 'Green sourcing scores, carbon footprint, and supplier ESG ratings'
    }
  };

  const config = agentConfigs[agent.name] || agentConfigs['Master Orchestrator'];
  const AgentIcon = config.icon;

  // Render Clinical Agent Details
  const renderClinicalDetails = () => (
    <div className="space-y-6">
      {/* LLM Insights */}
      {renderLLMInsights()}
      
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard 
          label="Total Trials" 
          value={agentData.total_trials_found || 0} 
          icon={FlaskConical}
          color="blue"
        />
        <MetricCard 
          label="Safety Score" 
          value={`${agentData.safety_score || 0}/10`} 
          icon={Shield}
          color="green"
        />
        <MetricCard 
          label="Efficacy Rating" 
          value={agentData.efficacy_rating || 'N/A'} 
          icon={CheckCircle}
          color="purple"
        />
        <MetricCard 
          label="Phase" 
          value={agentData.current_phase || 'Phase 2'} 
          icon={Clock}
          color="orange"
        />
      </div>

      {/* Clinical Trials List */}
      {agentData.trials && agentData.trials.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <BookOpen className="w-4 h-4 mr-2" />
            Active Clinical Trials
          </h4>
          <div className="space-y-3">
            {agentData.trials.slice(0, 5).map((trial, idx) => (
              <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">{trial.nct_id || `NCT0000000${idx}`}</p>
                    <p className="text-sm text-gray-600">{trial.title || `Clinical Trial for ${molecule}`}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    trial.status === 'Recruiting' ? 'bg-green-100 text-green-700' :
                    trial.status === 'Completed' ? 'bg-blue-100 text-blue-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {trial.status || 'Active'}
                  </span>
                </div>
                <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                  <span>Phase: {trial.phase || 'Phase 2'}</span>
                  <span>Enrollment: {trial.enrollment || '250'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indications */}
      {agentData.indications && (
        <div className="bg-blue-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Potential Indications</h4>
          <div className="flex flex-wrap gap-2">
            {agentData.indications.map((indication, idx) => (
              <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                {indication}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Render Patent Agent Details
  const renderPatentDetails = () => (
    <div className="space-y-6">
      {/* LLM Insights */}
      {renderLLMInsights()}
      
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard 
          label="Active Patents" 
          value={agentData.active_patents || 0} 
          icon={FileText}
          color="purple"
        />
        <MetricCard 
          label="FTO Status" 
          value={agentData.freedom_to_operate || 'Clear'} 
          icon={CheckCircle}
          color="green"
        />
        <MetricCard 
          label="Earliest Expiry" 
          value={agentData.earliest_expiration || '2027'} 
          icon={Clock}
          color="orange"
        />
        <MetricCard 
          label="Jurisdictions" 
          value={agentData.jurisdictions?.length || 5} 
          icon={Globe}
          color="blue"
        />
      </div>

      {/* Patent List */}
      {agentData.patents && agentData.patents.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Key Patents</h4>
          <div className="space-y-3">
            {agentData.patents.slice(0, 5).map((patent, idx) => (
              <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">{patent.id || `US${10000000 + idx}`}</p>
                    <p className="text-sm text-gray-600">{patent.title || `Patent for ${molecule} formulation`}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    patent.status === 'Active' ? 'bg-red-100 text-red-700' :
                    patent.status === 'Expired' ? 'bg-gray-100 text-gray-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {patent.status || 'Active'}
                  </span>
                </div>
                <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                  <span>Expires: {patent.expiration || '2028'}</span>
                  <span>Assignee: {patent.assignee || 'Pharma Corp'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Assessment */}
      <div className="bg-purple-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
          <AlertTriangle className="w-4 h-4 mr-2 text-purple-600" />
          IP Risk Assessment
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{agentData.low_risk || 8}</div>
            <div className="text-xs text-gray-600">Low Risk</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{agentData.medium_risk || 3}</div>
            <div className="text-xs text-gray-600">Medium Risk</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{agentData.high_risk || 1}</div>
            <div className="text-xs text-gray-600">High Risk</div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render Market Agent Details
  const renderMarketDetails = () => (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard 
          label="Market Size" 
          value={agentData.market_size || '$4.2B'} 
          icon={DollarSign}
          color="green"
        />
        <MetricCard 
          label="5Y CAGR" 
          value={agentData.cagr || '12.5%'} 
          icon={TrendingUp}
          color="blue"
        />
        <MetricCard 
          label="Competitors" 
          value={agentData.competitor_count || 8} 
          icon={Building2}
          color="purple"
        />
        <MetricCard 
          label="ROI Potential" 
          value={agentData.roi_potential || '340%'} 
          icon={BarChart3}
          color="orange"
        />
      </div>

      {/* Competitor Analysis */}
      {agentData.competitors && (
        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Top Competitors</h4>
          <div className="space-y-2">
            {(agentData.competitors || [
              { name: 'Pfizer', share: 28 },
              { name: 'Novartis', share: 22 },
              { name: 'Roche', share: 18 },
              { name: 'AstraZeneca', share: 15 },
              { name: 'Others', share: 17 }
            ]).map((comp, idx) => (
              <div key={idx} className="flex items-center">
                <span className="w-24 text-sm text-gray-700">{comp.name}</span>
                <div className="flex-1 mx-3">
                  <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full"
                      style={{ width: `${comp.share}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-900">{comp.share}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market Forecast */}
      <div className="bg-green-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Market Forecast</h4>
        <div className="grid grid-cols-4 gap-4">
          {['2024', '2025', '2026', '2027'].map((year, idx) => (
            <div key={year} className="text-center">
              <div className="text-lg font-bold text-green-700">${(4.2 + idx * 0.6).toFixed(1)}B</div>
              <div className="text-xs text-gray-600">{year}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Render Validation Agent Details
  const renderValidationDetails = () => (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard 
          label="Confidence" 
          value={`${agentData.confidence_score || 85}%`} 
          icon={Shield}
          color="yellow"
        />
        <MetricCard 
          label="Verified Claims" 
          value={agentData.verified_claims || 12} 
          icon={CheckCircle}
          color="green"
        />
        <MetricCard 
          label="Risk Flags" 
          value={agentData.risk_flags?.length || 2} 
          icon={AlertTriangle}
          color="red"
        />
        <MetricCard 
          label="Data Sources" 
          value={agentData.sources_checked || 15} 
          icon={Database}
          color="blue"
        />
      </div>

      {/* Risk Flags */}
      {(agentData.risk_flags || ['Potential drug interaction with warfarin', 'Limited Phase 3 data']).length > 0 && (
        <div className="bg-red-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2 text-red-600" />
            Identified Risk Flags
          </h4>
          <ul className="space-y-2">
            {(agentData.risk_flags || ['Potential drug interaction with warfarin', 'Limited Phase 3 data']).map((risk, idx) => (
              <li key={idx} className="flex items-start">
                <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                <span className="text-gray-700">{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Verified Claims */}
      <div className="bg-green-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
          <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
          Verified Claims
        </h4>
        <ul className="space-y-2">
          {(agentData.verified || [
            'Mechanism of action validated across 3 studies',
            'Safety profile consistent with Phase 2 data',
            'Bioavailability confirmed at target dose'
          ]).map((claim, idx) => (
            <li key={idx} className="flex items-start">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
              <span className="text-gray-700">{claim}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  // Render KOL Finder Details
  const renderKOLDetails = () => (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard 
          label="KOLs Found" 
          value={agentData.kol_count || 15} 
          icon={Users}
          color="pink"
        />
        <MetricCard 
          label="Publications" 
          value={agentData.total_publications || 450} 
          icon={BookOpen}
          color="blue"
        />
        <MetricCard 
          label="H-Index Avg" 
          value={agentData.avg_h_index || 42} 
          icon={TrendingUp}
          color="purple"
        />
        <MetricCard 
          label="Countries" 
          value={agentData.countries || 12} 
          icon={Globe}
          color="green"
        />
      </div>

      {/* Top KOLs */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Top Key Opinion Leaders</h4>
        <div className="space-y-3">
          {(agentData.kols || [
            { name: 'Dr. Sarah Chen', institution: 'Harvard Medical School', h_index: 58, specialty: 'Oncology' },
            { name: 'Prof. James Miller', institution: 'Stanford University', h_index: 52, specialty: 'Pharmacology' },
            { name: 'Dr. Maria Garcia', institution: 'Mayo Clinic', h_index: 48, specialty: 'Clinical Research' }
          ]).map((kol, idx) => (
            <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200 flex items-center">
              <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-pink-600 rounded-full flex items-center justify-center text-white font-bold">
                {kol.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="ml-3 flex-1">
                <p className="font-medium text-gray-900">{kol.name}</p>
                <p className="text-sm text-gray-600">{kol.institution}</p>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-pink-600">H-Index: {kol.h_index}</div>
                <div className="text-xs text-gray-500">{kol.specialty}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Render Pathfinder Details
  const renderPathfinderDetails = () => (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard 
          label="Pathways Found" 
          value={agentData.pathways_count || 8} 
          icon={Network}
          color="indigo"
        />
        <MetricCard 
          label="Target Genes" 
          value={agentData.target_genes || 24} 
          icon={Pill}
          color="purple"
        />
        <MetricCard 
          label="Interactions" 
          value={agentData.interactions || 156} 
          icon={Globe}
          color="blue"
        />
        <MetricCard 
          label="Confidence" 
          value={`${agentData.pathway_confidence || 92}%`} 
          icon={CheckCircle}
          color="green"
        />
      </div>

      {/* Key Pathways */}
      <div className="bg-indigo-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Key Molecular Pathways</h4>
        <div className="space-y-2">
          {(agentData.pathways || [
            { name: 'PI3K/AKT/mTOR Signaling', relevance: 95 },
            { name: 'MAPK Cascade', relevance: 88 },
            { name: 'NF-κB Pathway', relevance: 82 },
            { name: 'Apoptosis Regulation', relevance: 78 }
          ]).map((pathway, idx) => (
            <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-900">{pathway.name}</span>
                <span className="text-sm text-indigo-600 font-semibold">{pathway.relevance}% relevant</span>
              </div>
              <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full"
                  style={{ width: `${pathway.relevance}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Default/Generic render
  const renderGenericDetails = () => (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Agent Output</h4>
        <pre className="text-sm text-gray-700 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );

  // Select renderer based on agent type
  const renderContent = () => {
    switch (agent.name) {
      case 'Master Orchestrator':
        return renderOrchestratorDetails();
      case 'IQVIA Insights Agent':
        return renderIQVIADetails();
      case 'EXIM Trends Agent':
        return renderEXIMDetails();
      case 'Patent Landscape Agent':
        return renderPatentDetails();
      case 'Clinical Trials Agent':
        return renderClinicalDetails();
      case 'Internal Knowledge Agent':
        return renderInternalDetails();
      case 'Web Intelligence Agent':
        return renderWebIntelDetails();
      // Strategic Agents
      case 'Regulatory Compliance':
        return renderRegulatoryDetails();
      case 'Patient Sentiment':
        return renderPatientSentimentDetails();
      case 'ESG & Sustainability':
        return renderESGDetails();
      default:
        return renderGenericDetails();
    }
  };

  // ===== STRATEGIC AGENT RENDERS =====

  // Render Regulatory Compliance Agent Details
  const renderRegulatoryDetails = () => (
    <div className="space-y-6">
      {/* LLM Insights */}
      {renderLLMInsights()}
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Compliance Score" value={`${agentData.compliance_score || 85}/100`} icon={Shield} color="red" />
        <MetricCard label="Grade" value={agentData.compliance_grade || 'B'} icon={CheckCircle} color="green" />
        <MetricCard label="Warnings" value={agentData.warning_count || 1} icon={AlertTriangle} color="yellow" />
        <MetricCard label="Pathway" value={agentData.recommended_pathway || '505(b)(2)'} icon={FileText} color="purple" />
      </div>
      
      {/* FDA Orange Book Status */}
      <div className="bg-blue-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
          <FileText className="w-4 h-4 mr-2 text-blue-600" />
          FDA Orange Book Status
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div><span className="text-gray-600">Listed:</span> <span className="font-medium">{agentData.fda_orange_book?.listed ? 'Yes' : 'No'}</span></div>
          <div><span className="text-gray-600">Patent Expiry:</span> <span className="font-medium">{agentData.fda_orange_book?.patent_expiry || 'N/A'}</span></div>
          <div><span className="text-gray-600">Application Type:</span> <span className="font-medium">{agentData.fda_orange_book?.application_type || 'NDA'}</span></div>
          <div><span className="text-gray-600">Exclusivity:</span> <span className="font-medium">{agentData.fda_orange_book?.exclusivity_expiry || 'N/A'}</span></div>
        </div>
      </div>

      {/* Black Box Warnings */}
      {(agentData.black_box_warnings || []).length > 0 && (
        <div className="bg-red-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2 text-red-600" />
            Black Box Warnings
          </h4>
          <ul className="space-y-2">
            {(agentData.black_box_warnings || ['Monitor for adverse reactions']).map((warning, idx) => (
              <li key={idx} className="flex items-start">
                <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                <span className="text-gray-700">{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Regulatory Pathway */}
      <div className="bg-purple-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Recommended Regulatory Pathway</h4>
        <div className="grid grid-cols-2 gap-4">
          <div><span className="text-gray-600">Pathway:</span> <span className="font-semibold text-purple-700">{agentData.recommended_pathway || '505(b)(2)'}</span></div>
          <div><span className="text-gray-600">Timeline:</span> <span className="font-medium">{agentData.estimated_timeline_months || 36} months</span></div>
          <div><span className="text-gray-600">Complexity:</span> <span className="font-medium">{agentData.pathway_complexity || 'Medium'}</span></div>
          <div><span className="text-gray-600">Est. Cost:</span> <span className="font-medium">{agentData.pathway_assessment?.estimated_cost || '$15-40M'}</span></div>
        </div>
        <p className="text-sm text-gray-600 mt-3">{agentData.pathway_rationale || 'Can reference existing safety/efficacy data'}</p>
      </div>
    </div>
  );

  // Render Patient Sentiment Agent Details
  const renderPatientSentimentDetails = () => (
    <div className="space-y-6">
      {/* LLM Insights */}
      {renderLLMInsights()}
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Sentiment" value={agentData.overall_sentiment || 'Mixed'} icon={Users} color="rose" />
        <MetricCard label="Unmet Needs" value={agentData.unmet_needs_count || 5} icon={AlertTriangle} color="yellow" />
        <MetricCard label="Burden Score" value={`${agentData.treatment_burden_score || 6}/10`} icon={TrendingUp} color="orange" />
        <MetricCard label="Opportunity" value={agentData.market_opportunity_signal || 'Strong'} icon={CheckCircle} color="green" />
      </div>

      {/* Sentiment Breakdown */}
      <div className="bg-rose-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Sentiment Analysis</h4>
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{agentData.sentiment_breakdown?.positive || '35%'}</div>
            <div className="text-xs text-gray-600">Positive</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">{agentData.sentiment_breakdown?.neutral || '30%'}</div>
            <div className="text-xs text-gray-600">Neutral</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{agentData.sentiment_breakdown?.negative || '35%'}</div>
            <div className="text-xs text-gray-600">Negative</div>
          </div>
        </div>
        <p className="text-sm text-gray-600">Trend: <span className="font-medium">{agentData.sentiment_trend || 'Stable'}</span></p>
      </div>

      {/* Unmet Medical Needs */}
      <div className="bg-yellow-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
          <AlertTriangle className="w-4 h-4 mr-2 text-yellow-600" />
          Identified Unmet Medical Needs
        </h4>
        <div className="space-y-3">
          {(agentData.unmet_needs_identified || [
            { need: 'Better-tolerated treatment option', prevalence: '42%', opportunity_size: 'High' },
            { need: 'Once-weekly dosing alternative', prevalence: '28%', opportunity_size: 'High' },
            { need: 'More affordable options', prevalence: '35%', opportunity_size: 'Medium' }
          ]).slice(0, 4).map((need, idx) => (
            <div key={idx} className="bg-white rounded-lg p-3 border border-yellow-200">
              <div className="flex justify-between items-start">
                <p className="font-medium text-gray-900">{need.need}</p>
                <span className={`px-2 py-1 text-xs rounded-full ${need.opportunity_size === 'High' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {need.opportunity_size}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">Prevalence: {need.prevalence}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top Complaints */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Top Patient Complaints</h4>
        <div className="space-y-2">
          {(agentData.top_complaints || [
            { complaint: 'Severe nausea in first week', frequency: 32, severity: 'High' },
            { complaint: 'Cost concerns', frequency: 28, severity: 'High' },
            { complaint: 'Slow onset of action', frequency: 22, severity: 'Medium' }
          ]).slice(0, 4).map((c, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <span className="text-gray-700">{c.complaint}</span>
              <span className={`px-2 py-1 text-xs rounded-full ${c.severity === 'High' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {c.frequency}% mention
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Render ESG & Sustainability Agent Details
  const renderESGDetails = () => (
    <div className="space-y-6">
      {/* LLM Insights */}
      {renderLLMInsights()}
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="ESG Score" value={`${agentData.overall_esg_score || 72}/100`} icon={TrendingUp} color="emerald" />
        <MetricCard label="Rating" value={agentData.esg_rating || 'A'} icon={CheckCircle} color="green" />
        <MetricCard label="Carbon" value={agentData.carbon_intensity || 'Medium'} icon={Globe} color="blue" />
        <MetricCard label="Green Score" value={agentData.green_sourcing_score?.score || 68} icon={Shield} color="cyan" />
      </div>

      {/* ESG Component Scores */}
      <div className="bg-emerald-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">ESG Component Breakdown</h4>
        <div className="space-y-3">
          {[
            { name: 'Environmental', score: agentData.environmental_score || 70, color: 'green' },
            { name: 'Social', score: agentData.social_score || 75, color: 'blue' },
            { name: 'Governance', score: agentData.governance_score || 78, color: 'purple' }
          ].map((comp, idx) => (
            <div key={idx}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">{comp.name}</span>
                <span className="font-semibold">{comp.score}/100</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full bg-${comp.color}-500 rounded-full`} style={{ width: `${comp.score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Best ESG Supplier */}
      {agentData.best_esg_supplier && (
        <div className="bg-green-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
            Recommended Supplier (Best ESG)
          </h4>
          <div className="bg-white rounded-lg p-3 border border-green-200">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-900">{agentData.best_esg_supplier.name}</span>
              <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">
                Score: {agentData.best_esg_supplier.esg_score}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">Rating: {agentData.best_esg_supplier.rating}</p>
          </div>
        </div>
      )}

      {/* Carbon Footprint */}
      <div className="bg-blue-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Carbon Footprint Analysis</h4>
        <div className="grid grid-cols-2 gap-4">
          <div><span className="text-gray-600">Total Emissions:</span> <span className="font-medium">{agentData.total_carbon_emissions || '1,200 tons CO2e'}</span></div>
          <div><span className="text-gray-600">Intensity:</span> <span className="font-medium">{agentData.carbon_intensity || 'Medium'}</span></div>
          <div><span className="text-gray-600">Scope 3:</span> <span className="font-medium">{agentData.scope_3_emissions || '720 tons (Supply Chain)'}</span></div>
          <div><span className="text-gray-600">Reduction Potential:</span> <span className="font-medium text-green-600">{agentData.carbon_footprint_analysis?.reduction_potential || '25%'}</span></div>
        </div>
      </div>

      {/* ESG Risks */}
      {agentData.identified_risks && agentData.identified_risks.length > 0 && (
        <div className="bg-yellow-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2 text-yellow-600" />
            ESG Risk Factors
          </h4>
          <ul className="space-y-2">
            {agentData.identified_risks.slice(0, 3).map((risk, idx) => (
              <li key={idx} className="flex items-start">
                <span className={`w-2 h-2 rounded-full mt-2 mr-3 flex-shrink-0 ${risk.severity === 'High' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                <span className="text-gray-700">{risk.risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  // Render Master Orchestrator Details
  const renderOrchestratorDetails = () => (
    <div className="space-y-6">
      {/* LLM Insights */}
      {renderLLMInsights()}
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Agents Used" value={agentData.agents_engaged || 6} icon={Network} color="indigo" />
        <MetricCard label="Query Complexity" value={agentData.complexity || 'High'} icon={BarChart3} color="purple" />
        <MetricCard label="Response Time" value={`${agentData.response_time || 2.4}s`} icon={Clock} color="blue" />
        <MetricCard label="Confidence" value={`${agentData.confidence || 92}%`} icon={CheckCircle} color="green" />
      </div>
      <div className="bg-indigo-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Synthesized Response</h4>
        <p className="text-gray-700">{agentData.summary || `Comprehensive analysis of ${molecule} completed. The orchestrator has synthesized insights from IQVIA market data, EXIM trade intelligence, patent landscape, clinical trials, internal knowledge base, and web intelligence.`}</p>
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Key Recommendations</h4>
        <ul className="space-y-2">
          {(agentData.recommendations || [
            'Strong market potential identified in emerging markets',
            'Patent landscape favorable for generic entry post-2026',
            'Clinical trial data supports expanded indications'
          ]).map((rec, idx) => (
            <li key={idx} className="flex items-start">
              <CheckCircle className="w-4 h-4 text-indigo-500 mt-0.5 mr-3 flex-shrink-0" />
              <span className="text-gray-700">{rec}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  // Render IQVIA Insights Agent Details
  const renderIQVIADetails = () => {
    // Safely extract market size - handle both object and primitive values
    const getMarketSize = () => {
      if (!agentData.market_size) return '$4.2B';
      if (typeof agentData.market_size === 'object') {
        return `$${agentData.market_size.total_market_usd_bn || agentData.global_market_size_usd_bn || '4.2'}B`;
      }
      return agentData.market_size;
    };
    
    // Safely extract CAGR
    const getCAGR = () => {
      if (!agentData.cagr_analysis && !agentData.five_year_cagr) return '12.5%';
      if (typeof agentData.cagr_analysis === 'object') {
        return agentData.cagr_analysis.five_year_cagr || agentData.five_year_cagr || '12.5%';
      }
      return agentData.five_year_cagr || agentData.cagr || '12.5%';
    };
    
    // Safely extract competitors for display
    const getCompetitors = () => {
      if (agentData.competitive_landscape?.top_5) {
        return agentData.competitive_landscape.top_5.map(c => ({
          name: c.company,
          share: parseInt(c.market_share) || 20
        }));
      }
      if (agentData.top_5_competitors) {
        return agentData.top_5_competitors.map(c => ({
          name: c.company,
          share: parseInt(c.market_share) || 20
        }));
      }
      return [
        { name: 'Pfizer', share: 28 }, { name: 'Novartis', share: 22 },
        { name: 'Roche', share: 18 }, { name: 'AstraZeneca', share: 15 }, { name: 'Others', share: 17 }
      ];
    };
    
    // Get therapy area
    const therapyArea = agentData.therapy_area || agentData.therapy_class || 'Metabolic';
    
    // Get market forecast
    const getForecast = () => {
      if (agentData.market_forecast) {
        return Object.entries(agentData.market_forecast).slice(0, 4).map(([year, value]) => ({
          year,
          value: typeof value === 'number' ? `$${value.toFixed(1)}B` : value
        }));
      }
      return [
        { year: '2024', value: '$4.2B' },
        { year: '2025', value: '$4.8B' },
        { year: '2026', value: '$5.4B' },
        { year: '2027', value: '$6.1B' }
      ];
    };
    
    return (
      <div className="space-y-6">
        {/* LLM Insights - Show first if available */}
        {renderLLMInsights()}
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Market Size" value={getMarketSize()} icon={DollarSign} color="blue" />
          <MetricCard label="5Y CAGR" value={getCAGR()} icon={TrendingUp} color="green" />
          <MetricCard label="Competitors" value={agentData.competitive_landscape?.new_entrants_last_2y || 8} icon={Building2} color="purple" />
          <MetricCard label="Therapy Area" value={therapyArea} icon={Pill} color="orange" />
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Market Competition Analysis</h4>
          <div className="space-y-2">
            {getCompetitors().map((comp, idx) => (
              <div key={idx} className="flex items-center">
                <span className="w-32 text-sm text-gray-700 truncate">{comp.name}</span>
                <div className="flex-1 mx-3 h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style={{ width: `${comp.share}%` }} />
                </div>
                <span className="text-sm font-medium text-gray-900">{comp.share}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Market Forecast</h4>
          <div className="grid grid-cols-4 gap-4">
            {getForecast().map(({ year, value }) => (
              <div key={year} className="text-center">
                <div className="text-lg font-bold text-green-700">{value}</div>
                <div className="text-xs text-gray-600">{year}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Investment Metrics */}
        {agentData.investment_metrics && (
          <div className="bg-purple-50 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Investment Metrics</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-purple-700">{agentData.investment_metrics.market_attractiveness_score || 'N/A'}</div>
                <div className="text-xs text-gray-600">Attractiveness Score</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-purple-700">{agentData.investment_metrics.entry_barriers || 'N/A'}</div>
                <div className="text-xs text-gray-600">Entry Barriers</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-purple-700">{agentData.investment_metrics.profitability_index || 'N/A'}</div>
                <div className="text-xs text-gray-600">Profitability Index</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-purple-700">{agentData.investment_metrics.time_to_peak_sales_years || 'N/A'} yrs</div>
                <div className="text-xs text-gray-600">Time to Peak Sales</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render EXIM Trends Agent Details
  const renderEXIMDetails = () => {
    // Safely extract trade volume
    const getTradeVolume = () => {
      if (agentData.trade_value_usd_million) {
        return `$${agentData.trade_value_usd_million}M`;
      }
      return agentData.export_volume || '$850M';
    };
    
    // Get sourcing hubs for display
    const getSourcingData = () => {
      if (agentData.sourcing_hubs && Array.isArray(agentData.sourcing_hubs)) {
        return agentData.sourcing_hubs.slice(0, 4).map(hub => ({
          source: hub.country,
          percentage: hub.market_share || hub.share || 25
        }));
      }
      return [
        { source: 'India', percentage: 45 }, { source: 'China', percentage: 30 },
        { source: 'Europe', percentage: 15 }, { source: 'Others', percentage: 10 }
      ];
    };
    
    // Get trade flows for display
    const getTradeFlows = () => {
      if (agentData.global_trade_flows && Array.isArray(agentData.global_trade_flows)) {
        return agentData.global_trade_flows.slice(0, 4).map(flow => ({
          country: `${flow.origin} → ${flow.destination}`,
          value: `$${flow.value_usd_million}M`
        }));
      }
      return [
        { country: 'United States', value: '$320M' }, { country: 'Germany', value: '$180M' },
        { country: 'Japan', value: '$120M' }, { country: 'UK', value: '$95M' }
      ];
    };
    
    return (
      <div className="space-y-6">
        {/* LLM Insights */}
        {renderLLMInsights()}
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Trade Volume" value={getTradeVolume()} icon={Ship} color="cyan" />
          <MetricCard label="Volume (MT)" value={`${agentData.total_trade_volume_mt || 850} MT`} icon={Ship} color="blue" />
          <MetricCard label="Risk Level" value={agentData.overall_supply_risk || agentData.dependency_risk_level || 'Medium'} icon={TrendingUp} color="green" />
          <MetricCard label="FDA Sources" value={agentData.regulatory_status?.usfda_approved_sources || 8} icon={Globe} color="purple" />
        </div>
        <div className="bg-cyan-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Trade Flow Analysis</h4>
          <div className="space-y-2">
            {getTradeFlows().map((flow, idx) => (
              <div key={idx} className="flex justify-between items-center bg-white rounded-lg p-2 border border-cyan-200">
                <span className="text-gray-700">{flow.country}</span>
                <span className="font-semibold text-cyan-600">{flow.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">API Sourcing Hubs</h4>
          <div className="space-y-2">
            {getSourcingData().map((src, idx) => (
              <div key={idx} className="flex items-center">
                <span className="w-24 text-sm text-gray-700">{src.source}</span>
                <div className="flex-1 mx-3 h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 rounded-full" style={{ width: `${src.percentage}%` }} />
                </div>
                <span className="text-sm font-medium text-gray-900">{src.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
        {/* Supply Risk Assessment */}
        {agentData.supply_risks && (
          <div className="bg-yellow-50 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Supply Risk Assessment</h4>
            <div className="space-y-2">
              {(Array.isArray(agentData.supply_risks) ? agentData.supply_risks : []).slice(0, 4).map((risk, idx) => (
                <div key={idx} className="flex justify-between items-center bg-white rounded-lg p-2 border border-yellow-200">
                  <span className="text-gray-700">{risk.risk_factor || risk.factor || 'Risk Factor'}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    risk.severity === 'High' ? 'bg-red-100 text-red-700' :
                    risk.severity === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>{risk.severity || 'Medium'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Internal Knowledge Agent Details
  const renderInternalDetails = () => (
    <div className="space-y-6">
      {/* LLM Insights */}
      {renderLLMInsights()}
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Documents" value={agentData.documents_found || docs.length} icon={FileText} color="orange" />
        <MetricCard label="Relevance" value={`${relevanceVal}%`} icon={CheckCircle} color="green" />
        <MetricCard label="Key Insights" value={insightsCount} icon={Database} color="blue" />
        <MetricCard label="Last Updated" value={lastUpdate} icon={Clock} color="purple" />
      </div>

      <div className="bg-orange-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Internal Documents Analyzed</h4>
        <div className="space-y-2">
          {docs.map((doc, idx) => (
            <div key={idx} className="bg-white rounded-lg p-3 border border-orange-200">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">{doc.name}</p>
                  <span className="text-xs text-orange-600">{doc.type}</span>
                </div>
                <span className="text-sm font-semibold text-green-600">{doc.relevance}% match</span>
              </div>
              {doc.snippet && (
                <p className="text-xs text-gray-600 mt-1.5 italic">"{doc.snippet}"</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-yellow-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Key Extracted Insights</h4>
        <ul className="space-y-2">
          {insights.map((insight, idx) => (
            <li key={idx} className="flex items-start">
              <Database className="w-4 h-4 text-orange-500 mt-0.5 mr-3 flex-shrink-0" />
              <span className="text-gray-700">{insight}</span>
            </li>
          ))}
        </ul>
      </div>

      {agentData.historical_analysis && agentData.historical_analysis.length > 0 && (
        <div className="bg-purple-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Historical Assessments</h4>
          <div className="space-y-3">
            {agentData.historical_analysis.map((hist, idx) => (
              <div key={idx} className="bg-white rounded-lg p-3 border border-purple-200">
                <div className="flex justify-between text-xs text-purple-600 mb-1">
                  <span>{hist.type} ({hist.analysis_id})</span>
                  <span>{hist.date}</span>
                </div>
                <p className="font-semibold text-gray-900 text-sm">{hist.conclusion}</p>
                {hist.key_findings && (
                  <ul className="list-disc list-inside text-xs text-gray-600 mt-1 space-y-0.5">
                    {hist.key_findings.map((finding, fIdx) => (
                      <li key={fIdx}>{finding}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {agentData.knowledge_gaps && agentData.knowledge_gaps.length > 0 && (
        <div className="bg-red-50 rounded-xl p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Identified Knowledge Gaps</h4>
          <div className="space-y-2">
            {agentData.knowledge_gaps.map((gap, idx) => (
              <div key={idx} className="bg-white rounded-lg p-3 border border-red-200 flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-red-600">{gap.knowledge_area}</span>
                  <p className="font-medium text-gray-900 text-sm mt-0.5">{gap.gap_description}</p>
                  <p className="text-xs text-gray-500 mt-1">Action: {gap.recommended_action} ({gap.estimated_effort})</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  gap.priority === 'High' ? 'bg-red-100 text-red-700' :
                  gap.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {gap.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Render Web Intelligence Agent Details
  const renderWebIntelDetails = () => (
    <div className="space-y-6">
      {/* LLM Insights */}
      {renderLLMInsights()}
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="News Articles" value={agentData.news_count || 24} icon={Globe} color="pink" />
        <MetricCard label="Publications" value={agentData.publications || 156} icon={BookOpen} color="blue" />
        <MetricCard label="Guidelines" value={agentData.guidelines || 8} icon={FileText} color="green" />
        <MetricCard label="Sentiment" value={agentData.sentiment || 'Positive'} icon={TrendingUp} color="purple" />
      </div>
      <div className="bg-pink-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Recent News & Updates</h4>
        <div className="space-y-2">
          {(agentData.news || [
            { title: `FDA approves expanded indication for ${molecule}`, source: 'Reuters', date: '2 days ago' },
            { title: `${molecule} shows promise in Phase 3 trial`, source: 'BioPharma Dive', date: '1 week ago' },
            { title: 'New pricing guidelines impact market access', source: 'FiercePharma', date: '2 weeks ago' }
          ]).map((news, idx) => (
            <div key={idx} className="bg-white rounded-lg p-3 border border-pink-200">
              <p className="font-medium text-gray-900">{news.title}</p>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{news.source}</span>
                <span>{news.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-blue-50 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Scientific Publications</h4>
        <div className="space-y-2">
          {(agentData.papers || [
            { title: `Efficacy of ${molecule} in treatment-resistant cases`, journal: 'NEJM', citations: 45 },
            { title: 'Long-term safety profile analysis', journal: 'Lancet', citations: 32 }
          ]).map((paper, idx) => (
            <div key={idx} className="flex justify-between items-center bg-white rounded-lg p-3 border border-blue-200">
              <div>
                <p className="font-medium text-gray-900 text-sm">{paper.title}</p>
                <span className="text-xs text-blue-600">{paper.journal}</span>
              </div>
              <span className="text-sm text-gray-500">{paper.citations} citations</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ===== SUMMARIZED BULLET POINTS FOR EACH AGENT =====
  const getSummarizedPoints = () => {
    const summaryByAgent = {
      'Master Orchestrator': [
        `Analysis completed for drug: ${molecule}`,
        `Total agents coordinated: 10 AI agents`,
        `Processing time: ${agentData.processing_time || '12.5 seconds'}`,
        `Confidence score: ${agentData.confidence || 92}%`,
        `Key recommendation: ${agentData.recommendation || 'Proceed with further clinical investigation'}`,
        `Risk level: ${agentData.risk_level || 'Medium'} - manageable with proper strategy`,
        `ROI potential: ${agentData.roi_potential || 'High'} - estimated $${agentData.estimated_value || '450M'} market opportunity`
      ],
      'IQVIA Insights Agent': [
        `Market size: $${agentData.market_size || '2.8B'} globally (${agentData.year || '2024'})`,
        `CAGR: ${agentData.cagr || '6.2'}% projected growth through ${agentData.projection_year || '2030'}`,
        `Market share opportunity: ${agentData.market_share || '12-18'}% achievable`,
        `Key competitors: ${(agentData.competitors || ['Pfizer', 'Novartis', 'Roche']).slice(0, 3).join(', ')}`,
        `Pricing benchmark: $${agentData.price_per_unit || '45-65'} per treatment course`,
        `Regional hotspots: ${(agentData.regions || ['North America', 'Europe', 'Asia-Pacific']).join(', ')}`,
        `Unmet need score: ${agentData.unmet_need || '8.2'}/10 - strong market demand`
      ],
      'EXIM Trends Agent': [
        `Global trade volume: $${agentData.trade_volume || '1.2B'} annually`,
        `Top exporting countries: ${(agentData.exporters || ['India', 'China', 'Germany']).join(', ')}`,
        `Import dependency: ${agentData.import_dependency || '35'}% for key raw materials`,
        `Supply chain risk: ${agentData.supply_risk || 'Moderate'} - diversified sourcing recommended`,
        `API availability: ${agentData.api_availability || 'High'} from ${agentData.api_suppliers || '12'} verified suppliers`,
        `Cost optimization: ${agentData.cost_savings || '18-25'}% potential through strategic sourcing`,
        `Trade compliance: ${agentData.compliance_status || 'Cleared'} for major markets`
      ],
      'Patent Landscape Agent': [
        `Active patents: ${agentData.active_patents || '23'} patents identified`,
        `Freedom-to-Operate: ${agentData.freedom_to_operate || 'Clear'} path available`,
        `Earliest patent expiry: ${agentData.earliest_expiration || '2027'} - window opening`,
        `Key patent holders: ${(agentData.patent_holders || ['Original Innovator', 'Generic Cos']).join(', ')}`,
        `Patent challenges: ${agentData.challenges || '3'} ongoing litigations monitored`,
        `Filing opportunity: ${agentData.filing_opportunity || 'Strong'} for new formulations`,
        `IP strategy: ${agentData.ip_recommendation || 'Defensive filing recommended for process patents'}`
      ],
      'Clinical Trials Agent': [
        `Total trials found: ${agentData.total_trials_found || '47'} relevant trials`,
        `Phase distribution: Phase 1 (${agentData.phase1 || '12'}), Phase 2 (${agentData.phase2 || '23'}), Phase 3 (${agentData.phase3 || '12'})`,
        `Safety score: ${agentData.safety_score || '8.5'}/10 - favorable profile`,
        `Efficacy rating: ${agentData.efficacy_rating || 'High'} based on published data`,
        `Potential indications: ${(agentData.indications || ['Onco', 'Immunology', 'Rare Diseases']).join(', ')}`,
        `Key endpoints met: ${agentData.endpoints_met || '85'}% success rate in trials`,
        `Regulatory pathway: ${agentData.pathway || '505(b)(2)'} recommended for faster approval`
      ],
      'Internal Knowledge Agent': [
        `Documents analyzed: ${agentData.documents_found || docs.length} internal files processed`,
        `Relevance score: ${relevanceVal}% match to query`,
        `Strategic fit: ${agentData.strategic_fit || 'High'} alignment with portfolio`,
        `Prior research: ${agentData.historical_analysis?.length || 0} internal studies available`,
        `Resource estimate: ${agentData.resource_estimate || '$15-20M'} for development`,
        `Timeline projection: ${agentData.timeline || '24-36 months'} to market`,
        `Team recommendation: ${agentData.team_recommendation || 'Proceed to detailed feasibility'}`
      ],
      'Web Intelligence Agent': [
        `News sentiment: ${agentData.sentiment || 'Positive'} - ${agentData.positive_mentions || '78'}% favorable coverage`,
        `Publications found: ${agentData.publications || '156'} scientific papers analyzed`,
        `KOL interest: ${agentData.kol_interest || 'High'} from ${agentData.kol_count || '23'} key opinion leaders`,
        `Media coverage: ${agentData.news_count || '24'} recent news articles`,
        `Social buzz: ${agentData.social_score || '7.8'}/10 patient community interest`,
        `Guideline updates: ${agentData.guidelines || '8'} treatment guidelines reference this molecule`,
        `Emerging signals: ${agentData.emerging_signal || 'Strong interest in combination therapies'}`
      ],
      'Regulatory Compliance': [
        `Compliance score: ${agentData.compliance_score || '85'}/100 - ${agentData.compliance_grade || 'B'} grade`,
        `FDA status: ${agentData.fda_status || 'Eligible'} for expedited review`,
        `Black-box warnings: ${agentData.warning_count || '1'} warning(s) to address`,
        `Recommended pathway: ${agentData.recommended_pathway || '505(b)(2)'} NDA`,
        `EMA compatibility: ${agentData.ema_status || 'Aligned'} with European guidelines`,
        `Safety monitoring: ${agentData.safety_monitoring || 'Standard'} REMS requirements`,
        `Approval timeline: ${agentData.approval_timeline || '18-24 months'} estimated`
      ],
      'Patient Sentiment': [
        `Patient satisfaction: ${agentData.satisfaction_score || '7.2'}/10 from forum analysis`,
        `Unmet needs identified: ${agentData.unmet_needs_count || '5'} critical gaps`,
        `Treatment complaints: ${agentData.complaints || 'Side effects, dosing frequency, cost'}`,
        `Quality of life impact: ${agentData.qol_score || 'Moderate'} improvement reported`,
        `Patient preference: ${agentData.preference || '68'}% prefer ${molecule} over alternatives`,
        `Adherence challenge: ${agentData.adherence || 'Dosing schedule'} main barrier`,
        `Opportunity: ${agentData.opportunity || 'Extended-release formulation could address key complaints'}`
      ],
      'ESG & Sustainability': [
        `ESG score: ${agentData.esg_score || '72'}/100 overall rating`,
        `Carbon footprint: ${agentData.carbon_footprint || 'Medium'} - ${agentData.carbon_reduction || '15'}% reduction possible`,
        `Green sourcing: ${agentData.green_suppliers || '4'} certified sustainable suppliers`,
        `Ethical labor: ${agentData.labor_score || '85'}% compliance across supply chain`,
        `Waste management: ${agentData.waste_score || 'B+'} rating for manufacturing`,
        `Water usage: ${agentData.water_efficiency || '12'}% below industry average`,
        `Sustainability roadmap: ${agentData.roadmap || 'Aligned with 2030 pharma sustainability goals'}`
      ]
    };

    return summaryByAgent[agent.name] || [
      `Analysis completed for ${molecule}`,
      'Data processing successful',
      'Results ready for review',
      'See detailed metrics below'
    ];
  };

  // ===== RENDER AS MODAL POPUP =====
  return (
    <>
      {/* Modal Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        {/* Container now uses flex-col so header & footer stay visible while content scrolls */}
        <div 
          className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] pointer-events-auto animate-slideUp overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`${agent.name} details`}
        >
          {/* Modal Header */}
          <div className={`bg-gradient-to-r ${config.gradient} px-6 py-5 flex items-center justify-between`}>
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <AgentIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white flex items-center">
                  {agent.name}
                  {!isRealData && (
                    <span className="ml-3 px-2 py-1 bg-yellow-500/20 border border-yellow-300/30 rounded-md text-xs font-normal text-yellow-100">
                      Sample Data
                    </span>
                  )}
                  {isRealData && agentData.llm_provider && (
                    <span className="ml-3 px-2 py-1 bg-green-500/20 border border-green-300/30 rounded-md text-xs font-normal text-green-100 flex items-center">
                      <Sparkles className="w-3 h-3 mr-1" />
                      AI Enhanced
                    </span>
                  )}
                </h3>
                <p className="text-white/80 text-sm mt-1">{config.description}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
              aria-label="Close details"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Scrollable Content - flex-1 so it fills space between header & footer */}
          <div className="overflow-y-auto flex-1">
            {/* Summary Section - Bullet Points */}
            <div className="px-6 py-5 bg-gradient-to-b from-gray-50 to-white border-b border-gray-100">
              <div className="flex items-center space-x-2 mb-4">
                <div className={`w-2 h-2 rounded-full bg-${config.color}-500`} />
                <h4 className="text-lg font-semibold text-gray-900">
                  📊 Analysis Summary for {molecule}
                </h4>
              </div>
              
              <div className="grid md:grid-cols-2 gap-3">
                {getSummarizedPoints().map((point, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-start space-x-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all"
                  >
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center text-white text-xs font-bold`}>
                      {idx + 1}
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{point}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Content */}
            <div className="p-6">
              <div className="flex items-center space-x-2 mb-4">
                <Eye className="w-5 h-5 text-gray-500" />
                <h4 className="text-lg font-semibold text-gray-900">Detailed Analysis</h4>
              </div>
              {renderContent()}
              
              {/* Debug Panel - Only show in development or when explicitly needed */}
              {(!isRealData || IS_DEV) && (
                <div className="mt-6 border-t-2 border-dashed border-gray-300 pt-4">
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      {isRealData ? 'Debug Information' : '⚠️ Using Sample Data (Real API data not available)'}
                    </summary>
                    <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                      <h5 className="font-semibold text-gray-900 mb-2">Data Source: {isRealData ? '✅ Live API' : '❌ Mock Generator'}</h5>
                      <div className="space-y-1 text-gray-700 font-mono">
                        <div>Agent: {agent.name}</div>
                        <div>Molecule: {molecule}</div>
                        <div>LLM Provider: {agentData.llm_provider || 'N/A'}</div>
                        <div>Model Used: {agentData.model_used || 'N/A'}</div>
                        <div>Processing Time: {agentData.processing_time_ms ? `${agentData.processing_time_ms}ms` : 'N/A'}</div>
                      </div>
                      {!isRealData && (
                        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                          <strong>Note:</strong> This agent did not return data from the API. Check console logs for errors.
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer - fixed at bottom of modal container */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between" style={{boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.02), 0 -8px 20px rgba(2,6,23,0.04)'}}>
            <div className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">{agent.name}</span> • Analysis for {molecule}
            </div>
            <div className="flex items-center space-x-3">
              <button 
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors rounded-md"
              >
                Close
              </button>
              <button 
                className={`px-4 py-2 bg-gradient-to-r ${config.gradient} text-white rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center space-x-2 focus:outline-none focus:ring-4 focus:ring-${config.color}-200`}
                title="Export detailed report"
                aria-label="Export Report"
                onClick={() => {
                  /* If your original logic triggers export via parent, keep it there.
                     This click handler is intentionally non-invasive — if you already
                     have export logic wired elsewhere, replace this with your handler. */
                }}
              >
                <FileText className="w-4 h-4" />
                <span>Export Report</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// Metric Card Component
const MetricCard = ({ label, value, icon: Icon, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    pink: 'bg-pink-50 text-pink-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    teal: 'bg-teal-50 text-teal-600',
    cyan: 'bg-cyan-50 text-cyan-600'
  };

  return (
    <div className={`${colorClasses[color]} rounded-xl p-4 text-center`}>
      <Icon className="w-6 h-6 mx-auto mb-2" />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
};

export default AgentDetailPanel;
