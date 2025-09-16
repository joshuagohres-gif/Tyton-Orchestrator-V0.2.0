import { logger } from "./logger";
import { config } from "./config";
import { runMigrations, createMockUser } from "./migrate";

export async function initializeApplication() {
  logger.info("🚀 Starting Tyton Orchestrator application initialization...");

  try {
    // 1. Run database migrations
    logger.info("📊 Running database migrations...");
    await runMigrations();

    // 2. Create mock user in development
    if (config.NODE_ENV === "development" && config.ENABLE_MOCK_DATA) {
      logger.info("👤 Creating mock user for development...");
      await createMockUser();
    }

    // 3. Seed components in development
    if (config.NODE_ENV === "development") {
      try {
        logger.info("🔧 Seeding component library...");
        const { seedComponents } = await import("./seedComponents");
        await seedComponents();
        logger.info("✅ Component library seeded");
      } catch (error) {
        logger.warn("⚠️ Failed to seed components (this is ok if already seeded)", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // 4. Log startup configuration
    logger.info("⚙️ Application configuration:", {
      nodeEnv: config.NODE_ENV,
      port: config.PORT,
      logLevel: config.LOG_LEVEL,
      enableMockData: config.ENABLE_MOCK_DATA,
      enableDebugRoutes: config.ENABLE_DEBUG_ROUTES,
      databaseConfigured: !!config.DATABASE_URL,
      openaiConfigured: config.OPENAI_API_KEY !== "sk-your-api-key-here",
    });

    logger.info("✅ Application initialization completed successfully");

    return true;
  } catch (error) {
    logger.error("💥 Application initialization failed", {}, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export async function gracefulShutdown(signal: string) {
  logger.info(`📴 Received ${signal}, starting graceful shutdown...`);

  try {
    // Close database connections
    // Close WebSocket connections
    // Cancel ongoing operations
    // etc.

    logger.info("✅ Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Error during shutdown", {}, error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("💥 Uncaught Exception", {}, error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("💥 Unhandled Rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    promise: String(promise),
  }, reason instanceof Error ? reason : new Error(String(reason)));
  process.exit(1);
});