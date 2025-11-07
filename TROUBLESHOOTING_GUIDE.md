# Troubleshooting Guide: Project Generation and Workspace Access Issues

## Issues Identified

### 1. Missing .env File ✅ FIXED
**Problem**: The application requires a `.env` file but only `.env.development` existed.

**Solution**: Created `.env` file from `.env.development` template.

```bash
cp .env.development .env
```

### 2. Database Connection Not Configured ⚠️ REQUIRES ACTION
**Problem**: The `DATABASE_URL` in `.env` points to `postgresql://localhost:5432/tyton_dev` which doesn't exist in this environment.

**Error Message**:
```
Error: DATABASE_URL must be set. Did you forget to provision a database?
```

**Solutions** (Choose one):

#### Option A: Use a Hosted Database (Recommended for Development)
Set up a free Neon PostgreSQL database:
1. Go to https://neon.tech
2. Create a free account
3. Create a new database
4. Copy the connection string
5. Update `.env`:
```bash
DATABASE_URL=postgresql://user:password@ep-xxx.neon.tech/tyton_orchestrator?sslmode=require
```

#### Option B: Use Local PostgreSQL
1. Install PostgreSQL locally
2. Create a database:
```bash
createdb tyton_dev
```
3. Update `.env`:
```bash
DATABASE_URL=postgresql://localhost:5432/tyton_dev
```

#### Option C: Quick Development Fix (Temporary)
For quick testing, you can use an environment variable to point to an existing database:
```bash
export DATABASE_URL="postgresql://your_connection_string_here"
```

### 3. Missing Authentication in Frontend ⚠️ CRITICAL ISSUE
**Problem**: 
- The frontend has no login page or authentication flow
- All project endpoints require JWT authentication (`authenticateJWT`)
- The frontend sends requests with `credentials: include` but doesn't include JWT tokens in the Authorization header
- This prevents users from creating projects or entering the orchestration workspace

**Impact**: 
- Users cannot create new projects (POST /api/projects requires authentication)
- Users cannot access projects (GET /api/projects requires authentication)
- Orchestration cannot be started (requires authentication)

**Current State**:
- Backend has auth routes (`/api/auth/login`, `/api/auth/register`)
- Frontend has NO login page or auth state management
- Mock user is created in development but frontend doesn't auto-login

**Solutions** (Choose one):

#### Option A: Add Development Authentication Bypass (Quick Fix)
Modify the authentication middleware to bypass auth in development mode when ENABLE_MOCK_DATA is true.

**Implementation**: Update `server/auth.ts`:

```typescript
// Middleware to check if user is authenticated via JWT
export function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  // Development bypass: Auto-authenticate with mock user
  if (config.ENABLE_MOCK_DATA && config.NODE_ENV === 'development') {
    (req as any).user = {
      id: '550e8400-e29b-41d4-a716-446655440000', // Mock user ID
      email: 'demo@example.com',
      username: 'demo'
    };
    return next();
  }

  const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  (req as any).user = decoded;
  next();
}
```

#### Option B: Add Login Page to Frontend (Proper Solution)
Create a proper authentication flow:

1. **Add Login/Register Pages** (`client/src/pages/login.tsx`):
```tsx
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();

  const handleLogin = async () => {
    try {
      const response = await apiRequest("POST", "/api/auth/login", {
        email,
        password,
      });
      const data = await response.json();
      
      // Store token
      localStorage.setItem("auth_token", data.token);
      
      // Redirect to home
      setLocation("/");
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-4">
        <h1 className="text-2xl font-bold">Login to Tyton</h1>
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button onClick={handleLogin}>Login</Button>
      </div>
    </div>
  );
}
```

2. **Update API Request Function** to include JWT token (`client/src/lib/queryClient.ts`):
```typescript
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = localStorage.getItem("auth_token");
  
  const headers: HeadersInit = data ? { "Content-Type": "application/json" } : {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}
```

3. **Add Route Protection** (`client/src/App.tsx`):
```tsx
// Add authentication check
const useAuth = () => {
  const token = localStorage.getItem("auth_token");
  return !!token;
};

// Protect routes
function ProtectedRoute({ component: Component, ...rest }: any) {
  const isAuth = useAuth();
  if (!isAuth) {
    return <Redirect to="/login" />;
  }
  return <Component {...rest} />;
}
```

#### Option C: Use optionalAuth Instead (Temporary Fix)
Change the routes to use `optionalAuth` instead of `authenticateJWT` in development:

In `server/routes.ts`, update critical endpoints:
```typescript
// Projects - Use optionalAuth in development
const authMiddleware = config.ENABLE_MOCK_DATA ? optionalAuth : authenticateJWT;
app.get("/api/projects", authMiddleware, async (req: any, res) => {
  // ... existing code
});
```

### 4. Missing OpenAI API Key
**Problem**: `OPENAI_API_KEY` is set to placeholder value.

**Impact**: AI orchestration features won't work.

**Solution**: Update `.env`:
```bash
OPENAI_API_KEY=sk-your-actual-api-key-here
```

Get your key from: https://platform.openai.com/api-keys

### 5. Environment Variables Not Validated
**Problem**: The app fails immediately if required environment variables are missing.

**Solution**: Ensure all required variables are set in `.env`:
```bash
# Required for app to start
DATABASE_URL=postgresql://...
JWT_SECRET=development-jwt-secret-change-in-production-32chars
OPENAI_API_KEY=sk-...

# Optional for development
ENABLE_MOCK_DATA=true
ENABLE_DEBUG_ROUTES=true
```

## Quick Start for Development

### Minimum Setup to Get Running:

1. **Create .env file** (already done):
```bash
cp .env.development .env
```

2. **Set up database** (choose one):
   - Use Neon (free): https://neon.tech
   - OR use local PostgreSQL: `createdb tyton_dev`

3. **Update .env with database URL**:
```bash
DATABASE_URL=postgresql://your-connection-string-here
```

4. **Apply authentication fix** (Option A recommended for quick testing):
   - Edit `server/auth.ts` to add development bypass (see Option A above)

5. **Add OpenAI API key** (optional for testing, required for AI features):
```bash
OPENAI_API_KEY=sk-your-key-here
```

6. **Install dependencies and run**:
```bash
npm install
npm run dev
```

## Testing the Fixes

### Test Project Creation:
```bash
# With authentication bypass enabled
curl -X POST http://localhost:5000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Project", "description": "Testing project creation"}'
```

### Test Orchestration Start:
```bash
curl -X POST http://localhost:5000/api/projects/[PROJECT_ID]/orchestrator/start \
  -H "Content-Type: application/json" \
  -d '{"userBrief": "Create a smart home sensor"}'
```

## Next Steps

1. ✅ Fix .env configuration
2. ⚠️ Set up database connection
3. ⚠️ Implement authentication bypass or login page
4. ✅ Add OpenAI API key
5. 🧪 Test project creation
6. 🧪 Test orchestration workspace access

## Related Files

- Configuration: `server/config.ts`, `.env`
- Authentication: `server/auth.ts`, `server/authRoutes.ts`
- Database: `server/db.ts`, `server/storage.ts`
- Frontend API: `client/src/lib/queryClient.ts`
- Routes: `server/routes.ts`

## Support

For additional help, check:
- Architecture docs: `ARCHITECTURE_DOCUMENTATION.md`
- Implementation summary: `IMPLEMENTATION_SUMMARY.md`
- Hardware design guide: `HARDWARE_DESIGN_QUICKSTART.md`
