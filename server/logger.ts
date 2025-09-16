import fs from "fs";
import path from "path";
import { loggingConfig, config } from "./config";

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

// Log entry interface
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: Record<string, any>;
  userId?: string;
  requestId?: string;
  stack?: string;
}

class Logger {
  private logLevel: LogLevel;
  private logDir: string;

  constructor() {
    this.logLevel = this.getLogLevel(loggingConfig.level);
    this.logDir = loggingConfig.dir;
    this.ensureLogDirectory();
  }

  private getLogLevel(level: string): LogLevel {
    switch (level) {
      case "error": return LogLevel.ERROR;
      case "warn": return LogLevel.WARN;
      case "info": return LogLevel.INFO;
      case "debug": return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  private ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatLogEntry(level: string, message: string, meta?: Record<string, any>, stack?: string): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
      stack,
      requestId: this.getCurrentRequestId(),
      userId: this.getCurrentUserId(),
    };
  }

  private getCurrentRequestId(): string | undefined {
    // This would be set by middleware in production
    return (global as any).__REQUEST_ID__;
  }

  private getCurrentUserId(): string | undefined {
    // This would be set by auth middleware
    return (global as any).__USER_ID__;
  }

  private writeToFile(entry: LogEntry) {
    const filename = this.getLogFilename(entry.level);
    const logLine = JSON.stringify(entry) + "\n";

    try {
      fs.appendFileSync(path.join(this.logDir, filename), logLine);
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }

  private getLogFilename(level: string): string {
    const date = new Date().toISOString().split("T")[0];
    return `${level}-${date}.log`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private log(level: LogLevel, levelName: string, message: string, meta?: Record<string, any>, error?: Error) {
    if (!this.shouldLog(level)) return;

    const entry = this.formatLogEntry(levelName, message, meta, error?.stack);

    // Console output with colors
    const timestamp = new Date().toLocaleTimeString();
    const coloredLevel = this.colorizeLevel(levelName);
    console.log(`[${timestamp}] ${coloredLevel} ${message}`);

    if (meta && Object.keys(meta).length > 0) {
      console.log("  Meta:", JSON.stringify(meta, null, 2));
    }

    if (error?.stack) {
      console.log("  Stack:", error.stack);
    }

    // Write to file
    this.writeToFile(entry);
  }

  private colorizeLevel(level: string): string {
    const colors = {
      ERROR: "\x1b[31m",  // Red
      WARN: "\x1b[33m",   // Yellow
      INFO: "\x1b[36m",   // Cyan
      DEBUG: "\x1b[90m",  // Gray
    };
    const reset = "\x1b[0m";
    const color = colors[level as keyof typeof colors] || "";
    return `${color}${level}${reset}`;
  }

  error(message: string, meta?: Record<string, any>, error?: Error) {
    this.log(LogLevel.ERROR, "ERROR", message, meta, error);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.log(LogLevel.WARN, "WARN", message, meta);
  }

  info(message: string, meta?: Record<string, any>) {
    this.log(LogLevel.INFO, "INFO", message, meta);
  }

  debug(message: string, meta?: Record<string, any>) {
    this.log(LogLevel.DEBUG, "DEBUG", message, meta);
  }

  // Specialized logging methods
  authEvent(event: string, userId?: string, meta?: Record<string, any>) {
    this.info(`Auth: ${event}`, { ...meta, userId, category: "auth" });
  }

  apiRequest(method: string, path: string, statusCode: number, duration: number, userId?: string) {
    this.info(`API: ${method} ${path}`, {
      method,
      path,
      statusCode,
      duration,
      userId,
      category: "api",
    });
  }

  aiRequest(model: string, tokens: number, cost: number, userId?: string, meta?: Record<string, any>) {
    this.info("AI request completed", {
      model,
      tokens,
      cost,
      userId,
      category: "ai",
      ...meta,
    });
  }

  orchestrationEvent(event: string, runId: string, projectId: string, meta?: Record<string, any>) {
    this.info(`Orchestration: ${event}`, {
      runId,
      projectId,
      category: "orchestration",
      ...meta,
    });
  }

  databaseEvent(operation: string, table: string, duration: number, meta?: Record<string, any>) {
    this.debug(`DB: ${operation} on ${table}`, {
      operation,
      table,
      duration,
      category: "database",
      ...meta,
    });
  }

  securityEvent(event: string, severity: "low" | "medium" | "high", meta?: Record<string, any>) {
    const logLevel = severity === "high" ? this.error.bind(this) :
                    severity === "medium" ? this.warn.bind(this) :
                    this.info.bind(this);

    logLevel(`Security: ${event}`, {
      severity,
      category: "security",
      ...meta,
    });
  }

  // Performance tracking
  performance(operation: string, duration: number, meta?: Record<string, any>) {
    const level = duration > 5000 ? "WARN" : "INFO";
    this.log(
      duration > 5000 ? LogLevel.WARN : LogLevel.INFO,
      level,
      `Performance: ${operation} took ${duration}ms`,
      { operation, duration, category: "performance", ...meta }
    );
  }

  // Health check logging
  healthCheck(service: string, status: "healthy" | "unhealthy", meta?: Record<string, any>) {
    const logMethod = status === "healthy" ? this.info.bind(this) : this.error.bind(this);
    logMethod(`Health: ${service} is ${status}`, {
      service,
      status,
      category: "health",
      ...meta,
    });
  }
}

// Create global logger instance
export const logger = new Logger();

// Request ID middleware
export function requestIdMiddleware(req: any, res: any, next: any) {
  const requestId = require("crypto").randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  // Set global request ID for logging
  (global as any).__REQUEST_ID__ = requestId;

  next();
}

// User ID middleware (after authentication)
export function userIdMiddleware(req: any, res: any, next: any) {
  if (req.user?.id) {
    (global as any).__USER_ID__ = req.user.id;
  }
  next();
}

// Request logging middleware
export function requestLogMiddleware(req: any, res: any, next: any) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const userId = req.user?.id;

    logger.apiRequest(req.method, req.path, res.statusCode, duration, userId);

    // Clear global context
    delete (global as any).__REQUEST_ID__;
    delete (global as any).__USER_ID__;
  });

  next();
}

// Error logging middleware
export function errorLogMiddleware(err: any, req: any, res: any, next: any) {
  const userId = req.user?.id;
  const requestId = req.requestId;

  logger.error("Unhandled error", {
    path: req.path,
    method: req.method,
    userId,
    requestId,
    body: req.body,
    query: req.query,
    userAgent: req.get("User-Agent"),
  }, err);

  next(err);
}

// Log rotation (simple implementation)
export function rotateLogsDaily() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateStr = yesterday.toISOString().split("T")[0];

  ["error", "warn", "info", "debug"].forEach(level => {
    const filename = `${level}-${dateStr}.log`;
    const filepath = path.join(loggingConfig.dir, filename);

    if (fs.existsSync(filepath)) {
      const archivePath = path.join(loggingConfig.dir, "archive", filename);
      fs.mkdirSync(path.dirname(archivePath), { recursive: true });
      fs.renameSync(filepath, archivePath);
    }
  });
}

// Initialize log rotation
if (config.NODE_ENV === "production") {
  setInterval(rotateLogsDaily, 24 * 60 * 60 * 1000); // Daily rotation
}

export default logger;