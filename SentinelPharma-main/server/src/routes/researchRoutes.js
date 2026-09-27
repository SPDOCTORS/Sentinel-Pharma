/**
 * SentinelPharma Research Routes
 * ===========================
 * API routes for drug repurposing research operations.
 */

const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const { requireAuth, requireRole } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');

const {
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
} = require('../controllers/researchController');

/**
 * Validation middleware for research requests
 */
const validateResearchRequest = [
  body('molecule')
    .trim()
    .notEmpty()
    .withMessage('Molecule name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Molecule name must be between 2 and 200 characters'),
  body('mode')
    .optional()
    .isIn(['secure', 'cloud'])
    .withMessage('Mode must be either "secure" or "cloud"')
];

const validateRequestId = [
  param('requestId')
    .isUUID(4)
    .withMessage('Invalid request ID format')
];

const validateRepurposingRequest = [
  body('disease')
    .trim()
    .notEmpty()
    .withMessage('Disease is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Disease must be between 2 and 200 characters'),
  body('topK')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('topK must be an integer between 1 and 10')
];

const validatePubMedRequest = [
  body('query').trim().isLength({ min: 2, max: 500 }).withMessage('Query must be between 2 and 500 characters'),
  body('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be an integer between 1 and 50')
];

const validateClinicalTrialsRequest = [
  body('drug').optional().trim().isLength({ min: 2, max: 200 }),
  body('condition').optional().trim().isLength({ min: 2, max: 200 }),
  body('query').optional().trim().isLength({ min: 2, max: 500 }),
  body('limit').optional().isInt({ min: 1, max: 50 })
];

const validateCandidateEvidenceRequest = [
  body('candidate').trim().isLength({ min: 2, max: 200 }),
  body('disease').trim().isLength({ min: 2, max: 200 }),
  body('score').optional().isFloat({ min: 0, max: 1 }),
  body('limit').optional().isInt({ min: 1, max: 50 })
];

const validateExperimentalDrug = [param('drugId').trim().isLength({ min: 1, max: 200 })];
const validateExperimentalCandidate = [
  ...validateExperimentalDrug,
  param('diseaseId').trim().isLength({ min: 1, max: 200 })
];
const validateExperimentalEvidence = [
  body('drug_id').trim().isLength({ min: 1, max: 200 }),
  body('disease_id').trim().isLength({ min: 1, max: 200 })
];

/**
 * @route   POST /api/research
 * @desc    Process a drug repurposing research request
 * @access  Private
 */
router.post('/', requireAuth, validateResearchRequest, handleValidationErrors, processResearch);

/**
 * @route   POST /api/research/repurpose
 * @desc    Discover disease-first ranked repurposing candidates
 * @access  Private
 */
router.post('/repurpose', requireAuth, validateRepurposingRequest, handleValidationErrors, discoverRepurposingCandidates);

/** Source-backed literature retrieval; authentication is enforced at Express. */
router.post('/evidence/pubmed', requireAuth, validatePubMedRequest, handleValidationErrors, searchPubMedEvidence);
router.post('/evidence/clinical-trials', requireAuth, validateClinicalTrialsRequest, handleValidationErrors, searchClinicalTrialsEvidence);
router.post('/evidence/candidate', requireAuth, validateCandidateEvidenceRequest, handleValidationErrors, getCandidateEvidence);

// Browser-facing authenticated proxy. The internal FastAPI token remains server-only.
router.get('/experimental/repurposing/drugs/:drugId/candidates', requireAuth, validateExperimentalDrug, handleValidationErrors, getExperimentalCandidates);
router.get('/experimental/repurposing/drugs/:drugId/candidates/:diseaseId', requireAuth, validateExperimentalCandidate, handleValidationErrors, getExperimentalCandidateDetail);
router.get('/experimental/repurposing/drugs/:drugId/known-indications', requireAuth, validateExperimentalDrug, handleValidationErrors, getExperimentalKnownIndications);
router.post('/experimental/repurposing/evidence', requireAuth, validateExperimentalEvidence, handleValidationErrors, getExperimentalEvidence);

/**
 * @route   GET /api/research/repurpose/status
 * @desc    Get GNN model status from AI engine
 * @access  Private
 */
router.get('/repurpose/status', requireAuth, getRepurposingModelStatus);

/**
 * @route   POST /api/research/repurpose/train
 * @desc    Trigger GNN training pipeline and artifact generation in AI engine
 * @access  Private
 */
router.post('/repurpose/train', requireAuth, requireRole('admin'), trainRepurposingModel);

/**
 * @route   POST /api/research/repurpose/online-update
 * @desc    Apply online KG relation updates and warm retrain the GNN model
 * @access  Private
 */
router.post('/repurpose/online-update', requireAuth, requireRole('admin'), onlineUpdateRepurposingModel);

/**
 * @route   GET /api/research/health
 * @desc    Health check for research service
 * @access  Public
 */
router.get('/health', healthCheck);

/**
 * @route   GET /api/research/:requestId
 * @desc    Get status of a research request
 * @access  Private
 */
router.get('/:requestId', requireAuth, validateRequestId, handleValidationErrors, getResearchStatus);

module.exports = router;
