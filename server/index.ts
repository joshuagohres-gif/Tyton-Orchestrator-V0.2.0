import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { config, serverConfig } from "./config";
import passport from "./auth";
import { logger, requestIdMiddleware, requestLogMiddleware, errorLogMiddleware } from "./logger";
import { generalRateLimit } from "./rateLimiter";
import { initializeApplication } from "./startup";

const app = express();

// Trust proxy for rate limiting
app.set("trust proxy", 1);

// Request ID and logging middleware
app.use(requestIdMiddleware);
app.use(requestLogMiddleware);

// Rate limiting
app.use("/api", generalRateLimit);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize Passport
app.use(passport.initialize());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Initialize application (migrations, seeding, etc.)
    await initializeApplication();

    const server = await registerRoutes(app);

    // Error logging middleware
    app.use(errorLogMiddleware);

    // Global error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      logger.error("Unhandled server error", {
        status,
        message,
        stack: err.stack,
      }, err);

      res.status(status).json({
        error: config.NODE_ENV === "production" ? "Internal Server Error" : message
      });
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (config.NODE_ENV === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Use configuration from validated environment
    server.listen({
      port: serverConfig.port,
      host: serverConfig.host,
      reusePort: true,
    }, () => {
      logger.info(`🚀 Server running in ${config.NODE_ENV} mode on port ${serverConfig.port}`);
      if (config.ENABLE_MOCK_DATA) {
        logger.warn("⚠️  Mock data mode enabled");
      }
    });
  } catch (error) {
    logger.error("💥 Failed to start server", {}, error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
})();
