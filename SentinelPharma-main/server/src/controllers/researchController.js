/**
 * SentinelPharma Research Controller
 * ================================
 * Orchestrates multi-agent research requests.
 * Acts as the central coordinator between the frontend and AI Engine.
 * 
 * Responsibilities:
 * - Validate incoming research requests
 * - Route to appropriate processing mode (secure/cloud)
 * - Communicate with Python AI Engine
 * - Aggregate and return results
 * - Maintain audit trails
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { logger, auditLog } = require('../utils/logger');
const aiEngineService = require('../services/aiEngineService');
const { ResearchReport } = require('../models');
const {
  EVIDENCE_CONTRACT_VERSION,
  filterTraceableCitations,
  normalizeProvenanceEnvelope,
  summarizeDataModes,
  unavailablePayload
} = require('../utils/evidencePolicy');
const { buildCandidateEvidenceSummary } = require('../utils/candidateEvidence');

// Lightweight in-memory request store for live status/report preview lookup.
const requestStore = new Map();
const AI_ENGINE_ROOT = path.resolve(__dirname, '../../..', 'ai_engine');
const GNN_ARTIFACT_PATH = path.join(AI_ENGINE_ROOT, 'artifacts', 'gnn', 'drugbank_gnn_model.pt');
const GNN_TRIPLES_PATH = path.join(AI_ENGINE_ROOT, 'artifacts', 'gnn', 'training_triples.json');
const GNN_EVALUATION_PATH = path.join(AI_ENGINE_ROOT, 'artifacts', 'gnn', 'evaluation_metrics.json');
const GNN_SEED_PATH = path.join(AI_ENGINE_ROOT, 'data', 'drugbank_seed_kg.csv');

const normalizeSummaryForArchive = (summary = {}, molecule) => ({
  overallAssessment: summary.overallAssessment || summary.overall_assessment || `Analysis completed for ${molecule}`,
  keyFindings: summary.keyFindings || summary.key_findings || [],
  risks: summary.risks || [],
  opportunities: summary.opportunities || [],
  recommendations: summary.recommendations || summary.recommended_actions || []
});

const normalizeAgentsForArchive = (agents = []) => (
  Array.isArray(agents)
    ? agents.map((agent) => ({
        name: agent.name,
        status: agent.status,
        durationMs: agent.durationMs ?? agent.duration_ms ?? 0
      }))
    : []
);

const computeQualityScore = (analysisResults = {}, expectedAgentCount = 9, durationMs = 0) => {
  const executed = Array.isArray(analysisResults?.agents_executed) ? analysisResults.agents_executed : [];
  const completed = executed.filter((agent) => agent?.status === 'completed').length;

  const completionScore = expectedAgentCount > 0
    ? Math.min(10, (completed / expectedAgentCount) * 10)
    : 7.5;

  const confidenceLevel = analysisResults?.validation?.overall_confidence || 'MEDIUM';
  const confidenceMap = { HIGH: 9.6, MEDIUM: 8.4, LOW: 6.8 };
  const confidenceScore = confidenceMap[confidenceLevel] || 8.0;

  const riskSeverity = analysisResults?.validation?.risk_severity || 'MEDIUM';
  const riskPenaltyMap = { LOW: 0.3, MEDIUM: 0.8, HIGH: 1.4 };
  const riskPenalty = riskPenaltyMap[riskSeverity] ?? 0.8;

  const latencyPenalty = durationMs > 180000 ? 0.5 : durationMs > 120000 ? 0.2 : 0;

  const weighted = (completionScore * 0.5) + (confidenceScore * 0.35) + (10 * 0.15);
  const score = Math.max(5, Math.min(9.9, weighted - riskPenalty - latencyPenalty));

  let grade = 'Good';
  if (score >= 9.2) grade = 'Enterprise-Ready';
  else if (score >= 8.6) grade = 'Strong';
  else if (score >= 7.8) grade = 'Good';
  else grade = 'Needs-Review';

  return {
    score: Number(score.toFixed(1)),
    grade,
    completedAgents: completed,
    expectedAgents: expectedAgentCount,
    confidenceLevel,
    riskSeverity
  };
};

const buildValidationLayer = (analysisResults = {}, molecule) => {
  const executed = Array.isArray(analysisResults?.agents_executed) ? analysisResults.agents_executed.length : 0;
  const clinicalConfidence = analysisResults?.clinical?.safety_score ? Math.min(96, Math.round(Number(analysisResults.clinical.safety_score) * 10)) : 82;
  const marketConfidence = analysisResults?.iqvia ? 84 : 72;
  const patentConfidence = analysisResults?.patent ? 80 : 70;
  const confidenceScore = Math.round((clinicalConfidence + marketConfidence + patentConfidence) / 3);
  const overallConfidence = confidenceScore >= 88 ? 'HIGH' : confidenceScore >= 76 ? 'MEDIUM' : 'LOW';
  const riskSeverity = confidenceScore >= 88 ? 'LOW' : confidenceScore >= 76 ? 'MEDIUM' : 'HIGH';

  return {
    confidence_score: confidenceScore,
    overall_confidence: overallConfidence,
    risk_severity: riskSeverity,
    evidence_quality: executed >= 9 ? 'STRONG' : 'PARTIAL',
    validated_claims: Math.max(6, executed + 1),
    simulated_claims: executed >= 9 ? 2 : 4,
    data_quality_score: Number((Math.min(0.95, 0.62 + executed * 0.03)).toFixed(2)),
    uncertainty_summary: [
      `${molecule} has encouraging multi-agent support, but indication-specific efficacy remains inferential.`,
      'Clinical confidence is stronger than real-world market adoption certainty.',
      'Manufacturing and regulatory assumptions still require external verification.'
    ],
    contraindications: [
      'Avoid treating the result as a substitute for indication-specific clinical evidence.',
      'Use caution where class effects suggest hepatic, cardiovascular, or GI tolerability risk.',
      'Do not assume payer acceptance without target-indication health economics review.'
    ],
    risk_flags: [
      'Prospective validation still required before portfolio prioritization.',
      'Some evidence chains are mechanism-backed rather than outcome-backed.',
      'Contraindication profile may shift by population and comorbidity mix.'
    ],
    validation_recommendations: [
      'Run retrospective validation on historical label-expansion successes.',
      'Score literature support at the indication level before advancement.',
      'Add safety-screening and contraindication review for target cohorts.'
    ],
    recommendation_status: executed >= 9 ? 'PARTIALLY_VALIDATED' : 'SIMULATED_WITH_EVIDENCE'
  };
};

const buildCitations = (analysisResults = {}) => filterTraceableCitations(analysisResults.citations);

const buildRecommendationDossier = (molecule, analysisResults = {}, validation = {}, citations = []) => {
  const pathways = analysisResults?.knowledge_graph?.key_pathways || ['PI3K/AKT', 'MAPK/ERK', 'JAK/STAT'];
  const topPathway = pathways[0];
  const secondaryPathway = pathways[1] || pathways[0];
  const evidenceBase = [
    molecule,
    analysisResults?.clinical ? 'clinical trial signal' : 'clinical literature signal',
    topPathway,
    'target indication hypothesis'
  ];

  return [
    {
      id: 'rec-1',
      evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
      dataMode: 'DEMO_SYNTHETIC',
      verificationStatus: 'DEMO_ONLY',
      title: `Advance ${molecule} to indication-specific retrospective validation`,
      validationLabel: 'Partially validated',
      outputType: 'Validated core recommendation',
      confidence: validation.confidence_score || 84,
      uncertainty: 'Strong mechanistic support, but limited disease-specific outcomes.',
      contraindication: 'Do not prioritize for launch planning without indication-specific efficacy review.',
      evidencePath: evidenceBase,
      evidenceStrength: 'High mechanistic, medium clinical',
      supportingSources: citations.slice(0, 2)
    },
    {
      id: 'rec-2',
      evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
      dataMode: 'DEMO_SYNTHETIC',
      verificationStatus: 'DEMO_ONLY',
      title: `Investigate biomarker-enriched cohorts linked to ${secondaryPathway}`,
      validationLabel: 'Evidence-backed simulation',
      outputType: 'Simulated expansion hypothesis',
      confidence: Math.max(68, (validation.confidence_score || 84) - 8),
      uncertainty: 'Biomarker enrichment improves plausibility but remains unvalidated prospectively.',
      contraindication: 'Avoid broad population claims until subgroup response is confirmed.',
      evidencePath: [molecule, secondaryPathway, 'responsive subpopulation', 'expanded indication'],
      evidenceStrength: 'Medium',
      supportingSources: citations.slice(1, 3)
    },
    {
      id: 'rec-3',
      evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
      dataMode: 'DEMO_SYNTHETIC',
      verificationStatus: 'DEMO_ONLY',
      title: `Pair ${molecule} with regulatory and HEOR evidence generation before portfolio escalation`,
      validationLabel: 'Operational recommendation',
      outputType: 'Validated workflow guidance',
      confidence: Math.max(72, (validation.confidence_score || 84) - 4),
      uncertainty: 'Commercial and payer readiness depend on indication-specific outcomes and pricing.',
      contraindication: 'Do not assume reimbursement attractiveness from mechanism alone.',
      evidencePath: [molecule, 'clinical safety profile', 'regulatory pathway', 'market access dossier'],
      evidenceStrength: 'Medium-high',
      supportingSources: citations.slice(0, 1)
    }
  ];
};

const loadLocalGnnBenchmarkContext = () => {
  const context = {
    artifactExists: fs.existsSync(GNN_ARTIFACT_PATH),
    triplesExists: fs.existsSync(GNN_TRIPLES_PATH),
    evaluationExists: fs.existsSync(GNN_EVALUATION_PATH),
    seedExists: fs.existsSync(GNN_SEED_PATH),
    artifactVersion: null,
    trainingTriples: [],
    evaluation: null,
    seedRowCount: null,
    error: null
  };

  try {
    if (context.artifactExists) {
      const stat = fs.statSync(GNN_ARTIFACT_PATH);
      context.artifactVersion = `v${Math.floor(stat.mtimeMs)}`;
    }

    if (context.triplesExists) {
      context.trainingTriples = JSON.parse(fs.readFileSync(GNN_TRIPLES_PATH, 'utf8'));
    }

    if (context.evaluationExists) {
      context.evaluation = JSON.parse(fs.readFileSync(GNN_EVALUATION_PATH, 'utf8'));
    }

    if (context.seedExists) {
      const rows = fs.readFileSync(GNN_SEED_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
      context.seedRowCount = Math.max(0, rows.length - 1);
    }
  } catch (error) {
    context.error = error.message;
  }

  return context;
};

const buildBenchmarking = (molecule, analysisResults = {}, validation = {}) => {
  const gnn = loadLocalGnnBenchmarkContext();
  const triples = Array.isArray(gnn.trainingTriples) ? gnn.trainingTriples : [];
  const uniqueDrugs = new Set();
  const uniqueDiseases = new Set();
  const uniqueTargets = new Set();
  const relations = new Set();
  let treatEdges = 0;

  triples.forEach((triple) => {
    if (triple.source_type === 'drug') uniqueDrugs.add(triple.source);
    if (triple.target_type === 'disease') uniqueDiseases.add(triple.target);
    if (['target', 'protein'].includes(triple.target_type)) uniqueTargets.add(triple.target);
    if (triple.relation) relations.add(triple.relation);
    if (triple.relation === 'treats' && triple.source_type === 'drug' && triple.target_type === 'disease') {
      treatEdges += 1;
    }
  });

  const evidenceCompleteness = (analysisResults?.recommendation_dossier || []).length > 0 ? 1 : 0;
  const explainabilityScore = Number(
    Math.min(
      1,
      0.55 +
      (analysisResults?.recommendation_dossier?.length || 0) * 0.08 +
      (analysisResults?.citations?.length || 0) * 0.02
    ).toFixed(2)
  );

  return {
    productPositioning: 'Artifact-backed repurposing benchmark',
    benchmarkVersion: gnn.artifactVersion || 'artifact-missing',
    provenance: {
      source: gnn.artifactExists ? 'local-gnn-artifact' : 'fallback-product-layer',
      artifactPath: GNN_ARTIFACT_PATH,
      trainingTriplesPath: GNN_TRIPLES_PATH,
      seedDatasetPath: GNN_SEED_PATH,
      artifactReady: gnn.artifactExists,
      trainingTriplesLoaded: triples.length,
      evaluationLoaded: Boolean(gnn.evaluation),
      seedRowsLoaded: gnn.seedRowCount,
      loadError: gnn.error
    },
    benchmarkSummary: {
      rankingQuality: gnn.artifactExists ? 'Backed by local GraphSAGE artifact' : 'No local artifact detected',
      explainabilityCoverage: evidenceCompleteness ? 'Full evidence path attached to each recommendation' : 'Partial',
      validationReadiness: validation.recommendation_status || 'PARTIALLY_VALIDATED',
      simulationDisclosure: gnn.artifactExists ? 'Benchmark provenance is artifact-backed; recommendations still require validation' : 'Fallback benchmark mode'
    },
    datasets: [
      {
        name: 'Held-out drug-disease ranking',
        split: gnn.evaluation ? `holdout ratio ${gnn.evaluation.holdout_ratio}` : 'not yet evaluated',
        metric: 'MRR',
        score: gnn.evaluation?.metrics?.mrr ?? 0,
        baseline: 0,
        status: gnn.evaluation ? 'offline evaluation artifact' : 'evaluation missing'
      },
      {
        name: 'Held-out recommendation hit rate',
        split: gnn.evaluation ? `holdout edges ${gnn.evaluation.holdout_edges}` : 'not yet evaluated',
        metric: 'Hits@5',
        score: gnn.evaluation?.metrics?.hits_at_5 ?? 0,
        baseline: 0,
        status: gnn.evaluation ? 'offline evaluation artifact' : 'evaluation missing'
      },
      {
        name: 'DrugBank-style KG artifact coverage',
        split: 'persisted training triples',
        metric: 'Triples',
        score: triples.length,
        baseline: gnn.seedRowCount ?? 0,
        status: gnn.artifactExists ? 'live local artifact' : 'artifact missing'
      },
      {
        name: 'Drug-disease supervision coverage',
        split: 'treat edges in local KG',
        metric: 'Treat edges',
        score: treatEdges,
        baseline: Math.max(1, Math.round((gnn.seedRowCount || treatEdges || 1) * 0.15)),
        status: treatEdges > 0 ? 'live local graph statistic' : 'not available'
      },
      {
        name: 'Mechanism-grounded explainability coverage',
        split: 'recommendation audit',
        metric: 'Coverage',
        score: explainabilityScore,
        baseline: 0.5,
        status: 'derived from live response payload'
      },
      {
        name: 'Graph entity coverage',
        split: 'training graph snapshot',
        metric: 'Entities',
        score: uniqueDrugs.size + uniqueDiseases.size + uniqueTargets.size,
        baseline: uniqueDiseases.size,
        status: triples.length ? 'live local graph statistic' : 'not available'
      }
    ],
    graphStats: {
      uniqueDrugs: uniqueDrugs.size,
      uniqueDiseases: uniqueDiseases.size,
      uniqueTargets: uniqueTargets.size,
      relationTypes: relations.size
    },
    evaluationSummary: gnn.evaluation ? {
      holdoutEdges: gnn.evaluation.holdout_edges,
      trainEdges: gnn.evaluation.train_edges,
      epochs: gnn.evaluation.epochs,
      lossHistoryTail: gnn.evaluation.loss_history_tail,
      metrics: gnn.evaluation.metrics
    } : null,
    topEvaluatedCases: Array.isArray(gnn.evaluation?.evaluated_cases)
      ? gnn.evaluation.evaluated_cases.slice(0, 3)
      : [],
    benchmarkNotes: [
      `${molecule} benchmark provenance now uses local GNN artifacts and training triples when available.`,
      gnn.evaluation
        ? 'Held-out metrics are computed from a local train/holdout split of drug-disease treat edges.'
        : 'Held-out ranking metrics are unavailable until the GNN evaluation pipeline is run.',
      'These metrics describe offline ranking quality and explainability completeness, not prospective clinical success.',
      'External benchmark suites and temporal validation still need to be added for publication-grade claims.'
    ]
  };
};

const buildRetrospectiveCaseStudies = (molecule) => ([
  {
    title: 'Would this system have surfaced thalidomide for multiple myeloma?',
    surfacedBefore: 'broad label expansion',
    comparisonPublication: 'Historical oncology literature',
    rationale: `The product would likely have ranked ${molecule}-style mechanism links using pathway overlap, safety precedent, and market unmet need.`,
    evidencePath: ['legacy compound', 'immune modulation', 'hematologic pathway', 'multiple myeloma'],
    takeaway: 'Demonstrates how evidence chains can be reviewed before consensus publication.'
  },
  {
    title: 'Would this system have highlighted sildenafil before pulmonary hypertension expansion?',
    surfacedBefore: 'pulmonary vascular repositioning publications',
    comparisonPublication: 'Historical cardiovascular literature',
    rationale: 'Mechanism-to-disease pathing is exactly the kind of retrospective pattern this product is designed to expose.',
    evidencePath: ['PDE pathway', 'vascular signaling', 'pulmonary pressure control', 'new indication'],
    takeaway: 'Useful as a benchmark narrative for pre-publication signal discovery.'
  },
  {
    title: `Would ${molecule} have been promoted earlier for its strongest non-core evidence cluster?`,
    surfacedBefore: 'portfolio committee review',
    comparisonPublication: 'Internal benchmark scenario',
    rationale: 'This case study is synthetic but demonstrates the report format needed for retrospective benchmarking.',
    evidencePath: [molecule, 'target class', 'pathway perturbation', 'historical indication shift'],
    takeaway: 'Makes simulated outputs clearly auditable rather than presenting them as validated facts.'
  }
]);

const buildSimulationDisclosure = (validation = {}) => ({
  validatedOutputs: [
    'Agent execution coverage',
    'Evidence path formatting',
    'Confidence and contraindication reasoning layer'
  ],
  simulatedOutputs: [
    'Benchmark scores are internal benchmark placeholders until external datasets are wired in',
    'Retrospective case studies are product-format examples, not peer-reviewed validations',
    'Some recommendation narratives are generated from evidence templates rather than live literature ranking'
  ],
  label: validation.recommendation_status || 'SIMULATED_WITH_EVIDENCE'
});

/**
 * Process a drug repurposing research request
 * 
 * @route POST /api/research
 * @param {Object} req.body.molecule - Drug/molecule name to analyze
 * @param {string} req.body.mode - Processing mode: 'secure' (local) or 'cloud' (Gemini)
 * @returns {Object} Research results including ROI calculations
 */
const processResearch = async (req, res) => {
  const requestId = uuidv4();
  const startTime = Date.now();

  try {
    const { molecule, disease = null, researchMode = 'live', mode = 'cloud', provider = null } = req.body;

    // Validate required fields
    if (!molecule || typeof molecule !== 'string') {
      logger.warn('Invalid research request - missing molecule', { requestId });
      return res.status(400).json({
        success: false,
        error: 'Molecule name is required',
        requestId
      });
    }

    // Validate mode
    const validModes = ['secure', 'cloud'];
    if (!validModes.includes(mode)) {
      logger.warn('Invalid processing mode specified', { requestId, mode });
      return res.status(400).json({
        success: false,
        error: `Invalid mode. Must be one of: ${validModes.join(', ')}`,
        requestId
      });
    }
    if (researchMode === 'live' && mode === 'secure') {
      return res.status(422).json(unavailablePayload(
        'LIVE_RETRIEVAL_REQUIRES_CLOUD_MODE',
        'Live PubMed and ClinicalTrials.gov retrieval requires cloud mode.',
        { requestId }
      ));
    }

    // Log research initiation
    auditLog.researchStarted(molecule, mode, requestId);

    // Log processing mode and provider for compliance
    auditLog.processingMode(mode, requestId);
    if (provider) {
      logger.info('AI provider specified', { provider, requestId });
    }

    logger.info('Using canonical AI analysis endpoint', { requestId, mode, endpoint: '/api/analyze' });

    // Call Python AI Engine for analysis
    auditLog.agentActivity('Orchestrator', 'DISPATCHING_AGENTS', { 
      molecule, 
      mode,
      provider,
      requestId 
    });

    // Execute multi-agent analysis
    const analysisResults = await aiEngineService.analyzeCompound({
      molecule,
      disease,
      researchMode,
      mode,
      requestId,
      agents: researchMode === 'demo'
        ? ['clinical', 'patent', 'iqvia', 'vision', 'exim', 'web_intelligence', 'internal_knowledge', 'regulatory', 'patient_sentiment', 'esg']
        : undefined,
      provider
    });

    const citations = buildCitations(analysisResults);
    const enrichedResults = researchMode === 'demo' ? (() => {
      const validation = analysisResults?.validation || buildValidationLayer(analysisResults, molecule);
      return {
        ...analysisResults,
        validation,
        citations,
        dataModes: summarizeDataModes(citations),
        recommendation_dossier: buildRecommendationDossier(molecule, analysisResults, validation, citations),
        benchmarking: buildBenchmarking(molecule, analysisResults, validation),
        retrospective_case_studies: buildRetrospectiveCaseStudies(molecule),
        simulation_disclosure: buildSimulationDisclosure(validation)
      };
    })() : {
      ...analysisResults,
      citations,
      dataModes: summarizeDataModes(citations)
    };

    // Calculate request duration
    const duration = Date.now() - startTime;

    // Log successful response
    auditLog.apiResponse(requestId, 200, duration);

    const quality = researchMode === 'demo' ? computeQualityScore(enrichedResults, 10, duration) : undefined;

    const responsePayload = normalizeProvenanceEnvelope({
      success: true,
      dataMode: analysisResults.dataMode,
      verificationStatus: analysisResults.verificationStatus,
      generatedAt: analysisResults.generatedAt || new Date().toISOString(),
      requestId,
      molecule,
      disease,
      researchMode,
      degraded: Boolean(analysisResults.degraded),
      processingMode: mode,
      modelUsed: analysisResults.model_used,
      status: 'completed',
      results: {
        ...enrichedResults,
        processingTimeMs: duration
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
        quality,
        ...(researchMode === 'demo' ? { complianceMode: mode === 'secure' ? 'LOCAL_DEMO' : 'CLOUD_DEMO' } : {})
      }
    });

    // A live result is complete only when the report can be read back from storage.
    try {
      const summary = normalizeSummaryForArchive(enrichedResults?.summary || {}, molecule);
      const agentsExecuted = normalizeAgentsForArchive(enrichedResults?.agents_executed || []);
      const processingTimeMs = enrichedResults?.total_processing_time_ms || duration;

      await ResearchReport.findOneAndUpdate(
        { requestId },
        {
          requestId,
          userId: req.user?.id || null,
          molecule,
          query: req.body?.query || `Analysis request for ${molecule}`,
          processingMode: mode,
          modelUsed: analysisResults.model_used,
          results: enrichedResults,
          summary,
          knowledgeGraph: enrichedResults?.knowledge_graph || enrichedResults?.knowledgeGraph || {},
          agentsExecuted,
          totalProcessingTimeMs: processingTimeMs,
          status: 'completed',
          updatedAt: new Date()
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    } catch (archiveError) {
      logger.warn('Auto-archive save skipped', {
        requestId,
        error: archiveError.message
      });
      if (researchMode === 'live') {
        return res.status(503).json(unavailablePayload(
          'REPORT_PERSISTENCE_UNAVAILABLE',
          'Evidence was retrieved but the report could not be saved.',
          { requestId }
        ));
      }
    }

    requestStore.set(requestId, { ownerId: String(req.user?.id || ''), payload: responsePayload });

    // Return aggregated results
    return res.status(200).json(responsePayload);

  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Log error details
    logger.error('Research processing failed', {
      requestId,
      error: error.message,
      stack: error.stack,
      duration
    });

    auditLog.apiResponse(requestId, 500, duration);

    return res.status(503).json(unavailablePayload(
      'RESEARCH_ENGINE_UNAVAILABLE',
      'Research processing failed; no research result is available.',
      {
        errorCode: 'RESEARCH_ENGINE_UNAVAILABLE',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        requestId
      }
    ));
  }
};

const getGnnFallbackReason = (engineError, disease) => {
  const status = engineError?.response?.status;
  const detail = engineError?.response?.data?.detail || engineError?.response?.data?.error;
  const message = detail || engineError?.message || 'Unknown GNN service error';

  if (status === 404 && /not in the trained graph|not found/i.test(message)) {
    return {
      code: 'DISEASE_NOT_IN_GNN_GRAPH',
      userMessage: `The local GNN model does not yet contain enough graph evidence for "${disease}". Showing heuristic candidates instead.`,
      candidateRationale: `Heuristic fallback because "${disease}" is not represented in the trained GNN disease graph.`,
      engineDetail: message
    };
  }

  if (status === 500 && /artifact missing|train model first/i.test(message)) {
    return {
      code: 'GNN_ARTIFACT_MISSING',
      userMessage: 'The GNN service is reachable, but no trained model artifact is loaded. Showing heuristic candidates until training completes.',
      candidateRationale: 'Heuristic fallback because the GNN model artifact is missing or not loaded.',
      engineDetail: message
    };
  }

  if (engineError?.code === 'ECONNREFUSED' || engineError?.code === 'ETIMEDOUT' || /No healthy backend servers/i.test(message)) {
    return {
      code: 'GNN_SERVICE_UNREACHABLE',
      userMessage: 'The AI engine is not reachable right now. Showing heuristic candidates until the service is back online.',
      candidateRationale: 'Heuristic fallback because the AI engine could not be reached.',
      engineDetail: message
    };
  }

  return {
    code: 'GNN_REQUEST_FAILED',
    userMessage: 'The GNN request failed unexpectedly. Showing heuristic candidates while the issue is logged.',
    candidateRationale: 'Heuristic fallback because the GNN request failed unexpectedly.',
    engineDetail: message
  };
};

const getEmergencyRepurposingProfile = (disease) => {
  const normalized = String(disease || '').toLowerCase();

  if (/(covid|corona|sars-cov-2|sars cov 2)/i.test(normalized)) {
    return {
      scenario: 'COVID-19 emergency repurposing',
      purpose: 'Identify existing medicines that could be prioritized quickly during a coronavirus-like outbreak.',
      candidates: [
        {
          drug: 'Remdesivir',
          target: 'Viral RNA-dependent RNA polymerase',
          score: 0.84,
          existingUse: 'Investigational/approved antiviral use in severe viral infections and COVID-19 contexts.',
          emergencyFit: 'Direct antiviral mechanism makes it suitable for early outbreak triage when viral replication is a priority.',
          nextStep: 'Validate timing of administration, disease stage, resistance profile, and clinical endpoint benefit.',
          evidenceLevel: 'fallback',
          evidenceTrail: ['Remdesivir', 'RNA polymerase inhibition', 'viral replication blockade', disease],
          interaction: { pdbId: '7BV2' }
        },
        {
          drug: 'Dexamethasone',
          target: 'Glucocorticoid receptor',
          score: 0.81,
          existingUse: 'Established corticosteroid for inflammatory and immune-mediated conditions.',
          emergencyFit: 'Useful when severe disease is driven by inflammatory lung injury rather than only viral replication.',
          nextStep: 'Stratify by oxygen requirement, immune status, infection risk, and inflammatory markers.',
          evidenceLevel: 'fallback',
          evidenceTrail: ['Dexamethasone', 'glucocorticoid receptor', 'cytokine suppression', disease],
          interaction: { pdbId: '1M2Z' }
        },
        {
          drug: 'Baricitinib',
          target: 'JAK1/JAK2',
          score: 0.77,
          existingUse: 'Approved immunomodulator used for inflammatory diseases such as rheumatoid arthritis.',
          emergencyFit: 'Targets host inflammatory signaling that may worsen severe respiratory viral disease.',
          nextStep: 'Check thrombosis risk, combination therapy safety, and patient immune suppression status.',
          evidenceLevel: 'fallback',
          evidenceTrail: ['Baricitinib', 'JAK1/JAK2', 'host inflammatory signaling', disease],
          interaction: { pdbId: '6BBU' }
        },
        {
          drug: 'Favipiravir',
          target: 'Viral RNA polymerase',
          score: 0.7,
          existingUse: 'Antiviral investigated for RNA virus infections.',
          emergencyFit: 'Mechanism is relevant to RNA-virus outbreaks, but evidence quality can vary by virus and trial design.',
          nextStep: 'Validate antiviral potency, dosing window, pregnancy safety, and outcome-level trial evidence.',
          evidenceLevel: 'fallback',
          evidenceTrail: ['Favipiravir', 'RNA polymerase inhibition', 'RNA virus replication', disease],
          interaction: { pdbId: '7AAP' }
        }
      ]
    };
  }

  if (/(respiratory|viral|outbreak|pandemic|influenza|pneumonia)/i.test(normalized)) {
    return {
      scenario: 'Emerging respiratory outbreak repurposing',
      purpose: 'Rapidly shortlist existing antivirals, immunomodulators, and supportive-pathway drugs for a new respiratory disease.',
      candidates: [
        {
          drug: 'Oseltamivir',
          target: 'Viral neuraminidase',
          score: 0.73,
          existingUse: 'Approved antiviral for influenza treatment and prophylaxis.',
          emergencyFit: 'A known antiviral benchmark for respiratory-virus triage when the pathogen biology is still being mapped.',
          nextStep: 'Confirm target relevance to the new pathogen before prioritizing clinical trials.',
          evidenceLevel: 'fallback',
          evidenceTrail: ['Oseltamivir', 'neuraminidase', 'viral release pathway', disease],
          interaction: { pdbId: '2HU4' }
        },
        {
          drug: 'Dexamethasone',
          target: 'Glucocorticoid receptor',
          score: 0.71,
          existingUse: 'Established anti-inflammatory corticosteroid.',
          emergencyFit: 'Can be assessed for late-stage inflammatory complications in severe respiratory disease.',
          nextStep: 'Separate early antiviral phase from late inflammatory phase before use-case selection.',
          evidenceLevel: 'fallback',
          evidenceTrail: ['Dexamethasone', 'glucocorticoid receptor', 'lung inflammation modulation', disease],
          interaction: { pdbId: '1M2Z' }
        },
        {
          drug: 'Azithromycin',
          target: 'Bacterial ribosome / immunomodulatory pathways',
          score: 0.62,
          existingUse: 'Approved antibiotic for bacterial respiratory infections.',
          emergencyFit: 'May be considered only where bacterial co-infection or immunomodulatory hypotheses are supported.',
          nextStep: 'Avoid assuming antiviral benefit; validate antimicrobial stewardship and resistance risks.',
          evidenceLevel: 'fallback',
          evidenceTrail: ['Azithromycin', 'secondary infection control', 'respiratory complication', disease],
          interaction: { pdbId: '4V7Y' }
        }
      ]
    };
  }

  return {
    scenario: 'General disease-first repurposing',
    purpose: 'Rank existing drugs that may connect to the disease through targets, pathways, and prior safety knowledge.',
    candidates: null
  };
};

const buildFallbackRepurposingResponse = (requestId, disease, topK, fallbackReason) => {
  const emergencyProfile = getEmergencyRepurposingProfile(disease);
  const fallbackCandidates = emergencyProfile.candidates || [
    {
      drug: 'Metformin',
      target: 'AMPK',
      score: 0.72,
      rationale: fallbackReason.candidateRationale,
      existingUse: 'Approved first-line therapy for type 2 diabetes.',
      emergencyFit: 'Useful as a low-cost benchmark candidate when metabolic inflammation or host-cell stress pathways are implicated.',
      nextStep: 'Validate disease-specific mechanism, contraindications, and real-world outcome signal.',
      evidenceLevel: 'fallback',
      evidenceTrail: ['Metformin', 'AMPK', 'Cell Stress Pathway', disease],
      interaction: { pdbId: '4CFE' }
    },
    {
      drug: 'Simvastatin',
      target: 'HMGCR',
      score: 0.68,
      rationale: fallbackReason.candidateRationale,
      existingUse: 'Approved lipid-lowering therapy with broad cardiovascular safety experience.',
      emergencyFit: 'Can be triaged when endothelial inflammation or vascular risk is relevant to the disease.',
      nextStep: 'Validate interaction risks, disease-stage relevance, and clinical outcome signal.',
      evidenceLevel: 'fallback',
      evidenceTrail: ['Simvastatin', 'HMGCR', 'Lipid Signaling', disease],
      interaction: { pdbId: '1HWK' }
    },
    {
      drug: 'Dapagliflozin',
      target: 'SGLT2',
      score: 0.64,
      rationale: fallbackReason.candidateRationale,
      existingUse: 'Approved SGLT2 inhibitor for diabetes, heart failure, and kidney disease contexts.',
      emergencyFit: 'A candidate when metabolic or cardio-renal comorbidity pathways overlap with disease risk.',
      nextStep: 'Screen for dehydration, ketoacidosis, renal function, and disease-specific benefit.',
      evidenceLevel: 'fallback',
      evidenceTrail: ['Dapagliflozin', 'SGLT2', 'Metabolic Pathway', disease],
      interaction: { pdbId: '7VSI' }
    }
  ].map((candidate) => ({
    rationale: fallbackReason.candidateRationale,
    ...candidate
  }));

  return {
    success: true,
    requestId,
    disease,
    model: 'fallback-heuristic-v1',
    candidates: fallbackCandidates.slice(0, topK),
    metadata: {
      generatedAt: new Date().toISOString(),
      evidenceFormat: 'drug -> target -> pathway -> disease',
      source: 'fallback-heuristic',
      scenario: emergencyProfile.scenario,
      purpose: emergencyProfile.purpose,
      fallbackCode: fallbackReason.code,
      note: fallbackReason.userMessage,
      engineDetail: fallbackReason.engineDetail
    }
  };
};

/**
 * Discover repurposing candidates from a disease-first query.
 * Returns ranked drugs, evidence trails, and molecular interaction references.
 *
 * @route POST /api/research/repurpose
 */
const discoverRepurposingCandidates = async (req, res) => {
  const requestId = uuidv4();

  try {
    const diseaseInput = req.body?.disease;
    const topK = Math.min(Math.max(parseInt(req.body?.topK || 5, 10), 1), 10);

    if (!diseaseInput || typeof diseaseInput !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Disease is required',
        requestId
      });
    }

    const disease = diseaseInput.trim();

    try {
      const gnnResponse = await aiEngineService.discoverRepurposingCandidates({
        disease,
        topK
      });

      return res.status(200).json({
        success: true,
        evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
        dataMode: 'MODEL_PREDICTION',
        verificationStatus: 'MODEL_INFERENCE',
        requestId,
        disease: gnnResponse.disease || disease,
        model: gnnResponse.model,
        candidates: gnnResponse.candidates || [],
        metadata: {
          ...(gnnResponse.metadata || {}),
          generatedAt: new Date().toISOString(),
          source: 'ai-engine-gnn'
        }
      });
    } catch (engineError) {
      const fallbackReason = getGnnFallbackReason(engineError, disease);
      logger.warn('GNN discovery unavailable', {
        requestId,
        disease,
        code: fallbackReason.code,
        error: fallbackReason.engineDetail
      });
      return res.status(503).json(unavailablePayload(
        fallbackReason.code || 'GNN_UNAVAILABLE',
        'GNN candidate discovery is unavailable; no substitute candidates were returned.',
        { errorCode: fallbackReason.code || 'GNN_UNAVAILABLE', requestId, disease }
      ));
    }
  } catch (error) {
    logger.error('Disease-first repurposing discovery failed', {
      requestId,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json(unavailablePayload(
      'GNN_REQUEST_FAILED',
      'Failed to discover repurposing candidates; no substitute candidates were returned.',
      { requestId }
    ));
  }
};

/** Retrieve publication metadata only; this endpoint makes no clinical-validity claim. */
const searchPubMedEvidence = async (req, res) => {
  try {
    const result = await aiEngineService.searchPubMedEvidence({
      query: req.body.query,
      limit: req.body.limit || 10
    });
    return res.status(200).json(normalizeProvenanceEnvelope(result, 'SOURCE_BACKED'));
  } catch (error) {
    logger.warn('PubMed evidence retrieval unavailable', { error: error.message });
    return res.status(503).json(unavailablePayload(
      'PUBMED_UNAVAILABLE',
      'PubMed evidence retrieval is currently unavailable.'
    ));
  }
};

const searchClinicalTrialsEvidence = async (req, res) => {
  try {
    const result = await aiEngineService.searchClinicalTrialsEvidence(req.body);
    return res.status(200).json(normalizeProvenanceEnvelope(result, 'SOURCE_BACKED'));
  } catch (error) {
    logger.warn('ClinicalTrials.gov evidence retrieval unavailable', { error: error.message });
    return res.status(503).json(unavailablePayload(
      'CLINICAL_TRIALS_UNAVAILABLE',
      'ClinicalTrials.gov evidence retrieval is currently unavailable.'
    ));
  }
};

const getCandidateEvidence = async (req, res) => {
  const { candidate, disease, score, limit = 10 } = req.body;
  try {
    const [pubmed, clinicalTrials] = await Promise.all([
      aiEngineService.searchPubMedEvidence({ query: `${candidate} ${disease}`, limit }),
      aiEngineService.searchClinicalTrialsEvidence({ drug: candidate, condition: disease, limit })
    ]);
    return res.json(normalizeProvenanceEnvelope({
      success: true,
      dataMode: 'MODEL_PREDICTION',
      verificationStatus: 'MODEL_INFERENCE',
      generatedAt: new Date().toISOString(),
      candidateEvidence: buildCandidateEvidenceSummary(
      candidate, { score }, pubmed.evidence || [], clinicalTrials.evidence || [], disease),
      literatureEvidence: pubmed.evidence || [], clinicalTrialEvidence: clinicalTrials.evidence || []
    }, 'MODEL_PREDICTION'));
  } catch (error) {
    logger.warn('Candidate evidence retrieval unavailable', { error: error.message });
    return res.status(503).json(unavailablePayload(
      'CANDIDATE_EVIDENCE_UNAVAILABLE',
      'Candidate evidence retrieval is currently unavailable.'
    ));
  }
};

const experimentalFailure = (res, error) => {
  const status = error.response?.status || 503;
  const message = status === 404 ? 'The requested experimental record was not found.' : 'Experimental repurposing is currently unavailable.';
  logger.warn('Experimental repurposing proxy unavailable', { status, error: error.message });
  return res.status(status).json(unavailablePayload(
    status === 404 ? 'EXPERIMENTAL_RECORD_NOT_FOUND' : 'EXPERIMENTAL_REPURPOSING_UNAVAILABLE',
    message
  ));
};

const getExperimentalCandidates = async (req, res) => {
  try {
    const result = await aiEngineService.experimentalCandidates({ drugId: req.params.drugId, topK: req.query.top_k || 10 });
    return res.json(normalizeProvenanceEnvelope(result, 'MODEL_PREDICTION'));
  } catch (error) { return experimentalFailure(res, error); }
};

const getExperimentalCandidateDetail = async (req, res) => {
  try {
    const result = await aiEngineService.experimentalCandidateDetail({ drugId: req.params.drugId, diseaseId: req.params.diseaseId });
    return res.json(normalizeProvenanceEnvelope(result, 'MODEL_PREDICTION'));
  } catch (error) { return experimentalFailure(res, error); }
};

const getExperimentalKnownIndications = async (req, res) => {
  try {
    const result = await aiEngineService.experimentalKnownIndications({ drugId: req.params.drugId });
    return res.json(normalizeProvenanceEnvelope(result, 'SOURCE_BACKED'));
  } catch (error) { return experimentalFailure(res, error); }
};

const getExperimentalEvidence = async (req, res) => {
  try {
    const result = await aiEngineService.experimentalEvidence({ drugId: req.body.drug_id, diseaseId: req.body.disease_id });
    return res.json(normalizeProvenanceEnvelope(result, 'MODEL_PREDICTION'));
  } catch (error) { return experimentalFailure(res, error); }
};

/**
 * Trigger full GNN training pipeline in AI engine and persist model artifact.
 *
 * @route POST /api/research/repurpose/train
 */
const trainRepurposingModel = async (req, res) => {
  const requestId = uuidv4();

  try {
    const trainResult = await aiEngineService.trainRepurposingModel({
      datasetPath: req.body?.datasetPath || null,
      epochs: req.body?.epochs || 120,
      learningRate: req.body?.learningRate || 0.01,
      hiddenDim: req.body?.hiddenDim || 64,
      embeddingDim: req.body?.embeddingDim || 64
    });

    return res.status(200).json({
      success: true,
      requestId,
      ...trainResult
    });
  } catch (error) {
    logger.error('GNN training trigger failed', {
      requestId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      requestId,
      error: 'Failed to train GNN repurposing model',
      message: error.message
    });
  }
};

/**
 * Apply online graph relation updates and warm retrain model.
 *
 * @route POST /api/research/repurpose/online-update
 */
const onlineUpdateRepurposingModel = async (req, res) => {
  const requestId = uuidv4();

  try {
    const relations = Array.isArray(req.body?.relations) ? req.body.relations : [];
    if (!relations.length) {
      return res.status(400).json({
        success: false,
        requestId,
        error: 'relations array is required for online update'
      });
    }

    const updateResult = await aiEngineService.onlineUpdateRepurposingModel({
      relations,
      epochs: req.body?.epochs || 25
    });

    return res.status(200).json({
      success: true,
      requestId,
      ...updateResult
    });
  } catch (error) {
    logger.error('GNN online update failed', {
      requestId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      requestId,
      error: 'Failed to apply online model update',
      message: error.message
    });
  }
};

/**
 * Get current GNN model status from AI engine.
 *
 * @route GET /api/research/repurpose/status
 */
const getRepurposingModelStatus = async (req, res) => {
  const requestId = uuidv4();

  try {
    const status = await aiEngineService.getRepurposingModelStatus();
    return res.status(200).json({
      success: true,
      requestId,
      ...status
    });
  } catch (error) {
    logger.error('GNN status check failed', {
      requestId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      requestId,
      error: 'Failed to fetch repurposing model status',
      message: error.message
    });
  }
};

/**
 * Get research status by request ID
 * 
 * @route GET /api/research/:requestId
 * @param {string} req.params.requestId - Unique request identifier
 * @returns {Object} Current status of the research request
 */
const getResearchStatus = async (req, res) => {
  const { requestId } = req.params;

  try {
    logger.info('Status check requested', { requestId });

    const stored = requestStore.get(requestId);
    if (stored?.ownerId === String(req.user?.id || '')) {
      return res.status(200).json(stored.payload);
    }

    const archived = await ResearchReport.findOne({ requestId, userId: req.user?.id }).lean();
    if (archived) {
      const quality = computeQualityScore(
        archived.results || {},
        10,
        archived.totalProcessingTimeMs || 0
      );

      return res.status(200).json(normalizeProvenanceEnvelope({
        success: true,
        dataMode: archived.results?.dataMode,
        verificationStatus: archived.results?.verificationStatus,
        generatedAt: archived.results?.generatedAt,
        requestId: archived.requestId,
        molecule: archived.molecule,
        disease: archived.results?.disease || null,
        researchMode: archived.results?.researchMode || 'legacy',
        degraded: Boolean(archived.results?.degraded),
        processingMode: archived.processingMode,
        modelUsed: archived.modelUsed,
        status: archived.status || 'completed',
        results: archived.results || {},
        metadata: {
          timestamp: archived.createdAt,
          version: '1.0.0',
          source: 'archive-db',
          ...(archived.results?.researchMode === 'demo' ? { quality } : {})
        }
      }));
    }

    return res.status(404).json({
      success: false,
      requestId,
      status: 'not_found',
      message: 'No stored research result found for this request ID. Run analysis again to populate live status.'
    });

  } catch (error) {
    logger.error('Status check failed', { requestId, error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve status'
    });
  }
};

/**
 * Health check for the research service
 * 
 * @route GET /api/research/health
 * @returns {Object} Service health status
 */
const healthCheck = async (req, res) => {
  try {
    // Check AI Engine connectivity
    const aiHealth = await aiEngineService.checkHealth();

    return res.status(200).json({
      success: true,
      service: 'research-controller',
      status: 'healthy',
      dependencies: {
        aiEngine: aiHealth ? 'connected' : 'disconnected'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    return res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
};

module.exports = {
  processResearch,
  discoverRepurposingCandidates,
  searchPubMedEvidence,
  searchClinicalTrialsEvidence,
  getCandidateEvidence,
  getExperimentalCandidates,
  getExperimentalCandidateDetail,
  getExperimentalKnownIndications,
  getExperimentalEvidence,
  getRepurposingModelStatus,
  trainRepurposingModel,
  onlineUpdateRepurposingModel,
  getResearchStatus,
  healthCheck
};
