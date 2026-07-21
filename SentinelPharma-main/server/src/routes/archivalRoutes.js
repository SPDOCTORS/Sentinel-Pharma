/**
 * SentinelPharma Archival Routes
 * ===========================
 * API routes for report history and archival system.
 * Supports save, retrieve, list, and delete operations.
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');

const {
  saveReport,
  getReport,
  listReports,
  deleteReport,
  searchReports,
  getReportStats,
  archiveReport,
  restoreReport,
  exportReportPDF,
  shareReport,
  unshareReport
} = require('../controllers/archivalController');

/**
 * Validation middleware
 */
const validateReportId = [
  param('reportId')
    .isMongoId()
    .withMessage('Invalid report ID format')
];

const validateSaveReport = [
  body('requestId')
    .notEmpty()
    .withMessage('Request ID is required'),
  body('molecule')
    .trim()
    .notEmpty()
    .withMessage('Molecule name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Molecule name must be between 2 and 200 characters'),
  body('results')
    .isObject()
    .withMessage('Results must be an object'),
  body('processingMode')
    .isIn(['secure', 'cloud'])
    .withMessage('Processing mode must be either "secure" or "cloud"')
];

const validateListQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['processing', 'completed', 'failed', 'archived'])
    .withMessage('Invalid status value'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'molecule', 'status', 'updatedAt'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be "asc" or "desc"')
];

const validateSearch = [
  query('q')
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 2 })
    .withMessage('Search query must be at least 2 characters'),
  query('fields')
    .optional()
    .isString()
    .withMessage('Fields must be a comma-separated string')
];

const validateShare = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('permission')
    .optional()
    .isIn(['view', 'edit'])
    .withMessage('Permission must be "view" or "edit"')
];

// ======================
// REPORT CRUD OPERATIONS
// ======================

/**
 * @route   POST /api/archive/reports
 * @desc    Save a new research report
 * @access  Private
 */
router.post('/reports', requireAuth, validateSaveReport, handleValidationErrors, saveReport);

/**
 * @route   GET /api/archive/reports
 * @desc    List all reports with pagination and filtering
 * @access  Private
 */
router.get('/reports', requireAuth, validateListQuery, handleValidationErrors, listReports);

/**
 * @route   GET /api/archive/reports/search
 * @desc    Full-text search across reports
 * @access  Private
 */
router.get('/reports/search', requireAuth, validateSearch, handleValidationErrors, searchReports);

/**
 * @route   GET /api/archive/reports/stats
 * @desc    Get report statistics for dashboard
 * @access  Private
 */
router.get('/reports/stats', requireAuth, getReportStats);

/**
 * @route   GET /api/archive/reports/:reportId
 * @desc    Get a specific report by ID
 * @access  Private
 */
router.get('/reports/:reportId', requireAuth, validateReportId, handleValidationErrors, getReport);

/**
 * @route   DELETE /api/archive/reports/:reportId
 * @desc    Delete a report (soft delete - moves to archived)
 * @access  Private
 */
router.delete('/reports/:reportId', requireAuth, validateReportId, handleValidationErrors, deleteReport);

// ======================
// ARCHIVE OPERATIONS
// ======================

/**
 * @route   PUT /api/archive/reports/:reportId/archive
 * @desc    Archive a report (hide from main list)
 * @access  Private
 */
router.put('/reports/:reportId/archive', requireAuth, validateReportId, handleValidationErrors, archiveReport);

/**
 * @route   PUT /api/archive/reports/:reportId/restore
 * @desc    Restore an archived report
 * @access  Private
 */
router.put('/reports/:reportId/restore', requireAuth, validateReportId, handleValidationErrors, restoreReport);

// ======================
// EXPORT OPERATIONS
// ======================

/**
 * @route   GET /api/archive/reports/:reportId/pdf
 * @desc    Export report as PDF
 * @access  Private
 */
router.get('/reports/:reportId/pdf', requireAuth, validateReportId, handleValidationErrors, exportReportPDF);

// ======================
// SHARING OPERATIONS
// ======================

/**
 * @route   POST /api/archive/reports/:reportId/share
 * @desc    Share a report with another user
 * @access  Private
 */
router.post('/reports/:reportId/share', requireAuth, [...validateReportId, ...validateShare], handleValidationErrors, shareReport);

/**
 * @route   DELETE /api/archive/reports/:reportId/share/:userId
 * @desc    Remove share access from a user
 * @access  Private
 */
router.delete('/reports/:reportId/share/:userId', requireAuth, validateReportId, handleValidationErrors, unshareReport);

module.exports = router;
