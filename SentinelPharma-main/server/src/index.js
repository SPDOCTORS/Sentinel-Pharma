/**
 * SentinelPharma Server Entry Point
 * ==============================
 * Express.js server orchestrating the SentinelPharma platform.
 * Acts as API gateway between React frontend and Python AI Engine.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');

const { logger } = require('./utils/logger');
const researchRoutes = require('./routes/researchRoutes');
const watchlistRoutes = require('./routes/watchlist');
const archivalRoutes = require('./routes/archivalRoutes');
const authRoutes = require('./routes/authRoutes');
const { attachAuthUser, requireAuth, requireRoles } = require('./middleware/auth');
const { createRateLimiter, dynamicRateLimiter } = require('./utils/rateLimiter');
const { redisClient } = require('./utils/redis');
const { otpStore } = require('./utils/otpStore');
const { metricsMiddleware, metricsEndpoint } = require('./utils/metrics');
const { cacheMiddleware } = require('./middleware/cache');
const loadBalancer = require('./utils/loadBalancer');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;
const isDevelopment = (process.env.NODE_ENV || 'development') === 'development';
const isTest = process.env.NODE_ENV === 'test';

// ======================
// DATABASE CONNECTION
// ======================

const mongoose = require('mongoose');
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/sentinelpharma';

// Connect to MongoDB asynchronously (skip in tests for deterministic unit runs)
if (!isTest) {
  setTimeout(async () => {
    try {
      await mongoose.connect(MONGODB_URL);
      logger.info('Connected to MongoDB', { url: MONGODB_URL });
    } catch (error) {
      logger.error('MongoDB connection error', { error: error.message });
    }
  }, 1000);
}

// Log connection state changes
mongoose.connection.on('connected', () => {
  logger.info('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  logger.error('Mongoose connection error', { error: err.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected from MongoDB');
});

// ======================
// MIDDLEWARE CONFIGURATION
// ======================

// Security headers
// In development, disable Helmet fully to avoid browser-policy interference
// while proxying/serving local module scripts.
if (!isDevelopment) {
  app.use(helmet());
}

// CORS configuration - allow multiple frontend ports for development
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  `http://localhost:${PORT}`,  // Allow server's own origin for static file serving
  `http://127.0.0.1:${PORT}`,  // Allow server's own origin for static file serving
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Attach user from bearer token when available.
app.use(attachAuthUser);

// Response caching middleware (5 minute TTL for API responses)
app.use('/api/', cacheMiddleware(300));

// Metrics middleware
app.use(metricsMiddleware);

// HTTP request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Rate limiting
app.use('/api/', dynamicRateLimiter);

// Metrics endpoint
app.get('/metrics', requireAuth, requireRoles('admin'), metricsEndpoint);

// Load balancer stats endpoint
app.get('/api/load-balancer/stats', requireAuth, requireRoles('admin', 'analyst'), (req, res) => {
  res.json({
    success: true,
    stats: loadBalancer.getStats()
  });
});

// ======================
// API ROUTES
// ======================

// API info endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'sentinelpharma-server',
    message: 'SentinelPharma API Gateway is running',
    endpoints: {
      health: '/health',
      ready: '/ready',
      research: '/api/research',
      auth: '/api/auth',
      repurposingDiscovery: '/api/research/repurpose',
      repurposingTrain: '/api/research/repurpose/train',
      repurposingOnlineUpdate: '/api/research/repurpose/online-update',
      watchlist: '/api/watchlist',
      archive: '/api/archive'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'sentinelpharma-server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Readiness check endpoint - comprehensive dependency health
app.get('/ready', async (req, res) => {
  const otpStatus = otpStore.getStatus();
  const checks = {
    server: true,
    mongodb: false,
    aiEngine: false,
    redis: redisClient.isReady,
    otp: otpStatus.available
  };
  const details = {
    server: { status: 'healthy', message: 'Server is running' },
    mongodb: { status: 'unknown', message: 'Checking...' },
    aiEngine: { status: 'unknown', message: 'Checking...' },
    redis: redisClient.isReady
      ? { status: 'healthy', message: 'Connected' }
      : { status: 'degraded', message: otpStatus.available
        ? 'Cache and distributed token revocation unavailable'
        : 'Cache unavailable; OTP authentication is disabled' },
    otp: otpStatus.available
      ? { status: otpStatus.durable ? 'healthy' : 'degraded', message: `Challenge storage: ${otpStatus.mode}` }
      : { status: 'unhealthy', message: 'Challenge storage unavailable' }
  };

  try {
    // Check MongoDB connection
    const mongoose = require('mongoose');
    const readyState = mongoose.connection.readyState;
    if (readyState === 1) {
      checks.mongodb = true;
      details.mongodb = { status: 'healthy', message: 'Connected to MongoDB' };
    } else if (readyState === 2) {
      details.mongodb = { status: 'connecting', message: 'Connecting to MongoDB...' };
    } else {
      details.mongodb = { status: 'unhealthy', message: `MongoDB disconnected (state: ${readyState})` };
    }
  } catch (error) {
    details.mongodb = { status: 'error', message: `CATCH: MongoDB check failed: ${error.message}` };
  }

  try {
    // Check AI Engine health
    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';
    const response = await axios.get(`${aiEngineUrl}/health`, { timeout: 5000 });
    if (response.status === 200) {
      checks.aiEngine = true;
      details.aiEngine = { status: 'healthy', message: 'AI Engine is responding' };
    } else {
      details.aiEngine = { status: 'unhealthy', message: `AI Engine returned status ${response.status}` };
    }
  } catch (error) {
    details.aiEngine = { status: 'unhealthy', message: `AI Engine unreachable: ${error.message}` };
  }

  // Redis remains a required production dependency. Development may be ready
  // with the explicitly bounded, process-local OTP fallback.
  const localMemoryOtpReady = process.env.NODE_ENV === 'development'
    && otpStatus.mode === 'memory';
  const requiredStorageReady = checks.redis || localMemoryOtpReady;
  const allHealthy = checks.server && checks.mongodb && checks.aiEngine && requiredStorageReady;
  const status = allHealthy ? 'ready' : 'not-ready';

  res.status(allHealthy ? 200 : 503).json({
    status,
    service: 'sentinelpharma-server',
    timestamp: new Date().toISOString(),
    checks,
    details,
    message: allHealthy && checks.redis
      ? 'All dependencies healthy'
      : allHealthy
        ? 'Required local dependencies healthy; Redis-dependent features are degraded'
        : 'Some required dependencies are unhealthy',
    version: '1.1'
  });
});

// Research API routes
app.use('/api/research', researchRoutes);

// Auth API routes
app.use('/api/auth', authRoutes);

// Watchlist API routes
app.use('/api/watchlist', watchlistRoutes);

// Archival/Report History API routes
app.use('/api/archive', archivalRoutes);

// ======================
// FRONTEND HOSTING
// ======================

const clientDistPath = path.resolve(__dirname, '../../client/dist');
const indexHtmlPath = path.join(clientDistPath, 'index.html');
const useViteProxy = isDevelopment && process.env.USE_VITE_PROXY === 'true';

if (useViteProxy) {
  // Optional dev mode: proxy non-API traffic to Vite server for HMR.
  app.use('/', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }
    return createProxyMiddleware({
      target: process.env.CLIENT_DEV_URL || 'http://localhost:5173',
      changeOrigin: true,
      ws: true
    })(req, res, next);
  });
} else if (fs.existsSync(clientDistPath)) {
  // Default mode: serve built frontend assets directly from backend host.
  app.use(express.static(clientDistPath, { index: false }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/ready') {
      return next();
    }
    try {
      const html = fs.readFileSync(indexHtmlPath, 'utf8').replace(/\s+crossorigin/g, '');
      return res.status(200).type('html').send(html);
    } catch (error) {
      logger.error('Failed to read client index.html', { error: error.message });
      return res.sendFile(indexHtmlPath);
    }
  });
} else if (isDevelopment) {
  // If dist is missing during development, fall back to Vite proxy.
  app.use('/', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }
    return createProxyMiddleware({
      target: process.env.CLIENT_DEV_URL || 'http://localhost:5173',
      changeOrigin: true,
      ws: true
    })(req, res, next);
  });
}

// ======================
// ERROR HANDLING
// ======================

// 404 handler
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// ======================
// SERVER STARTUP
// ======================

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`🚀 SentinelPharma Server running on port ${PORT}`);
    logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔗 AI Engine URL: ${process.env.AI_ENGINE_URL || 'http://localhost:8000'}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
}

module.exports = app;
