import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Environment variable schema
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("5000").transform(Number),
  HOST: z.string().default("0.0.0.0"),

  // Database Configuration
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Authentication
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRY: z.string().default("7d"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters").optional(),

  // OpenAI Configuration
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4-turbo-preview"),
  OPENAI_MAX_TOKENS: z.string().default("4000").transform(Number),
  OPENAI_TEMPERATURE: z.string().default("0.7").transform(Number),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default("900000").transform(Number), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().default("100").transform(Number),
  AI_RATE_LIMIT_MAX_REQUESTS: z.string().default("10").transform(Number),

  // File Storage
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_FILE_SIZE: z.string().default("10485760").transform(Number), // 10MB

  // Logging
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  LOG_DIR: z.string().default("./logs"),

  // CORS
  CORS_ORIGIN: z.string().default("*"),

  // WebSocket
  WS_PORT: z.string().optional().transform((val) => val ? Number(val) : undefined),

  // Feature Flags
  ENABLE_MOCK_DATA: z.string().default("false").transform((val) => val === "true"),
  ENABLE_DEBUG_ROUTES: z.string().default("false").transform((val) => val === "true"),
});

// Type for validated environment
export type Env = z.infer<typeof envSchema>;

// Validate environment variables
function validateEnv(): Env {
  try {
    const env = envSchema.parse(process.env);

    // Additional validation for production
    if (env.NODE_ENV === "production") {
      if (env.JWT_SECRET === "development-secret-change-in-production") {
        throw new Error("JWT_SECRET must be changed for production");
      }
      if (!env.SESSION_SECRET) {
        throw new Error("SESSION_SECRET is required for production");
      }
      if (env.CORS_ORIGIN === "*") {
        console.warn("WARNING: CORS is set to allow all origins in production");
      }
    }

    // Log successful validation
    console.log(`✅ Environment validated for ${env.NODE_ENV} mode`);

    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment validation failed:");
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });

      // Provide helpful hints for missing variables
      if (error.errors.some(e => e.path[0] === "DATABASE_URL")) {
        console.error("\n💡 Hint: Set DATABASE_URL to your PostgreSQL connection string");
        console.error("   Example: DATABASE_URL=postgresql://user:password@host:5432/database");
      }
      if (error.errors.some(e => e.path[0] === "OPENAI_API_KEY")) {
        console.error("\n💡 Hint: Get your OpenAI API key from https://platform.openai.com/api-keys");
        console.error("   Example: OPENAI_API_KEY=sk-...");
      }
      if (error.errors.some(e => e.path[0] === "JWT_SECRET")) {
        console.error("\n💡 Hint: Generate a secure JWT secret:");
        console.error("   Run: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
      }
    }

    // Exit if validation fails
    process.exit(1);
  }
}

// Export validated config
export const config = validateEnv();

// Helper to check if we're in production
export const isProduction = config.NODE_ENV === "production";

// Helper to check if we're in development
export const isDevelopment = config.NODE_ENV === "development";

// Helper to check if we're in test
export const isTest = config.NODE_ENV === "test";

// Export specific configuration groups for convenience
export const databaseConfig = {
  url: config.DATABASE_URL,
};

export const authConfig = {
  jwtSecret: config.JWT_SECRET,
  jwtExpiry: config.JWT_EXPIRY,
  sessionSecret: config.SESSION_SECRET,
};

export const openAIConfig = {
  apiKey: config.OPENAI_API_KEY,
  model: config.OPENAI_MODEL,
  maxTokens: config.OPENAI_MAX_TOKENS,
  temperature: config.OPENAI_TEMPERATURE,
};

export const rateLimitConfig = {
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
  aiMaxRequests: config.AI_RATE_LIMIT_MAX_REQUESTS,
};

export const serverConfig = {
  port: config.PORT,
  host: config.HOST,
  corsOrigin: config.CORS_ORIGIN,
  wsPort: config.WS_PORT,
};

export const loggingConfig = {
  level: config.LOG_LEVEL,
  dir: config.LOG_DIR,
};

// Function to generate example .env file
export function generateEnvExample(): string {
  return `# Server Configuration
NODE_ENV=development
PORT=5000
HOST=0.0.0.0

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/tyton_orchestrator

# Authentication
JWT_SECRET=${require('crypto').randomBytes(32).toString('hex')}
JWT_EXPIRY=7d
SESSION_SECRET=${require('crypto').randomBytes(32).toString('hex')}

# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_MAX_TOKENS=4000
OPENAI_TEMPERATURE=0.7

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AI_RATE_LIMIT_MAX_REQUESTS=10

# File Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# CORS
CORS_ORIGIN=http://localhost:5000

# WebSocket (optional, uses main port if not specified)
# WS_PORT=3001

# Feature Flags
ENABLE_MOCK_DATA=false
ENABLE_DEBUG_ROUTES=false
`;
}