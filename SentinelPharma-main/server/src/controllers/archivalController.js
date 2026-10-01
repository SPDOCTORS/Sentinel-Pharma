/**
 * SentinelPharma Archival Controller
 * ================================
 * Controller for report history and archival system.
 * Handles CRUD operations, search, stats, and sharing.
 */

const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { ResearchReport, User, AuditLog } = require('../models');
const { logger } = require('../utils/logger');
const PDFDocument = require('pdfkit');
const {
  EVIDENCE_CONTRACT_VERSION,
  normalizeLegacyEvidence,
  summarizeDataModes
} = require('../utils/evidencePolicy');

// Historical records predate the provenance contract. Normalize only the response;
// stored reports remain unchanged for auditability.
const normalizeReportEvidence = (report) => {
  const plain = typeof report?.toObject === 'function' ? report.toObject() : report;
  const citations = Array.isArray(plain?.results?.citations) ? plain.results.citations : [];
  const normalizedCitations = citations.map(normalizeLegacyEvidence);
  const verificationStates = [...new Set(normalizedCitations.map((item) => item.verificationStatus))];
  return {
    ...plain,
    evidence: {
      evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
      citations: normalizedCitations,
      verificationStatus: verificationStates.length === 1
        ? verificationStates[0]
        : (verificationStates.length > 1 ? 'MIXED' : 'NOT_AVAILABLE'),
      dataModes: summarizeDataModes(normalizedCitations)
    }
  };
};

const normalizeSummary = (summary = {}) => ({
  overallAssessment: summary.overallAssessment || summary.overall_assessment || '',
  keyFindings: summary.keyFindings || summary.key_findings || [],
  risks: summary.risks || [],
  opportunities: summary.opportunities || [],
  recommendations: summary.recommendations || summary.recommended_actions || []
});

const normalizeAgentsExecuted = (agents = []) => (
  Array.isArray(agents)
    ? agents.map((agent) => ({
        name: agent.name,
        status: agent.status,
        durationMs: agent.durationMs ?? agent.duration_ms ?? 0
      }))
    : []
);

const resolveMarketSize = (results = {}) => {
  const iqvia = results.iqvia || {};
  const market = results.market || {};

  if (iqvia.global_market_size_usd_bn) {
    return `$${iqvia.global_market_size_usd_bn}B`;
  }

  if (iqvia.market_size && iqvia.market_size.total_market_usd_bn) {
    return `$${iqvia.market_size.total_market_usd_bn}B`;
  }

  if (market.marketSize) {
    return market.marketSize;
  }

  if (market.market_size_billions) {
    return `$${market.market_size_billions}B`;
  }

  return 'N/A';
};

const parseUserObjectId = (req) => {
  const userId = req.user?.id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }
  return new mongoose.Types.ObjectId(userId);
};

const buildReportAccessFilter = (req, extra = {}) => {
  const userObjectId = parseUserObjectId(req);
  if (!userObjectId) {
    return null;
  }
  return {
    ...extra,
    $or: [
      { userId: userObjectId },
      { 'sharedWith.userId': userObjectId }
    ]
  };
};

const buildReportOwnerFilter = (req, extra = {}) => {
  const userObjectId = parseUserObjectId(req);
  if (!userObjectId) {
    return null;
  }
  return {
    ...extra,
    userId: userObjectId
  };
};

/**
 * Save a new research report to the archive
 */
const saveReport = async (req, res) => {
  try {
    const userObjectId = parseUserObjectId(req);
    if (!userObjectId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      requestId,
      molecule,
      query: researchQuery,
      processingMode,
      modelUsed,
      results,
      summary,
      knowledgeGraph,
      agentsExecuted,
      totalProcessingTimeMs
    } = req.body;

    // Check if report already exists
    const existingReport = await ResearchReport.findOne({ requestId });
    if (existingReport) {
      return res.status(409).json({
        success: false,
        error: 'Report with this request ID already exists'
      });
    }

    const report = new ResearchReport({
      requestId,
      userId: userObjectId,
      molecule,
      query: researchQuery,
      processingMode,
      modelUsed,
      results,
      summary: normalizeSummary(summary),
      knowledgeGraph: knowledgeGraph || {},
      agentsExecuted: normalizeAgentsExecuted(agentsExecuted),
      totalProcessingTimeMs: totalProcessingTimeMs ?? results?.total_processing_time_ms,
      status: 'completed',
      pdfGenerated: false
    });

    await report.save();

    // Log the action
    await AuditLog.create({
      userId: userObjectId,
      action: 'REPORT_GENERATED',
      requestId,
      molecule,
      processingMode,
      metadata: { reportId: report._id }
    });

    logger.info('Report saved to archive', {
      reportId: report._id,
      requestId,
      molecule
    });

    res.status(201).json({
      success: true,
      message: 'Report saved successfully',
      data: {
        id: report._id,
        requestId: report.requestId,
        molecule: report.molecule,
        createdAt: report.createdAt
      }
    });

  } catch (error) {
    logger.error('Failed to save report', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to save report'
    });
  }
};

/**
 * Get a specific report by ID
 */
const getReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const accessFilter = buildReportAccessFilter(req, { _id: reportId });
    if (!accessFilter) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    const report = await ResearchReport.findOne(accessFilter);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    res.json({
      success: true,
      data: normalizeReportEvidence(report)
    });

  } catch (error) {
    logger.error('Failed to get report', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve report'
    });
  }
};

/**
 * List all reports with pagination and filtering
 */
const listReports = async (req, res) => {
  try {
    const userObjectId = parseUserObjectId(req);
    if (!userObjectId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    const {
      page = 1,
      limit = 10,
      status,
      molecule,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (molecule) filter.molecule = new RegExp(molecule, 'i');
    
    // Exclude archived by default unless specifically requested
    if (status !== 'archived') {
      filter.status = { $ne: 'archived' };
    }

    // Enforce user isolation: owner or explicitly shared.
    filter.$or = [
      { userId: userObjectId },
      { 'sharedWith.userId': userObjectId }
    ];

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [reports, total] = await Promise.all([
      ResearchReport.find(filter)
        .select('requestId molecule query processingMode status createdAt updatedAt summary.overallAssessment agentsExecuted totalProcessingTimeMs pdfGenerated results.citations')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ResearchReport.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        reports: reports.map(normalizeReportEvidence),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Failed to list reports', { error: error.message });
    const message = (error && error.message) || '';
    const isDbUnavailable =
      message.includes('buffering timed out') ||
      message.includes('ECONNREFUSED') ||
      message.includes('connect ECONNREFUSED') ||
      message.includes('MongoServerSelectionError');

    if (isDbUnavailable) {
      return res.status(200).json({
        success: true,
        degraded: true,
        data: {
          reports: [],
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            pages: 0
          }
        },
        warning: 'Archive database unavailable; returning empty report history'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to list reports'
    });
  }
};

/**
 * Delete a report (soft delete - moves to archived)
 */
const deleteReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const ownerFilter = buildReportOwnerFilter(req, { _id: reportId });
    if (!ownerFilter) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    const report = await ResearchReport.findOneAndUpdate(
      ownerFilter,
      { status: 'archived', updatedAt: new Date() },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // Log the action
    await AuditLog.create({
      userId: parseUserObjectId(req),
      action: 'REPORT_DOWNLOADED', // Using closest available action
      requestId: report.requestId,
      molecule: report.molecule,
      metadata: { action: 'deleted', reportId }
    });

    logger.info('Report deleted (archived)', { reportId });

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    logger.error('Failed to delete report', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete report'
    });
  }
};

/**
 * Full-text search across reports
 */
const searchReports = async (req, res) => {
  try {
    const userObjectId = parseUserObjectId(req);
    if (!userObjectId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    const { q, fields = 'molecule,query,summary' } = req.query;
    const searchFields = fields.split(',');

    // Build search query
    const searchConditions = searchFields.map(field => {
      if (field === 'molecule') {
        return { molecule: new RegExp(q, 'i') };
      }
      if (field === 'query') {
        return { query: new RegExp(q, 'i') };
      }
      if (field === 'summary') {
        return { 'summary.overallAssessment': new RegExp(q, 'i') };
      }
      return null;
    }).filter(Boolean);

    const filter = {
      $or: searchConditions,
      status: { $ne: 'archived' },
      $and: [{
        $or: [
          { userId: userObjectId },
          { 'sharedWith.userId': userObjectId }
        ]
      }]
    };

    const reports = await ResearchReport.find(filter)
      .select('requestId molecule query processingMode status createdAt summary.overallAssessment')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      data: {
        query: q,
        count: reports.length,
        reports
      }
    });

  } catch (error) {
    logger.error('Failed to search reports', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to search reports'
    });
  }
};

/**
 * Get report statistics for dashboard
 */
const getReportStats = async (req, res) => {
  try {
    const userObjectId = parseUserObjectId(req);
    if (!userObjectId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    const visibilityMatch = {
      $or: [
        { userId: userObjectId },
        { 'sharedWith.userId': userObjectId }
      ]
    };

    const [
      totalReports,
      completedReports,
      archivedReports,
      recentReports,
      modeStats,
      topMolecules
    ] = await Promise.all([
      // Total reports
      ResearchReport.countDocuments({ ...visibilityMatch, status: { $ne: 'archived' } }),
      
      // Completed reports
      ResearchReport.countDocuments({ ...visibilityMatch, status: 'completed' }),
      
      // Archived reports
      ResearchReport.countDocuments({ ...visibilityMatch, status: 'archived' }),
      
      // Reports in last 7 days
      ResearchReport.countDocuments({
        ...visibilityMatch,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      
      // Mode breakdown
      ResearchReport.aggregate([
        { $match: { ...visibilityMatch, status: { $ne: 'archived' } } },
        { $group: { _id: '$processingMode', count: { $sum: 1 } } }
      ]),
      
      // Top 5 molecules searched
      ResearchReport.aggregate([
        { $match: { ...visibilityMatch, status: { $ne: 'archived' } } },
        { $group: { _id: '$molecule', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    // Format mode stats
    const modeBreakdown = {};
    modeStats.forEach(m => {
      modeBreakdown[m._id || 'unknown'] = m.count;
    });

    res.json({
      success: true,
      data: {
        totalReports,
        completedReports,
        archivedReports,
        recentReports,
        modeBreakdown,
        topMolecules: topMolecules.map(m => ({
          molecule: m._id,
          count: m.count
        }))
      }
    });

  } catch (error) {
    logger.error('Failed to get report stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
};

/**
 * Archive a report (hide from main list)
 */
const archiveReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const ownerFilter = buildReportOwnerFilter(req, { _id: reportId });
    if (!ownerFilter) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    const report = await ResearchReport.findOneAndUpdate(
      ownerFilter,
      { status: 'archived', updatedAt: new Date() },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    logger.info('Report archived', { reportId });

    res.json({
      success: true,
      message: 'Report archived successfully'
    });

  } catch (error) {
    logger.error('Failed to archive report', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to archive report'
    });
  }
};

/**
 * Restore an archived report
 */
const restoreReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const ownerFilter = buildReportOwnerFilter(req, { _id: reportId });
    if (!ownerFilter) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    const report = await ResearchReport.findOneAndUpdate(
      ownerFilter,
      { status: 'completed', updatedAt: new Date() },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    logger.info('Report restored', { reportId });

    res.json({
      success: true,
      message: 'Report restored successfully'
    });

  } catch (error) {
    logger.error('Failed to restore report', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to restore report'
    });
  }
};

/**
 * Export report as PDF
 */
const exportReportPDF = async (req, res) => {
  try {
    const { reportId } = req.params;
    const accessFilter = buildReportAccessFilter(req, { _id: reportId });
    if (!accessFilter) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    const report = await ResearchReport.findOne(accessFilter);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=SentinelPharma_${report.molecule}_${report.requestId}.pdf`
    );

    // Pipe PDF to response
    doc.pipe(res);

    // Add content
    doc.fontSize(24).text('SentinelPharma Research Report', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(18).text(`Molecule: ${report.molecule}`);
    doc.fontSize(12).text(`Request ID: ${report.requestId}`);
    doc.text(`Date: ${report.createdAt.toISOString()}`);
    doc.text(`Processing Mode: ${report.processingMode}`);
    doc.moveDown();

    // Summary section
    if (report.summary?.overallAssessment) {
      doc.fontSize(16).text('Executive Summary', { underline: true });
      doc.fontSize(12).text(report.summary.overallAssessment);
      doc.moveDown();
    }

    // Key Findings
    if (report.summary?.keyFindings?.length > 0) {
      doc.fontSize(14).text('Key Findings:');
      report.summary.keyFindings.forEach((finding, i) => {
        doc.fontSize(11).text(`${i + 1}. ${finding}`);
      });
      doc.moveDown();
    }

    // Agent Results Summary
    doc.fontSize(16).text('Agent Analysis Results', { underline: true });
    doc.moveDown();

    if (report.results?.clinical) {
      doc.fontSize(14).text('Clinical Trials:');
      doc.fontSize(11).text(`Active Trials: ${report.results.clinical.trials?.length || 0}`);
    }

    if (report.results?.patent) {
      doc.fontSize(14).text('Patent Analysis:');
      doc.fontSize(11).text(`Patents Found: ${report.results.patent.patents?.length || 0}`);
    }

    if (report.results?.market || report.results?.iqvia) {
      doc.fontSize(14).text('Market Analysis:');
      doc.fontSize(11).text(`Market Size: ${resolveMarketSize(report.results)}`);
    }

    doc.moveDown();

    // Footer
    doc.fontSize(10)
      .text('Generated by SentinelPharma AI - Drug Repurposing Intelligence Platform', 
            50, doc.page.height - 50, { align: 'center' });

    // Finalize PDF
    doc.end();

    // Update report to mark PDF as generated
    await ResearchReport.findOneAndUpdate(
      { _id: report._id },
      { pdfGenerated: true }
    );

    // Log the action
    await AuditLog.create({
      userId: parseUserObjectId(req),
      action: 'REPORT_DOWNLOADED',
      requestId: report.requestId,
      molecule: report.molecule,
      metadata: { format: 'pdf' }
    });

  } catch (error) {
    logger.error('Failed to export PDF', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to export PDF'
    });
  }
};

/**
 * Share a report with another user
 */
const shareReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { email, permission = 'view' } = req.body;
    const ownerFilter = buildReportOwnerFilter(req, { _id: reportId });
    if (!ownerFilter) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    // Find the user to share with
    const userToShare = await User.findOne({ email });
    if (!userToShare) {
      return res.status(404).json({
        success: false,
        error: 'User not found with this email'
      });
    }

    const report = await ResearchReport.findOne(ownerFilter);
    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // Check if already shared
    const alreadyShared = report.sharedWith.some(
      share => share.userId.toString() === userToShare._id.toString()
    );

    if (alreadyShared) {
      return res.status(400).json({
        success: false,
        error: 'Report already shared with this user'
      });
    }

    // Add share
    report.sharedWith.push({
      userId: userToShare._id,
      permission
    });
    report.isShared = true;
    await report.save();

    logger.info('Report shared', {
      reportId,
      sharedWith: email,
      permission
    });

    res.json({
      success: true,
      message: `Report shared with ${email}`
    });

  } catch (error) {
    logger.error('Failed to share report', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to share report'
    });
  }
};

/**
 * Remove share access from a user
 */
const unshareReport = async (req, res) => {
  try {
    const { reportId, userId } = req.params;
    const ownerFilter = buildReportOwnerFilter(req, { _id: reportId });
    if (!ownerFilter) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication context'
      });
    }

    const report = await ResearchReport.findOne(ownerFilter);
    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // Remove the share
    report.sharedWith = report.sharedWith.filter(
      share => share.userId.toString() !== userId
    );
    
    // Update isShared flag
    report.isShared = report.sharedWith.length > 0;
    await report.save();

    logger.info('Report unshared', { reportId, userId });

    res.json({
      success: true,
      message: 'Share access removed'
    });

  } catch (error) {
    logger.error('Failed to unshare report', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to remove share access'
    });
  }
};

module.exports = {
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
  unshareReport,
  normalizeReportEvidence
};
