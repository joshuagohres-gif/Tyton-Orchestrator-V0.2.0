import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";
import { config } from "./config";
import { logger } from "./logger";

export async function runMigrations() {
  try {
    logger.info("Starting database migrations...");

    const sql = neon(config.DATABASE_URL);
    const db = drizzle(sql);

    await migrate(db, { migrationsFolder: "./migrations" });

    logger.info("✅ Database migrations completed successfully");
  } catch (error) {
    logger.error("❌ Database migration failed", {}, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export async function createMockUser() {
  try {
    logger.info("Creating mock user for development...");

    const sql = neon(config.DATABASE_URL);
    const db = drizzle(sql);

    // Import here to avoid circular dependencies
    const { storage } = await import("./storage");
    const { hashPassword } = await import("./auth");

    // Check if mock user already exists
    const existingUser = await storage.getUserByEmail("demo@example.com");

    if (existingUser) {
      logger.info("Mock user already exists, skipping creation");
      return existingUser;
    }

    // Create mock user
    const hashedPassword = await hashPassword("demo123");
    const mockUser = await storage.createUser({
      email: "demo@example.com",
      username: "demo",
      password: hashedPassword,
    });

    logger.info("✅ Mock user created successfully", {
      id: mockUser.id,
      email: mockUser.email,
      username: mockUser.username,
    });

    return mockUser;
  } catch (error) {
    logger.error("❌ Failed to create mock user", {}, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

// Run migrations if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      if (config.NODE_ENV === "development") {
        return createMockUser();
      }
    })
    .then(() => {
      logger.info("🎉 Database setup completed");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("💥 Database setup failed", {}, error);
      process.exit(1);
    });
}