# Tyton Orchestrator V0.2.0 - Production Setup Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database (or Neon serverless)
- OpenAI API key

### 1. Environment Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

**Required Environment Variables:**

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Authentication (Generate secure secrets!)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# OpenAI
OPENAI_API_KEY=sk-your-api-key-here
```

### 2. Database Setup

```bash
# Generate migrations
npm run db:generate

# Run migrations
npm run db:migrate

# For development with sample data
ENABLE_MOCK_DATA=true npm run dev
```

### 3. Start the Application

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

## 🔒 Security Configuration

### Authentication
- JWT-based authentication with secure token generation
- Rate limiting on auth endpoints (5 attempts per 15 minutes)
- Password hashing with bcryptjs
- Session management with express-session

### Rate Limiting
- General API: 100 requests per 15 minutes
- AI endpoints: 10 requests per 15 minutes
- Auth endpoints: 5 attempts per 15 minutes
- Project creation: 10 projects per hour

### Environment Security
- All sensitive data stored in environment variables
- Environment validation on startup
- Production-specific security warnings

## 📊 Monitoring & Health Checks

### Health Endpoints
- `GET /api/health/live` - Liveness check
- `GET /api/health/ready` - Readiness check with service status
- `GET /api/metrics` - Performance metrics

### Logging
- Structured JSON logging with multiple levels
- Request/response logging with correlation IDs
- Performance monitoring and slow query detection
- Security event logging
- Log rotation for production

### Monitoring Features
- Database connectivity checks
- OpenAI API health checks
- Memory usage monitoring
- AI usage and cost tracking
- Real-time performance metrics

## 🛠 Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run check            # TypeScript type checking

# Database
npm run db:generate      # Generate migrations
npm run db:migrate       # Run migrations
npm run db:push          # Push schema changes (dev only)
npm run db:studio        # Open Drizzle Studio
npm run db:reset         # Reset database (careful!)

# Production
npm run build            # Build for production
npm start                # Start production server
```

## 🌐 API Authentication

All API endpoints (except auth and health) require authentication:

```bash
# Register a new user
POST /api/auth/register
Content-Type: application/json
{
  "email": "user@example.com",
  "username": "username",
  "password": "password"
}

# Login
POST /api/auth/login
Content-Type: application/json
{
  "email": "user@example.com",
  "password": "password"
}

# Use JWT token in subsequent requests
Authorization: Bearer <jwt-token>
```

## 📋 Production Checklist

### Required Configuration
- [ ] Set secure `JWT_SECRET` (32+ characters)
- [ ] Set secure `SESSION_SECRET` (32+ characters)
- [ ] Configure `DATABASE_URL` with production database
- [ ] Set valid `OPENAI_API_KEY`
- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ORIGIN` for your domain

### Security Hardening
- [ ] Review and adjust rate limits for your use case
- [ ] Set up log monitoring and alerting
- [ ] Configure database connection pooling
- [ ] Set up backup strategy for database
- [ ] Review and test error handling

### Performance Optimization
- [ ] Set up CDN for static assets
- [ ] Configure database connection pooling
- [ ] Set up caching layer (Redis recommended)
- [ ] Monitor AI API usage and costs
- [ ] Set up log aggregation

### Deployment
- [ ] Set up CI/CD pipeline
- [ ] Configure health check endpoints for load balancer
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (nginx/Apache)
- [ ] Set up monitoring and alerting

## 🔧 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment mode |
| `PORT` | No | `5000` | Server port |
| `DATABASE_URL` | **Yes** | - | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | - | JWT signing secret |
| `SESSION_SECRET` | No | - | Session encryption secret |
| `OPENAI_API_KEY` | **Yes** | - | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4-turbo-preview` | OpenAI model to use |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | General rate limit |
| `AI_RATE_LIMIT_MAX_REQUESTS` | No | `10` | AI endpoint rate limit |
| `LOG_LEVEL` | No | `info` | Logging level |
| `CORS_ORIGIN` | No | `*` | CORS allowed origins |
| `ENABLE_MOCK_DATA` | No | `false` | Enable mock data creation |

## 🚨 Troubleshooting

### Database Connection Issues
```bash
# Check database connectivity
npm run db:migrate

# Reset database if needed
npm run db:reset
```

### Authentication Issues
```bash
# Verify JWT secret is set
echo $JWT_SECRET

# Check user creation
npm run db:studio
```

### OpenAI API Issues
```bash
# Test API key
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models
```

### Performance Issues
```bash
# Check metrics endpoint
curl localhost:5000/api/metrics

# Check health status
curl localhost:5000/api/health/ready
```

## 📞 Support

For issues and questions:
1. Check the logs in `./logs/` directory
2. Review health check endpoints
3. Verify environment configuration
4. Check database connectivity

## 🔄 Updates and Migrations

When updating the application:
1. Stop the application
2. Backup the database
3. Pull latest code
4. Run `npm install`
5. Run `npm run db:generate` (if schema changed)
6. Run `npm run db:migrate`
7. Run `npm run build`
8. Start the application

Remember to test in a staging environment first!