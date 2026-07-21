/**
 * SentinelPharma Database Models
 * ===========================
 * MongoDB models for users, reports, watchlist.
 * Using Mongoose for ODM.
 */

const mongoose = require('mongoose');

// ======================
// USER MODEL
// ======================

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    default: '',
    lowercase: true,
    trim: true
  },
  mobile: {
    type: String,
    default: '',
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  organization: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['researcher', 'analyst', 'admin', 'viewer'],
    default: 'researcher'
  },
  passwordHash: {
    type: String,
    default: null
  },
  authProvider: {
    type: String,
    enum: ['password', 'otp', 'google'],
    default: 'password'
  },
  avatarUrl: String,
  preferences: {
    defaultMode: {
      type: String,
      enum: ['secure', 'cloud'],
      default: 'cloud'
    },
    emailNotifications: {
      type: Boolean,
      default: true
    },
    notificationFrequency: {
      type: String,
      enum: ['realtime', 'daily', 'weekly'],
      default: 'daily'
    },
    defaultAgents: {
      type: [String],
      default: ['clinical', 'patent', 'iqvia', 'vision']
    }
  },
  apiUsage: {
    totalRequests: { type: Number, default: 0 },
    lastRequest: Date,
    monthlyRequests: { type: Number, default: 0 },
    monthlyResetDate: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Partial indexes allow email-only, mobile-only, and Google users.
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } });
UserSchema.index({ mobile: 1 }, { unique: true, partialFilterExpression: { mobile: { $type: 'string', $gt: '' } } });

// ======================
// RESEARCH REPORT MODEL
// ======================

const ResearchReportSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  molecule: {
    type: String,
    required: true
  },
  query: {
    type: String
  },
  processingMode: {
    type: String,
    enum: ['secure', 'cloud'],
    required: true
  },
  modelUsed: String,
  
  // Agent Results
  results: {
    clinical: {
      type: mongoose.Schema.Types.Mixed
    },
    patent: {
      type: mongoose.Schema.Types.Mixed
    },
    market: {
      type: mongoose.Schema.Types.Mixed
    },
    iqvia: {
      type: mongoose.Schema.Types.Mixed
    },
    exim: {
      type: mongoose.Schema.Types.Mixed
    },
    web_intelligence: {
      type: mongoose.Schema.Types.Mixed
    },
    internal_knowledge: {
      type: mongoose.Schema.Types.Mixed
    },
    regulatory: {
      type: mongoose.Schema.Types.Mixed
    },
    patient_sentiment: {
      type: mongoose.Schema.Types.Mixed
    },
    vision: {
      type: mongoose.Schema.Types.Mixed
    },
    validation: {
      type: mongoose.Schema.Types.Mixed
    },
    kol: {
      type: mongoose.Schema.Types.Mixed
    },
    pathfinder: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  
  // Summary
  summary: {
    overallAssessment: String,
    keyFindings: [String],
    risks: [String],
    opportunities: [String],
    recommendations: [String]
  },
  
  // Knowledge Graph Data
  knowledgeGraph: {
    nodes: { type: Number, default: 0 },
    edges: { type: Number, default: 0 },
    keyPathways: [String]
  },
  
  // Metadata
  agentsExecuted: [{
    name: String,
    status: {
      type: String,
      enum: ['completed', 'failed', 'skipped']
    },
    durationMs: Number
  }],
  totalProcessingTimeMs: Number,
  
  // Report Status
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed', 'archived'],
    default: 'processing'
  },
  
  // PDF Generation
  pdfGenerated: {
    type: Boolean,
    default: false
  },
  pdfUrl: String,
  
  // Sharing
  isShared: {
    type: Boolean,
    default: false
  },
  sharedWith: [{
    userId: mongoose.Schema.Types.ObjectId,
    permission: {
      type: String,
      enum: ['view', 'edit']
    }
  }],
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
}, {
  timestamps: true
});

// Indexes for common queries
ResearchReportSchema.index({ requestId: 1 }, { unique: true });
ResearchReportSchema.index({ userId: 1, createdAt: -1 });
ResearchReportSchema.index({ molecule: 1, createdAt: -1 });

// ======================
// WATCHLIST MODEL
// ======================

const WatchlistItemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  molecule: {
    type: String,
    required: true
  },
  alertTypes: {
    type: [{
      type: String,
      enum: ['new_trials', 'patent_changes', 'new_publications', 'market_updates']
    }],
    default: ['new_trials', 'patent_changes']
  },
  
  // Notification Settings
  emailNotifications: {
    type: Boolean,
    default: true
  },
  notificationEmail: String,
  
  // Status
  status: {
    type: String,
    enum: ['active', 'paused', 'deleted'],
    default: 'active'
  },
  
  // Monitoring Data
  lastChecked: Date,
  nextCheckScheduled: Date,
  checkFrequency: {
    type: String,
    enum: ['hourly', 'daily', 'weekly'],
    default: 'daily'
  },
  
  // Alert History
  recentAlerts: {
    type: Number,
    default: 0
  },
  totalAlerts: {
    type: Number,
    default: 0
  },
  
  // Baseline Data (for comparison)
  baseline: {
    trialsCount: Number,
    patentsCount: Number,
    publicationsCount: Number,
    lastUpdate: Date
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
}, {
  timestamps: true
});

// Compound index for user's watchlist
WatchlistItemSchema.index({ userId: 1, molecule: 1 }, { unique: true });
WatchlistItemSchema.index({ status: 1, nextCheckScheduled: 1 });

// ======================
// ALERT MODEL
// ======================

const AlertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  watchlistItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WatchlistItem',
    required: true
  },
  molecule: {
    type: String,
    required: true
  },
  alertType: {
    type: String,
    enum: ['new_trial', 'patent_change', 'publication', 'market_update'],
    required: true
  },
  
  // Alert Content
  title: {
    type: String,
    required: true
  },
  description: String,
  
  // Source Information
  sourceId: String,  // NCT number, patent ID, PMID, etc.
  sourceUrl: String,
  sourceType: String,
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Status
  isRead: {
    type: Boolean,
    default: false
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  
  // Email Notification
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: Date,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for alert queries
AlertSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
AlertSchema.index({ watchlistItemId: 1, createdAt: -1 });

// ======================
// AUDIT LOG MODEL
// ======================

const AuditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  action: {
    type: String,
    required: true,
    enum: [
      'RESEARCH_STARTED',
      'RESEARCH_COMPLETED',
      'PROCESSING_MODE_SELECTED',
      'AGENT_EXECUTED',
      'REPORT_GENERATED',
      'REPORT_DOWNLOADED',
      'WATCHLIST_ADDED',
      'WATCHLIST_REMOVED',
      'ALERT_CREATED',
      'USER_LOGIN',
      'USER_LOGOUT',
      'SETTINGS_CHANGED',
      'API_ERROR'
    ]
  },
  
  // Request Context
  requestId: String,
  molecule: String,
  processingMode: String,
  
  // Additional Data
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Request Info
  ipAddress: String,
  userAgent: String,
  
  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Index for audit log queries
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });

// ======================
// EXPORT MODELS
// ======================

const User = mongoose.model('User', UserSchema);
const ResearchReport = mongoose.model('ResearchReport', ResearchReportSchema);
const WatchlistItem = mongoose.model('WatchlistItem', WatchlistItemSchema);
const Alert = mongoose.model('Alert', AlertSchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

module.exports = {
  User,
  ResearchReport,
  WatchlistItem,
  Alert,
  AuditLog
};
