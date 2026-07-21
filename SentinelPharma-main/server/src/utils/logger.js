/**
 * SentinelPharma Audit Logger
 * ========================
 * Enterprise-grade logging system using Winston.
 * Provides audit trails for compliance and debugging.
 * 
 * Features:
 * - Timestamped log entries
 * - Automatic log directory creation
 * - Separate error and combined log files
 * - Console output for development
 * - JSON formatted logs for production parsing
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Define log directory path (relative to server root)
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

/**
 * Ensures the logs directory exists.
 * Creates it recursively if it doesn't exist.
 */
const ensureLogDirectory = () => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    console.log(`[Logger] Created log directory at: ${LOG_DIR}`);
  }
};

// Initialize log directory
ensureLogDirectory();

/**
 * Custom log format combining timestamp, level, and message.
 * Includes metadata for enhanced debugging.
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let logMessage = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
    
    // Append metadata if present
    if (Object.keys(metadata).length > 0) {
      logMessage += ` | metadata: ${JSON.stringify(metadata)}`;
    }
    
    return logMessage;
  })
);

/**
 * JSON format for production log parsing and analysis.
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Winston Logger Instance
 * 
 * Transports:
 * 1. Console - For real-time monitoring (colorized in development)
 * 2. combined.log - All log levels for comprehensive audit
 * 3. error.log - Error level only for quick issue identification
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  defaultMeta: { 
    service: 'sentinelpharma-server',
    version: '1.0.0'
  },
  transports: [
    // Combined log file - all levels
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB max file size
      maxFiles: 5, // Keep 5 rotated files
      tailable: true
    }),
    
    // Error log file - errors only
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'exceptions.log')
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'rejections.log')
    })
  ]
});

// Add console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      customFormat
    )
  }));
}

/**
 * Audit Logger - Specialized methods for compliance tracking
 */
const auditLog = {
  /**
   * Log research request initiation
   * @param {string} molecule - Drug/molecule being researched
   * @param {string} mode - Processing mode (secure/cloud)
   * @param {string} requestId - Unique request identifier
   */
  researchStarted: (molecule, mode, requestId) => {
    logger.info('Research analysis initiated', {
      event: 'RESEARCH_STARTED',
      molecule,
      mode,
      requestId,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Log processing mode for compliance
   * @param {string} mode - secure or cloud
   * @param {string} requestId - Unique request identifier
   */
  processingMode: (mode, requestId) => {
    const message = mode === 'secure' 
      ? 'Processing in Local Secure Mode' 
      : 'Processing in Public Cloud Mode';
    
    logger.info(message, {
      event: 'PROCESSING_MODE',
      mode,
      requestId,
      privacyLevel: mode === 'secure' ? 'HIGH' : 'STANDARD'
    });
  },

  /**
   * Log agent activity
   * @param {string} agentName - Name of the AI agent
   * @param {string} action - Action performed
   * @param {object} data - Additional data
   */
  agentActivity: (agentName, action, data = {}) => {
    logger.info(`Agent activity: ${agentName}`, {
      event: 'AGENT_ACTIVITY',
      agent: agentName,
      action,
      ...data
    });
  },

  /**
   * Log API response
   * @param {string} requestId - Request identifier
   * @param {number} statusCode - HTTP status code
   * @param {number} duration - Request duration in ms
   */
  apiResponse: (requestId, statusCode, duration) => {
    logger.info('API response sent', {
      event: 'API_RESPONSE',
      requestId,
      statusCode,
      durationMs: duration
    });
  }
};

module.exports = {
  logger,
  auditLog
};
