import rateLimit from "express-rate-limit";
import { rateLimitConfig } from "./config";
import { logger } from "./logger";

// General API rate limiter
export const generalRateLimit = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.maxRequests,
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: Math.ceil(rateLimitConfig.windowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.securityEvent("Rate limit exceeded", "medium", {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      path: req.path,
    });

    res.status(429).json({
      error: "Too many requests from this IP, please try again later.",
      retryAfter: Math.ceil(rateLimitConfig.windowMs / 1000),
    });
  },
});

// Strict rate limiter for AI endpoints
export const aiRateLimit = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.aiMaxRequests,
  message: {
    error: "AI request limit exceeded. Please try again later.",
    retryAfter: Math.ceil(rateLimitConfig.windowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.securityEvent("AI rate limit exceeded", "medium", {
      userId: (req as any).user?.id,
      ip: req.ip,
      path: req.path,
    });

    res.status(429).json({
      error: "AI request limit exceeded. Please try again later.",
      retryAfter: Math.ceil(rateLimitConfig.windowMs / 1000),
    });
  },
});

// Auth rate limiter (stricter)
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: {
    error: "Too many authentication attempts, please try again later.",
    retryAfter: 15 * 60, // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res) => {
    logger.securityEvent("Auth rate limit exceeded", "high", {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      email: req.body?.email,
    });

    res.status(429).json({
      error: "Too many authentication attempts, please try again later.",
      retryAfter: 15 * 60,
    });
  },
});

// Project creation rate limiter
export const projectCreationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 projects per hour
  message: {
    error: "Project creation limit exceeded. Please try again later.",
    retryAfter: 60 * 60,
  },
  handler: (req, res) => {
    logger.securityEvent("Project creation rate limit exceeded", "low", {
      userId: (req as any).user?.id,
      ip: req.ip,
    });

    res.status(429).json({
      error: "Project creation limit exceeded. Please try again later.",
      retryAfter: 60 * 60,
    });
  },
});

// File upload rate limiter
export const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 uploads per 15 minutes
  message: {
    error: "Upload limit exceeded. Please try again later.",
    retryAfter: 15 * 60,
  },
});

// Advanced rate limiter with token bucket algorithm
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  consume(tokensRequested: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokensRequested) {
      this.tokens -= tokensRequested;
      return true;
    }

    return false;
  }

  private refill() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// Token bucket rate limiter for AI requests
const aiTokenBuckets = new Map<string, TokenBucket>();

export function createAITokenBucket(userId: string): TokenBucket {
  const bucket = new TokenBucket(10, 1/60); // 10 tokens, refill 1 per minute
  aiTokenBuckets.set(userId, bucket);
  return bucket;
}

export function consumeAITokens(userId: string, tokens: number = 1): boolean {
  let bucket = aiTokenBuckets.get(userId);

  if (!bucket) {
    bucket = createAITokenBucket(userId);
  }

  const consumed = bucket.consume(tokens);

  if (!consumed) {
    logger.securityEvent("AI token bucket exhausted", "medium", {
      userId,
      tokensRequested: tokens,
      tokensAvailable: bucket.getTokens(),
    });
  }

  return consumed;
}

// Middleware factory for custom rate limiting
export function createCustomRateLimit(options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: any) => string;
  condition?: (req: any) => boolean;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: options.message || "Rate limit exceeded",
      retryAfter: Math.ceil(options.windowMs / 1000),
    },
    keyGenerator: options.keyGenerator,
    skip: options.condition ? (req) => !options.condition!(req) : undefined,
    handler: (req, res) => {
      logger.securityEvent("Custom rate limit exceeded", "medium", {
        userId: (req as any).user?.id,
        ip: req.ip,
        path: req.path,
        windowMs: options.windowMs,
        max: options.max,
      });

      res.status(429).json({
        error: options.message || "Rate limit exceeded",
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
  });
}

// Cleanup expired token buckets periodically
setInterval(() => {
  const now = Date.now();
  const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours

  for (const [userId, bucket] of Array.from(aiTokenBuckets.entries())) {
    // Remove buckets that haven't been used in 24 hours
    if ((bucket as any).lastRefill < cutoff) {
      aiTokenBuckets.delete(userId);
    }
  }
}, 60 * 60 * 1000); // Run cleanup every hour