/**
 * SentinelPharma AI Engine Service
 * =============================
 * Handles communication between Node.js backend and Python FastAPI AI Engine.
 * Manages API calls, error handling, and response transformation.
 */

const axios = require('axios');
const { logger, auditLog } = require('../utils/logger');
const loadBalancer = require('../utils/loadBalancer');
const aiClient = axios.create({
  timeout: 300000
});
const internalServiceHeaders = () => ({
  'X-Service': 'sentinelpharma-server',
  ...(process.env.INTERNAL_SERVICE_TOKEN
    ? { 'X-Internal-Service-Token': process.env.INTERNAL_SERVICE_TOKEN }
    : {})
});

// Request interceptor for logging
aiClient.interceptors.request.use(
  (config) => {
    logger.debug('AI Engine request', {
      url: config.url,
      method: config.method,
      data: config.data
    });
    return config;
  },
  (error) => {
    logger.error('AI Engine request error', { error: error.message });
    return Promise.reject(error);
  }
);

// Response interceptor for logging
aiClient.interceptors.response.use(
  (response) => {
    logger.debug('AI Engine response', {
      status: response.status,
      url: response.config.url
    });
    return response;
  },
  (error) => {
    logger.error('AI Engine response error', {
      status: error.response?.status,
      message: error.message,
      url: error.config?.url
    });
    return Promise.reject(error);
  }
);

/**
 * Analyze a compound using the multi-agent system
 * 
 * @param {Object} params - Analysis parameters
 * @param {string} params.molecule - Compound/drug name
 * @param {string} params.mode - Processing mode (secure/cloud)
 * @param {string} params.requestId - Unique request identifier
 * @param {string[]} params.agents - List of agents to engage
 * @param {string} params.provider - AI model provider (ollama/gemini)
 * @returns {Object} Aggregated analysis results
 */
const analyzeCompound = async ({ molecule, mode, requestId, agents, provider }) => {
  try {
    logger.info('Initiating compound analysis', { molecule, mode, requestId, provider });

    // Call the AI Engine analyze endpoint using load balancer
    const response = await loadBalancer.request('/api/analyze', {
      method: 'POST',
      data: {
        molecule,
        mode,
        request_id: requestId,
        agents,
        provider
      },
      headers: {
        'Content-Type': 'application/json',
        ...internalServiceHeaders()
      }
    });

    // Log agent activities
    if (response.data.agents_executed) {
      response.data.agents_executed.forEach(agent => {
        auditLog.agentActivity(agent.name, 'COMPLETED', {
          requestId,
          status: agent.status,
          duration: agent.duration_ms
        });
      });
    }

    return response.data;

  } catch (error) {
    logger.warn('AI Engine analysis unavailable', { requestId, error: error.message });
    throw error;
  }
};

/**
 * Get ROI calculation from Market Agent
 * 
 * @param {string} molecule - Compound name
 * @param {string} requestId - Request identifier
 * @returns {Object} ROI calculation results
 */
const getROICalculation = async (molecule, requestId) => {
  try {
    const response = await loadBalancer.request('/api/agents/iqvia/market-intelligence', {
      method: 'POST',
      data: {
        molecule,
        request_id: requestId
      },
      headers: {
        'Content-Type': 'application/json',
        'X-Service': 'sentinelpharma-server'
      }
    });

    return response.data;

  } catch (error) {
    logger.warn('ROI calculation unavailable', { requestId, error: error.message });
    throw error;
  }
};

/**
 * Check AI Engine health status
 * 
 * @returns {boolean} True if AI Engine is healthy
 */
const checkHealth = async () => {
  try {
    const response = await loadBalancer.request('/health', {
      method: 'GET',
      timeout: 5000
    });
    return response.status === 200;
  } catch (error) {
    logger.warn('AI Engine health check failed', { error: error.message });
    return false;
  }
};

/**
 * Get GNN model status from AI engine.
 */
const getRepurposingModelStatus = async () => {
  const response = await loadBalancer.request('/api/gnn/status', {
    method: 'GET',
    headers: {
      ...internalServiceHeaders()
    }
  });
  return response.data;
};

/**
 * Train DrugBank-oriented GNN model and persist artifact in AI engine.
 */
const trainRepurposingModel = async ({ datasetPath = null, epochs = 120, learningRate = 0.01, hiddenDim = 64, embeddingDim = 64 } = {}) => {
  const response = await loadBalancer.request('/api/gnn/train', {
    method: 'POST',
    data: {
      dataset_path: datasetPath,
      epochs,
      learning_rate: learningRate,
      hidden_dim: hiddenDim,
      embedding_dim: embeddingDim
    },
    headers: {
      'Content-Type': 'application/json',
      ...internalServiceHeaders()
    }
  });
  return response.data;
};

/**
 * Get disease-first repurposing candidates from GNN prediction endpoint.
 */
const discoverRepurposingCandidates = async ({ disease, topK = 5 }) => {
  const response = await loadBalancer.request('/api/gnn/repurpose', {
    method: 'POST',
    data: {
      disease,
      top_k: topK
    },
    headers: {
      'Content-Type': 'application/json',
      ...internalServiceHeaders()
    }
  });
  return response.data;
};

/** Retrieve source-backed PubMed metadata through the internal AI service. */
const searchPubMedEvidence = async ({ query, limit = 10 }) => {
  const response = await loadBalancer.request('/api/evidence/pubmed/search', {
    method: 'POST',
    data: { query, limit },
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      ...internalServiceHeaders()
    }
  });
  return response.data;
};

const searchClinicalTrialsEvidence = async ({ drug, condition, query, limit = 10 }) => {
  const response = await loadBalancer.request('/api/evidence/clinical-trials/search', {
    method: 'POST', data: { drug, condition, query, limit }, timeout: 15000,
    headers: { 'Content-Type': 'application/json', ...internalServiceHeaders() }
  });
  return response.data;
};

/** Secure server-side proxy for the frozen experimental candidate API. */
const experimentalCandidates = async ({ drugId, topK = 10 }) => {
  const response = await loadBalancer.request(`/api/experimental/repurposing/drugs/${encodeURIComponent(drugId)}/candidates`, {
    method: 'GET', params: { top_k: topK }, headers: internalServiceHeaders()
  });
  return response.data;
};

const experimentalCandidateDetail = async ({ drugId, diseaseId }) => {
  const response = await loadBalancer.request(`/api/experimental/repurposing/drugs/${encodeURIComponent(drugId)}/candidates/${encodeURIComponent(diseaseId)}`, {
    method: 'GET', headers: internalServiceHeaders()
  });
  return response.data;
};

const experimentalKnownIndications = async ({ drugId }) => {
  const response = await loadBalancer.request(`/api/experimental/repurposing/drugs/${encodeURIComponent(drugId)}/known-indications`, {
    method: 'GET', headers: internalServiceHeaders()
  });
  return response.data;
};

const experimentalEvidence = async ({ drugId, diseaseId }) => {
  const response = await loadBalancer.request('/api/experimental/repurposing/evidence', {
    method: 'POST', data: { drug_id: drugId, disease_id: diseaseId }, headers: { 'Content-Type': 'application/json', ...internalServiceHeaders() }
  });
  return response.data;
};

/**
 * Apply online graph updates and warm retraining.
 */
const onlineUpdateRepurposingModel = async ({ relations, epochs = 25 }) => {
  const response = await loadBalancer.request('/api/gnn/online-update', {
    method: 'POST',
    data: {
      relations,
      epochs
    },
    headers: {
      'Content-Type': 'application/json',
      ...internalServiceHeaders()
    }
  });
  return response.data;
};

/**
 * Generate mock analysis results for development/fallback
 * 
 * @param {string} molecule - Compound name
 * @param {string} requestId - Request identifier
 * @returns {Object} Mock analysis results
 */
const getMockAnalysisResults = (molecule, requestId) => {
  const mockROI = getMockROIData(molecule);

  return {
    requestId,
    molecule,
    agents_executed: [
      { name: 'ClinicalAgent', status: 'completed', duration_ms: 1200 },
      { name: 'PatentAgent', status: 'completed', duration_ms: 800 },
      { name: 'IQVIAInsightsAgent', status: 'completed', duration_ms: 1500 },
      { name: 'VisionAgent', status: 'completed', duration_ms: 2000 }
    ],
    clinical: {
      trials_found: Math.floor(Math.random() * 50) + 10,
      indications: ['Oncology', 'Immunology', 'Neurology'],
      phase_distribution: { phase1: 5, phase2: 12, phase3: 8, phase4: 3 },
      safety_score: (Math.random() * 2 + 7).toFixed(1)
    },
    patent: {
      active_patents: Math.floor(Math.random() * 20) + 5,
      expiration_date: '2028-06-15',
      freedom_to_operate: 'Medium',
      key_holders: ['Pfizer', 'Novartis', 'Roche']
    },
    iqvia: {
      ...mockROI,
      global_market_size_usd_bn: Number(mockROI.market_size_billions),
      five_year_cagr: Number((Math.random() * 6 + 4).toFixed(1))
    },
    market: mockROI,
    vision: {
      molecular_structure_analyzed: true,
      binding_sites_identified: Math.floor(Math.random() * 5) + 2,
      similarity_compounds: ['Compound A', 'Compound B', 'Compound C']
    },
    knowledge_graph: {
      nodes: 156,
      edges: 423,
      key_pathways: ['PI3K/AKT', 'MAPK/ERK', 'JAK/STAT']
    }
  };
};

/**
 * Generate mock ROI data
 * 
 * @param {string} molecule - Compound name
 * @returns {Object} Mock ROI data
 */
const getMockROIData = (molecule) => {
  // Generate random revenue between $100M - $500M
  const revenue = Math.floor(Math.random() * 400) + 100;
  const developmentCost = Math.floor(Math.random() * 80) + 40;
  const roi = ((revenue - developmentCost) / developmentCost * 100).toFixed(1);

  return {
    molecule,
    projected_revenue_millions: revenue,
    development_cost_millions: developmentCost,
    roi_percentage: parseFloat(roi),
    market_size_billions: (Math.random() * 20 + 5).toFixed(1),
    time_to_market_years: (Math.random() * 3 + 2).toFixed(1),
    probability_of_success: (Math.random() * 30 + 50).toFixed(0) + '%',
    competitive_landscape: 'Moderate',
    recommendation: revenue > 300 ? 'STRONG_BUY' : revenue > 200 ? 'BUY' : 'HOLD'
  };
};

module.exports = {
  analyzeCompound,
  getROICalculation,
  checkHealth,
  getRepurposingModelStatus,
  trainRepurposingModel,
  discoverRepurposingCandidates,
  searchPubMedEvidence,
  searchClinicalTrialsEvidence,
  experimentalCandidates,
  experimentalCandidateDetail,
  experimentalKnownIndications,
  experimentalEvidence,
  onlineUpdateRepurposingModel
};
