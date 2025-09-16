import { db } from "./db";
import { logger } from "./logger";
import { config } from "./config";
import OpenAI from "openai";

// Health check status interface
interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  checks: {
    [service: string]: {
      status: "healthy" | "unhealthy";
      responseTime?: number;
      error?: string;
      details?: Record<string, any>;
    };
  };
  overall: {
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu?: {
      usage: number;
    };
  };
}

// Performance metrics interface
interface PerformanceMetrics {
  timestamp: string;
  requests: {
    total: number;
    perSecond: number;
    errors: number;
    errorRate: number;
    averageResponseTime: number;
  };
  ai: {
    requestsCount: number;
    tokensUsed: number;
    totalCost: number;
    averageResponseTime: number;
  };
  database: {
    connectionPool: {
      total: number;
      active: number;
      idle: number;
    };
    averageQueryTime: number;
    slowQueries: number;
  };
}

class MonitoringService {
  private requestMetrics: {
    count: number;
    errors: number;
    totalResponseTime: number;
    lastReset: number;
  } = {
    count: 0,
    errors: 0,
    totalResponseTime: 0,
    lastReset: Date.now(),
  };

  private aiMetrics: {
    requests: number;
    tokens: number;
    cost: number;
    totalResponseTime: number;
  } = {
    requests: 0,
    tokens: 0,
    cost: 0,
    totalResponseTime: 0,
  };

  private dbMetrics: {
    queries: number;
    totalQueryTime: number;
    slowQueries: number;
  } = {
    queries: 0,
    totalQueryTime: 0,
    slowQueries: 0,
  };

  // Health check for database
  async checkDatabase(): Promise<{ status: "healthy" | "unhealthy"; responseTime?: number; error?: string }> {
    const start = Date.now();
    try {
      // Simple query to check database connectivity
      await db.execute("SELECT 1");
      const responseTime = Date.now() - start;

      if (responseTime > 5000) {
        return {
          status: "unhealthy",
          responseTime,
          error: "Database response time too slow",
        };
      }

      return {
        status: "healthy",
        responseTime,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : "Database connection failed",
      };
    }
  }

  // Health check for OpenAI API
  async checkOpenAI(): Promise<{ status: "healthy" | "unhealthy"; responseTime?: number; error?: string }> {
    const start = Date.now();
    try {
      const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

      // Use a minimal request to check API availability
      await openai.models.list();

      const responseTime = Date.now() - start;

      if (responseTime > 10000) {
        return {
          status: "unhealthy",
          responseTime,
          error: "OpenAI API response time too slow",
        };
      }

      return {
        status: "healthy",
        responseTime,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : "OpenAI API connection failed",
      };
    }
  }

  // Check memory usage
  private getMemoryUsage() {
    const usage = process.memoryUsage();
    const total = usage.heapTotal;
    const used = usage.heapUsed;

    return {
      used: Math.round(used / 1024 / 1024), // MB
      total: Math.round(total / 1024 / 1024), // MB
      percentage: Math.round((used / total) * 100),
    };
  }

  // Get process uptime
  private getUptime(): number {
    return Math.round(process.uptime());
  }

  // Comprehensive health check
  async getHealthStatus(): Promise<HealthStatus> {
    const checks: HealthStatus["checks"] = {};

    // Check database
    const dbCheck = await this.checkDatabase();
    checks.database = dbCheck;

    // Check OpenAI (only if API key is configured)
    if (config.OPENAI_API_KEY && config.OPENAI_API_KEY !== "sk-your-api-key-here") {
      const aiCheck = await this.checkOpenAI();
      checks.openai = aiCheck;
    }

    // Check memory usage
    const memory = this.getMemoryUsage();
    if (memory.percentage > 90) {
      checks.memory = {
        status: "unhealthy",
        details: { usage: memory },
        error: "High memory usage",
      };
    } else {
      checks.memory = {
        status: "healthy",
        details: { usage: memory },
      };
    }

    // Determine overall status
    const unhealthyServices = Object.values(checks).filter(check => check.status === "unhealthy");
    const status = unhealthyServices.length === 0 ? "healthy" :
                  unhealthyServices.length <= 1 ? "degraded" : "unhealthy";

    const healthStatus: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      checks,
      overall: {
        uptime: this.getUptime(),
        memory,
      },
    };

    // Log health status if unhealthy
    if (status !== "healthy") {
      logger.healthCheck("overall", status, { checks: Object.keys(checks).filter(key => checks[key].status === "unhealthy") });
    }

    return healthStatus;
  }

  // Simple liveness check
  async getLivenessCheck(): Promise<{ status: "ok"; timestamp: string }> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  // Track API request metrics
  trackRequest(responseTime: number, isError: boolean = false) {
    this.requestMetrics.count++;
    this.requestMetrics.totalResponseTime += responseTime;

    if (isError) {
      this.requestMetrics.errors++;
    }

    // Log slow requests
    if (responseTime > 5000) {
      logger.performance("Slow API request", responseTime);
    }
  }

  // Track AI request metrics
  trackAIRequest(responseTime: number, tokens: number, cost: number) {
    this.aiMetrics.requests++;
    this.aiMetrics.totalResponseTime += responseTime;
    this.aiMetrics.tokens += tokens;
    this.aiMetrics.cost += cost;

    logger.aiRequest("gpt-4", tokens, cost);
  }

  // Track database query metrics
  trackDatabaseQuery(queryTime: number) {
    this.dbMetrics.queries++;
    this.dbMetrics.totalQueryTime += queryTime;

    if (queryTime > 1000) { // Slow query threshold: 1 second
      this.dbMetrics.slowQueries++;
      logger.performance("Slow database query", queryTime);
    }
  }

  // Get performance metrics
  getPerformanceMetrics(): PerformanceMetrics {
    const now = Date.now();
    const timeSinceReset = (now - this.requestMetrics.lastReset) / 1000; // seconds

    const metrics: PerformanceMetrics = {
      timestamp: new Date().toISOString(),
      requests: {
        total: this.requestMetrics.count,
        perSecond: Math.round(this.requestMetrics.count / timeSinceReset),
        errors: this.requestMetrics.errors,
        errorRate: this.requestMetrics.count > 0 ?
                  Math.round((this.requestMetrics.errors / this.requestMetrics.count) * 100) : 0,
        averageResponseTime: this.requestMetrics.count > 0 ?
                           Math.round(this.requestMetrics.totalResponseTime / this.requestMetrics.count) : 0,
      },
      ai: {
        requestsCount: this.aiMetrics.requests,
        tokensUsed: this.aiMetrics.tokens,
        totalCost: Math.round(this.aiMetrics.cost * 100) / 100, // Round to 2 decimal places
        averageResponseTime: this.aiMetrics.requests > 0 ?
                           Math.round(this.aiMetrics.totalResponseTime / this.aiMetrics.requests) : 0,
      },
      database: {
        connectionPool: {
          total: 10, // This would come from actual pool stats
          active: 2, // This would come from actual pool stats
          idle: 8,   // This would come from actual pool stats
        },
        averageQueryTime: this.dbMetrics.queries > 0 ?
                         Math.round(this.dbMetrics.totalQueryTime / this.dbMetrics.queries) : 0,
        slowQueries: this.dbMetrics.slowQueries,
      },
    };

    return metrics;
  }

  // Reset metrics (typically called hourly or daily)
  resetMetrics() {
    this.requestMetrics = {
      count: 0,
      errors: 0,
      totalResponseTime: 0,
      lastReset: Date.now(),
    };

    this.aiMetrics = {
      requests: 0,
      tokens: 0,
      cost: 0,
      totalResponseTime: 0,
    };

    this.dbMetrics = {
      queries: 0,
      totalQueryTime: 0,
      slowQueries: 0,
    };

    logger.info("Performance metrics reset");
  }

  // Alert if metrics exceed thresholds
  checkAlerts() {
    const metrics = this.getPerformanceMetrics();

    // High error rate alert
    if (metrics.requests.errorRate > 10) {
      logger.securityEvent("High error rate detected", "medium", {
        errorRate: metrics.requests.errorRate,
        totalRequests: metrics.requests.total,
      });
    }

    // High AI cost alert
    if (metrics.ai.totalCost > 100) {
      logger.warn("High AI usage cost", {
        totalCost: metrics.ai.totalCost,
        tokensUsed: metrics.ai.tokensUsed,
      });
    }

    // Memory usage alert
    const memory = this.getMemoryUsage();
    if (memory.percentage > 85) {
      logger.warn("High memory usage", {
        usage: memory,
      });
    }
  }
}

// Create global monitoring instance
export const monitoring = new MonitoringService();

// Middleware to track request metrics
export function trackingMiddleware(req: any, res: any, next: any) {
  const start = Date.now();

  res.on("finish", () => {
    const responseTime = Date.now() - start;
    const isError = res.statusCode >= 400;

    monitoring.trackRequest(responseTime, isError);
  });

  next();
}

// Database query tracking wrapper
export function trackDbQuery<T>(queryPromise: Promise<T>): Promise<T> {
  const start = Date.now();

  return queryPromise.finally(() => {
    const queryTime = Date.now() - start;
    monitoring.trackDatabaseQuery(queryTime);
  });
}

// AI request tracking wrapper
export function trackAIRequest<T>(
  requestPromise: Promise<T>,
  estimatedTokens: number = 1000,
  estimatedCost: number = 0.01
): Promise<T> {
  const start = Date.now();

  return requestPromise.finally(() => {
    const responseTime = Date.now() - start;
    monitoring.trackAIRequest(responseTime, estimatedTokens, estimatedCost);
  });
}

// Start monitoring intervals
if (config.NODE_ENV === "production") {
  // Check alerts every 5 minutes
  setInterval(() => {
    monitoring.checkAlerts();
  }, 5 * 60 * 1000);

  // Reset metrics daily
  setInterval(() => {
    monitoring.resetMetrics();
  }, 24 * 60 * 60 * 1000);

  // Log performance metrics every hour
  setInterval(() => {
    const metrics = monitoring.getPerformanceMetrics();
    logger.info("Hourly performance metrics", metrics);
  }, 60 * 60 * 1000);
}

export default monitoring;