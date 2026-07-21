/**
 * SentinelPharma API Service
 * =======================
 * Axios configuration and API methods for communicating with the backend.
 */

import axios from 'axios';

const AUTH_STORAGE_KEY = 'sentinel_auth_session';
export const AUTH_EXPIRED_EVENT = 'sentinel:auth-expired';

const getStoredAuthSession = () => {
  try {
    const localRaw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (localRaw) return JSON.parse(localRaw);
  } catch (_err) {
    // Ignore malformed storage.
  }

  try {
    const sessionRaw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (sessionRaw) return JSON.parse(sessionRaw);
  } catch (_err) {
    // Ignore malformed storage.
  }

  return null;
};
const VITE_ENV = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const NODE_ENV = (typeof process !== 'undefined' && process.env?.NODE_ENV) ? process.env.NODE_ENV : VITE_ENV.MODE;
const IS_DEV = NODE_ENV === 'development';

// API Base URL - handle both Vite and Jest environments
const API_BASE_URL = VITE_ENV.VITE_API_URL ||
                     ((typeof process !== 'undefined' && process.env?.VITE_API_URL) ? process.env.VITE_API_URL : undefined) ||
                     (typeof window !== 'undefined' && window.VITE_API_URL) ||
                     'http://localhost:3001';

// Create axios instance with default configuration
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minute timeout for comprehensive AI analysis
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - add auth token, logging, etc.
apiClient.interceptors.request.use(
  (config) => {
    try {
      const auth = getStoredAuthSession();
      if (auth?.token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${auth.token}`
        };
      }
    } catch (_err) {
      // Ignore malformed local auth state and continue request.
    }

    // Add request timestamp for tracking
    config.metadata = { startTime: new Date() };
    
    // Log request in development
    if (IS_DEV) {
      console.log(`📤 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors, logging, etc.
apiClient.interceptors.response.use(
  (response) => {
    // Calculate request duration
    const duration = new Date() - response.config.metadata.startTime;
    
    // Log response in development
    if (IS_DEV) {
      console.log(`📥 API Response: ${response.status} (${duration}ms)`);
    }
    
    return response;
  },
  (error) => {
    // Log error details
    console.error('API Error:', error.message);
    
    // Handle specific error codes
    if (error.response?.status === 401) {
      // Broadcast unauthorized state so AuthContext can perform a clean logout.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      }
    }
    
    return Promise.reject(error);
  }
);

/**
 * Research Service
 * Handles all research-related API calls
 */
export const researchService = {
  /**
   * Analyze a drug/molecule for repurposing opportunities
   * @param {string} molecule - Name of the drug/compound
   * @param {string} mode - Processing mode ('secure' or 'cloud')
  * @param {string} provider - AI model provider ('ollama', 'gemini')
   * @returns {Promise} API response with analysis results
   */
  analyze: async (molecule, mode = 'cloud', provider = null) => {
    return apiClient.post('/api/research', {
      molecule,
      mode,
      provider
    });
  },

  /**
   * Discover ranked repurposing candidates for a disease
   * @param {string} disease - Disease or condition
   * @param {number} topK - Number of candidates to return
   * @returns {Promise} API response with ranked candidates and evidence trails
   */
  discoverRepurposing: async (disease, topK = 5) => {
    return apiClient.post('/api/research/repurpose', {
      disease,
      topK
    });
  },

  /**
   * Get GNN model status from backend passthrough endpoint
   */
  getRepurposingModelStatus: async () => {
    return apiClient.get('/api/research/repurpose/status');
  },

  /**
   * Trigger model training and artifact refresh
   */
  trainRepurposingModel: async ({ epochs, learningRate, hiddenDim, embeddingDim, datasetPath = null }) => {
    return apiClient.post('/api/research/repurpose/train', {
      epochs,
      learningRate,
      hiddenDim,
      embeddingDim,
      datasetPath
    });
  },

  /**
   * Apply online KG relation updates
   */
  onlineUpdateRepurposingModel: async ({ relations, epochs = 10 }) => {
    return apiClient.post('/api/research/repurpose/online-update', {
      relations,
      epochs
    });
  },
  
  /**
   * Get status of a research request
   * @param {string} requestId - Unique request identifier
   * @returns {Promise} API response with status
   */
  getStatus: async (requestId) => {
    return apiClient.get(`/api/research/${requestId}`);
  },
  
  /**
   * Health check for research service
   * @returns {Promise} API response with health status
   */
  healthCheck: async () => {
    return apiClient.get('/api/research/health');
  }
};

/**
 * Health Service
 * General API health checks
 */
export const healthService = {
  /**
   * Check overall API health
   * @returns {Promise} API response with health status
   */
  check: async () => {
    return apiClient.get('/health');
  }
};

export const authService = {
  login: async (payload) => {
    return apiClient.post('/api/auth/login', payload);
  },
  googleLogin: async (payload) => {
    return apiClient.post('/api/auth/google', payload);
  },
  requestOtp: async (payload) => {
    return apiClient.post('/api/auth/request-otp', payload);
  },
  verifyOtp: async (payload) => {
    return apiClient.post('/api/auth/verify-otp', payload);
  },
  me: async () => {
    return apiClient.get('/api/auth/me');
  },
  logout: async () => {
    return apiClient.post('/api/auth/logout');
  }
};

export default apiClient;
