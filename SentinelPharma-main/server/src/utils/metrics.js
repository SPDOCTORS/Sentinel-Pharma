/**
 * Prometheus Metrics for SentinelPharma Server
 */
const promClient = require('prom-client');

// Create a Registry which registers the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'sentinelpharma-server'
});

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Create custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const activeRequests = new promClient.Gauge({
  name: 'http_active_requests',
  help: 'Number of active HTTP requests'
});

const researchRequestsTotal = new promClient.Counter({
  name: 'research_requests_total',
  help: 'Total number of research requests',
  labelNames: ['status', 'agent_count']
});

const authFailuresTotal = new promClient.Counter({
  name: 'auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['reason']
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(activeRequests);
register.registerMetric(researchRequestsTotal);
register.registerMetric(authFailuresTotal);

// Middleware to track HTTP request metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  activeRequests.inc();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    activeRequests.dec();

    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });

  next();
};

// Metrics endpoint
const metricsEndpoint = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (ex) {
    res.status(500).end(ex);
  }
};

module.exports = {
  register,
  httpRequestDuration,
  activeRequests,
  researchRequestsTotal,
  authFailuresTotal,
  metricsMiddleware,
  metricsEndpoint
};