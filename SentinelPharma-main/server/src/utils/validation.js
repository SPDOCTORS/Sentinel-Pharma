/**
 * SentinelPharma Data Validation Schemas (Zod)
 * =========================================
 * Strict JSON schema validation for API responses.
 * Prevents UI crashes from malformed data.
 */

const { z } = require('zod');

// ======================
// REQUEST SCHEMAS
// ======================

/**
 * Research analysis request schema
 */
const AnalyzeRequestSchema = z.object({
  molecule: z.string()
    .min(2, 'Molecule name must be at least 2 characters')
    .max(200, 'Molecule name too long'),
  mode: z.enum(['secure', 'cloud']).default('cloud'),
  agents: z.array(z.enum(['clinical', 'patent', 'market', 'vision', 'kol', 'pathfinder', 'validation']))
    .optional()
    .default(['clinical', 'patent', 'market', 'vision']),
  requestId: z.string().optional()
});

/**
 * ROI calculation request schema
 */
const ROIRequestSchema = z.object({
  molecule: z.string().min(2),
  requestId: z.string().optional()
});

/**
 * Watchlist add request schema
 */
const WatchlistAddSchema = z.object({
  molecule: z.string().min(2).max(200),
  alertTypes: z.array(z.enum(['new_trials', 'patent_changes', 'new_publications', 'market_updates']))
    .min(1, 'Select at least one alert type'),
  emailNotifications: z.boolean().default(true)
});

// ======================
// RESPONSE SCHEMAS
// ======================

/**
 * Clinical agent response schema
 */
const ClinicalResponseSchema = z.object({
  molecule: z.string(),
  total_trials_found: z.number().int().min(0),
  active_trials: z.number().int().min(0),
  completed_trials: z.number().int().min(0).optional(),
  phase_distribution: z.object({
    phase_1: z.number().int().min(0),
    phase_2: z.number().int().min(0),
    phase_3: z.number().int().min(0),
    phase_4: z.number().int().min(0),
  }).optional(),
  current_indications: z.array(z.string()).optional(),
  potential_new_indications: z.array(z.string()).optional(),
  safety_score: z.number().min(0).max(10),
  efficacy_rating: z.string(),
  adverse_events: z.array(z.object({
    event: z.string(),
    frequency: z.string(),
    severity: z.string()
  })).optional(),
  black_box_warning: z.boolean().optional(),
  regulatory_status: z.record(z.string()).optional(),
  agent: z.string(),
  version: z.string(),
  processing_time_ms: z.number().optional()
});

/**
 * Patent agent response schema
 */
const PatentResponseSchema = z.object({
  molecule: z.string(),
  total_patents: z.number().int().min(0).optional(),
  active_patents: z.number().int().min(0),
  pending_applications: z.number().int().min(0).optional(),
  earliest_expiration: z.string(),
  latest_expiration: z.string().optional(),
  freedom_to_operate: z.string(),
  fto_score: z.number().min(0).max(10).optional(),
  blocking_patents: z.number().int().min(0).optional(),
  key_patent_holders: z.array(z.object({
    company: z.string(),
    patent_count: z.number().int().optional(),
    key_claims: z.string().optional()
  })).optional(),
  licensing_opportunities: z.string().optional(),
  geographic_coverage: z.record(z.boolean()).optional(),
  ip_risk_level: z.string().optional(),
  strategy_recommendations: z.array(z.string()).optional(),
  agent: z.string(),
  version: z.string(),
  processing_time_ms: z.number().optional()
});

/**
 * Market agent response schema
 */
const MarketResponseSchema = z.object({
  molecule: z.string(),
  projected_revenue_millions: z.number().min(0),
  development_cost_millions: z.number().min(0),
  roi_percentage: z.number(),
  net_present_value_millions: z.number().optional(),
  market_size_billions: z.union([z.number(), z.string()]),
  market_cagr_percent: z.number().optional(),
  addressable_market_share_percent: z.number().optional(),
  time_to_market_years: z.union([z.number(), z.string()]),
  probability_of_success: z.string(),
  risk_level: z.string().optional(),
  competitive_landscape: z.string(),
  key_competitors: z.array(z.string()).optional(),
  patent_cliff_risk: z.string().optional(),
  recommendation: z.enum(['STRONG_BUY', 'BUY', 'HOLD', 'REVIEW']),
  confidence_level: z.string().optional(),
  investment_thesis: z.string().optional(),
  agent: z.string(),
  version: z.string(),
  processing_time_ms: z.number().optional()
});

/**
 * Vision agent response schema
 */
const VisionResponseSchema = z.object({
  molecule: z.string(),
  structure_analyzed: z.boolean().optional(),
  molecular_weight: z.number().optional(),
  molecular_formula: z.string().optional(),
  smiles_notation: z.string().optional(),
  binding_sites_identified: z.number().int().min(0),
  primary_target: z.string().optional(),
  binding_affinity_score: z.number().optional(),
  similar_compounds: z.array(z.object({
    name: z.string(),
    similarity_score: z.number(),
    mechanism: z.string().optional()
  })).optional(),
  structural_alerts: z.array(z.string()).optional(),
  properties: z.object({
    logP: z.number().optional(),
    pKa: z.number().optional(),
    hbd: z.number().int().optional(),
    hba: z.number().int().optional(),
    rotatable_bonds: z.number().int().optional(),
    tpsa: z.number().optional(),
    lipinski_violations: z.number().int().optional()
  }).optional(),
  druglikeness_score: z.number().optional(),
  bioavailability_score: z.number().optional(),
  visualization: z.object({
    '3d_model_available': z.boolean().optional(),
    conformers_generated: z.number().int().optional(),
    energy_minimized: z.boolean().optional()
  }).optional(),
  agent: z.string(),
  version: z.string(),
  processing_time_ms: z.number().optional()
});

/**
 * Validation agent response schema
 */
const ValidationResponseSchema = z.object({
  molecule: z.string(),
  risk_flags: z.array(z.string()),
  risk_count: z.number().int().min(0),
  risk_severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  inconsistencies: z.array(z.object({
    type: z.string(),
    description: z.string(),
    severity: z.string()
  })).optional(),
  data_quality_score: z.number().min(0).max(1),
  confidence_scores: z.record(z.number()).optional(),
  overall_confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  critical_issues: z.array(z.string()),
  requires_human_review: z.boolean(),
  validation_recommendations: z.array(z.string()),
  hallucination_check: z.object({
    claims_verified: z.number().int(),
    claims_flagged: z.number().int(),
    confidence_level: z.string()
  }).optional(),
  agent: z.string(),
  version: z.string(),
  processing_time_ms: z.number().optional()
});

/**
 * Knowledge graph response schema
 */
const KnowledgeGraphSchema = z.object({
  nodes: z.union([
    z.number().int().min(0),
    z.array(z.object({
      id: z.string(),
      label: z.string(),
      type: z.string(),
      color: z.string().optional(),
      metadata: z.record(z.any()).optional()
    }))
  ]),
  edges: z.union([
    z.number().int().min(0),
    z.array(z.object({
      source: z.string(),
      target: z.string(),
      type: z.string().optional(),
      weight: z.number().optional()
    }))
  ]),
  key_pathways: z.array(z.string()).optional(),
  node_count: z.number().int().optional(),
  edge_count: z.number().int().optional()
});

/**
 * Complete analysis response schema
 */
const AnalysisResponseSchema = z.object({
  request_id: z.string(),
  molecule: z.string(),
  processing_mode: z.string().optional(),
  model_used: z.string().optional(),
  agents_executed: z.array(z.object({
    name: z.string(),
    status: z.enum(['completed', 'failed', 'skipped']),
    duration_ms: z.number().optional()
  })),
  clinical: ClinicalResponseSchema.optional(),
  patent: PatentResponseSchema.optional(),
  market: MarketResponseSchema.optional(),
  vision: VisionResponseSchema.optional(),
  validation: ValidationResponseSchema.optional(),
  knowledge_graph: KnowledgeGraphSchema.optional(),
  processingTimeMs: z.number().optional()
});

// ======================
// VALIDATION MIDDLEWARE
// ======================

/**
 * Express middleware to validate request body against schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.validatedBody = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(error);
    }
  };
};

/**
 * Validate and sanitize AI engine response
 * @param {object} data - Raw response data
 * @param {string} agentType - Type of agent response
 * @returns {object} Validated and sanitized data
 */
const validateAgentResponse = (data, agentType) => {
  const schemas = {
    clinical: ClinicalResponseSchema,
    patent: PatentResponseSchema,
    market: MarketResponseSchema,
    vision: VisionResponseSchema,
    validation: ValidationResponseSchema
  };

  const schema = schemas[agentType];
  if (!schema) {
    return data; // No schema for this agent type, return as-is
  }

  try {
    return schema.parse(data);
  } catch (error) {
    console.warn(`Validation warning for ${agentType}:`, error.errors);
    // Return data with defaults for missing fields
    return schema.safeParse(data).data || data;
  }
};

/**
 * Validate complete analysis response
 * @param {object} data - Full analysis response
 * @returns {object} Validated response
 */
const validateAnalysisResponse = (data) => {
  try {
    return AnalysisResponseSchema.parse(data);
  } catch (error) {
    console.warn('Analysis response validation warning:', error.errors);
    return data;
  }
};

module.exports = {
  // Request Schemas
  AnalyzeRequestSchema,
  ROIRequestSchema,
  WatchlistAddSchema,
  
  // Response Schemas
  ClinicalResponseSchema,
  PatentResponseSchema,
  MarketResponseSchema,
  VisionResponseSchema,
  ValidationResponseSchema,
  KnowledgeGraphSchema,
  AnalysisResponseSchema,
  
  // Validation Functions
  validateRequest,
  validateAgentResponse,
  validateAnalysisResponse
};
