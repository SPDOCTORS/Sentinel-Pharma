/**
 * Load Balancer Configuration
 * ===========================
 * Nginx-inspired load balancing for API requests.
 */

const axios = require('axios');

// Backend servers configuration
const BACKEND_SERVERS = [
  process.env.AI_ENGINE_URL || 'http://localhost:8000',
  // Add more backend URLs for load balancing
  // 'http://localhost:8001',
  // 'http://localhost:8002',
];

class LoadBalancer {
  constructor() {
    this.servers = BACKEND_SERVERS;
    this.currentIndex = 0;
    this.serverHealth = new Map();
    this.healthCheckInterval = 30000; // 30 seconds

    // Initialize health status
    this.servers.forEach(server => {
      this.serverHealth.set(server, true);
    });

    // Avoid background timers during tests to prevent open-handle leaks.
    if (process.env.NODE_ENV !== 'test') {
      this.startHealthChecks();
    }
  }

  /**
   * Get next healthy server using round-robin
   * @returns {string} Server URL
   */
  getNextServer() {
    const healthyServers = this.servers.filter(server => this.serverHealth.get(server));

    if (healthyServers.length === 0) {
      throw new Error('No healthy backend servers available');
    }

    const server = healthyServers[this.currentIndex % healthyServers.length];
    this.currentIndex = (this.currentIndex + 1) % healthyServers.length;

    return server;
  }

  /**
   * Health check for a server
   * @param {string} serverUrl - Server URL to check
   * @returns {boolean} True if healthy
   */
  async checkServerHealth(serverUrl) {
    try {
      const response = await axios.get(`${serverUrl}/health`, {
        timeout: 5000 // 5 second timeout
      });
      return response.status === 200;
    } catch (error) {
      console.warn(`Health check failed for ${serverUrl}:`, error.message);
      return false;
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    setInterval(async () => {
      console.log('🔍 Running backend server health checks...');

      for (const server of this.servers) {
        const isHealthy = await this.checkServerHealth(server);
        const wasHealthy = this.serverHealth.get(server);

        this.serverHealth.set(server, isHealthy);

        if (wasHealthy && !isHealthy) {
          console.warn(`❌ Server ${server} is now unhealthy`);
        } else if (!wasHealthy && isHealthy) {
          console.log(`✅ Server ${server} is now healthy`);
        }
      }

      const healthyCount = Array.from(this.serverHealth.values()).filter(Boolean).length;
      console.log(`📊 ${healthyCount}/${this.servers.length} backend servers healthy`);
    }, this.healthCheckInterval);
  }

  /**
   * Make request to backend with load balancing
   * @param {string} path - API path
   * @param {object} options - Request options
   * @returns {Promise} Axios response
   */
  async request(path, options = {}) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const server = this.getNextServer();
        const url = `${server}${path}`;

        console.log(`🔄 Load balanced request to ${url} (attempt ${attempt + 1})`);

        const response = await axios({
          url,
          timeout: 300000, // 5 minutes for AI processing
          ...options
        });

        return response;
      } catch (error) {
        console.warn(`Request failed (attempt ${attempt + 1}):`, error.message);
        lastError = error;

        // Mark server as unhealthy on connection errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          const server = this.servers.find(s => error.config?.url?.startsWith(s));
          if (server) {
            this.serverHealth.set(server, false);
            console.warn(`❌ Marked ${server} as unhealthy due to connection error`);
          }
        }

        // Wait before retry
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get load balancer stats
   * @returns {object} Stats object
   */
  getStats() {
    const healthyServers = this.servers.filter(server => this.serverHealth.get(server));

    return {
      totalServers: this.servers.length,
      healthyServers: healthyServers.length,
      unhealthyServers: this.servers.length - healthyServers.length,
      servers: this.servers.map(server => ({
        url: server,
        healthy: this.serverHealth.get(server)
      }))
    };
  }
}

// Export singleton instance
const loadBalancer = new LoadBalancer();

module.exports = loadBalancer;
