import { Router } from "express";
import passport from "passport";
import { storage } from "./storage";
import { generateToken, hashPassword } from "./auth";
import { insertUserSchema } from "@shared/schema";
import { authRateLimit } from "./rateLimiter";
import { logger } from "./logger";
import type { Request, Response, NextFunction } from "express";

const router = Router();

// Register new user
router.post("/register", authRateLimit, async (req: Request, res: Response) => {
  try {
    // Validate input
    const validation = insertUserSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid input",
        details: validation.error.errors
      });
    }

    const { email, username, password } = validation.data;

    // Check if user already exists
    const existingUserByEmail = await storage.getUserByEmail(email);
    if (existingUserByEmail) {
      logger.authEvent("Registration failed - email exists", undefined, { email });
      return res.status(409).json({ error: "Email already registered" });
    }

    const existingUserByUsername = await storage.getUserByUsername(username);
    if (existingUserByUsername) {
      logger.authEvent("Registration failed - username taken", undefined, { username });
      return res.status(409).json({ error: "Username already taken" });
    }

    // Hash password and create user
    const hashedPassword = await hashPassword(password);
    const user = await storage.createUser({
      email,
      username,
      password: hashedPassword,
    });

    // Generate token
    const { password: _, ...userWithoutPassword } = user;
    const token = generateToken(userWithoutPassword);

    logger.authEvent("User registered", user.id, { email, username });

    res.status(201).json({
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// Login with email and password
router.post("/login", authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    // Rate limiting
    if (!authRateLimiter.check(email)) {
      return res.status(429).json({
        error: "Too many login attempts. Please try again later."
      });
    }

    passport.authenticate("local", { session: false }, (err: any, user: any, info: any) => {
      if (err) {
        return next(err);
      }

      if (!user) {
        return res.status(401).json({
          error: info?.message || "Authentication failed"
        });
      }

      // Reset rate limiter on successful login
      authRateLimiter.reset(email);

      // Generate token
      const token = generateToken(user);

      res.json({
        user,
        token,
      });
    })(req, res, next);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

// Logout (for session-based auth)
router.post("/logout", (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to logout" });
    }
    res.json({ message: "Logged out successfully" });
  });
});

// Get current user
router.get("/me", async (req: Request, res: Response) => {
  // Check for JWT token
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const { verifyToken } = await import("./auth");
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const user = await storage.getUser(decoded.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

// Refresh token
router.post("/refresh", async (req: Request, res: Response) => {
  const { token: oldToken } = req.body;

  if (!oldToken) {
    return res.status(400).json({ error: "Token required" });
  }

  try {
    const { verifyToken } = await import("./auth");
    const decoded = verifyToken(oldToken);

    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const user = await storage.getUser(decoded.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { password: _, ...userWithoutPassword } = user;
    const newToken = generateToken(userWithoutPassword);

    res.json({ token: newToken });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

export default router;