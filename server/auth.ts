import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { authConfig } from "./config";
import type { User } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";

// Configure Passport Local Strategy
passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email);

        if (!user) {
          return done(null, false, { message: "Invalid email or password" });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
          return done(null, false, { message: "Invalid email or password" });
        }

        // Don't return password in user object
        const { password: _, ...userWithoutPassword } = user;
        return done(null, userWithoutPassword);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    if (user) {
      const { password: _, ...userWithoutPassword } = user;
      done(null, userWithoutPassword);
    } else {
      done(null, false);
    }
  } catch (error) {
    done(error);
  }
});

// Generate JWT token
export function generateToken(user: Omit<User, "password">): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
    },
    authConfig.jwtSecret,
    { expiresIn: authConfig.jwtExpiry }
  );
}

// Verify JWT token
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, authConfig.jwtSecret);
  } catch (error) {
    return null;
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Middleware to check if user is authenticated via JWT
export function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = decoded;
  next();
}

// Middleware to check if user is authenticated via session
export function authenticateSession(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
}

// Optional authentication - continues even if not authenticated
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }

  next();
}

// Rate limiting configuration for auth endpoints
export const authRateLimiter = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 5, // 5 attempts per window
  storage: new Map<string, { attempts: number; resetTime: number }>(),

  check(identifier: string): boolean {
    const now = Date.now();
    const record = this.storage.get(identifier);

    if (!record || now > record.resetTime) {
      this.storage.set(identifier, {
        attempts: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    if (record.attempts >= this.maxAttempts) {
      return false;
    }

    record.attempts++;
    return true;
  },

  reset(identifier: string) {
    this.storage.delete(identifier);
  },
};

export default passport;