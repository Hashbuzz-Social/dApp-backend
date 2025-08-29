# HashBuzz dApp Backend

> A comprehensive Node.js/Express.js backend service for HashBuzz social media campaign platform with Hedera Hashgraph integration.

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)
![Express.js](https://img.shields.io/badge/Express.js-4.18+-orange.svg)
![Prisma](https://img.shields.io/badge/Prisma-5.0+-2D3748.svg)
![Hedera](https://img.shields.io/badge/Hedera-Hashgraph-purple.svg)

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [🏗️ Architecture Overview](#️-architecture-overview)
- [🛠️ Tech Stack](#️-tech-stack)
- [📂 Project Structure](#-project-structure)
- [⚙️ Environment Setup](#️-environment-setup)
- [🗄️ Database Configuration](#️-database-configuration)
- [🔧 Development Guidelines](#-development-guidelines)
- [📝 API Documentation](#-api-documentation)
- [🧪 Testing](#-testing)
- [🚀 Deployment](#-deployment)
  - [🐳 Docker Deployment](#-docker-deployment)
  - [📦 Available Docker Profiles](#-available-docker-profiles)
  - [🛠️ Development Commands](#️-development-commands)
  - [📈 Monitoring & Health Checks](#-monitoring--health-checks)
- [📚 Code Standards & Rules](#-code-standards--rules)
- [🐛 Error Handling](#-error-handling)
- [🔒 Security](#-security)
- [📈 Performance](#-performance)
- [🤝 Contributing](#-contributing)

## 🚀 Quick Start

### Prerequisites

- **Node.js**: `>= 18.0.0` (LTS recommended)
- **npm**: `>= 8.0.0` or **yarn**: `>= 1.22.0`
- **PostgreSQL**: `>= 13.0` (or compatible database)
- **Redis**: `>= 6.0` (for caching and sessions)
- **Git**: Latest version

### Installation

```bash
# Clone the repository
git clone https://github.com/hashbuzz/dApp-backend.git
cd dApp-backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure environment variables (see Environment Setup section)
nano .env

# Generate Prisma client
npm run db:pull

# Start development server
npm run dev
```

The server will start on `http://localhost:4000` by default.

### 🐳 Quick Start with Docker (Recommended)

For a complete development environment with database and monitoring:

```bash
# Copy environment template and configure
cp .env.example .env

# Start development environment with all services
docker compose --profile dev up -d

# View service status
docker compose ps

# Access services:
# - API: http://localhost:4000
# - Database UI: http://localhost:5555
# - Monitoring: http://localhost:3001
```

This sets up the entire stack including PostgreSQL, Redis, monitoring, and development tools automatically.

## 🏗️ Architecture Overview

HashBuzz dApp Backend follows a **layered monolithic architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────┐
│              Frontend (React)           │
└─────────────────────────────────────────┘
                    │ HTTP/REST
┌─────────────────────────────────────────┐
│              API Gateway                │
│         (Express.js Routes)             │
└─────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────┐
│             Controllers                 │
│        (Business Logic Layer)          │
└─────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────┐
│              Services                   │
│     (Core Business Logic)               │
└─────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────┐
│              Data Layer                 │
│        (Prisma ORM + Database)         │
└─────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────┐
│            External Services            │
│  (Hedera, Twitter API, Smart Contracts) │
└─────────────────────────────────────────┘
```

### Core Components

- **Controllers**: Handle HTTP requests/responses and input validation
- **Services**: Contain business logic and external API integrations
- **Middleware**: Authentication, validation, logging, error handling
- **Routes**: Define API endpoints and their handlers
- **Smart Contracts**: Hedera Hashgraph contract interactions
- **Database**: PostgreSQL with Prisma ORM for data persistence

## 🛠️ Tech Stack

### Core Technologies

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.18+
- **Language**: TypeScript 5.0+
- **Database ORM**: Prisma 5.0+
- **Database**: PostgreSQL 13+
- **Cache**: Redis 6.0+

### Blockchain Integration

- **Hedera Hashgraph SDK**: For DLT operations
- **Smart Contracts**: Solidity contracts on Hedera
- **Wallet Integration**: Hedera native wallets

### External APIs

- **Twitter API v2**: Social media integrations
- **OpenAI GPT**: AI-powered content generation
- **File Storage**: Local/cloud file handling

### Development Tools

- **Build**: ts-node, TypeScript compiler
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier
- **Testing**: Jest (configured)
- **Monitoring**: Custom logging with jet-logger

## 📂 Project Structure

```
dApp-backend/
├── 📁 src/                           # Source code
│   ├── 📁 @types/                    # TypeScript type definitions
│   │   ├── AppConfig.ts              # Application configuration types
│   │   ├── custom.d.ts               # Custom type declarations
│   │   └── networkResponses.ts       # Network response types
│   ├── 📁 controller/                # Request handlers
│   │   ├── Admin.ts                  # Admin operations controller
│   │   ├── Auth.ts                   # Authentication controller
│   │   ├── Campaign.ts               # Campaign management controller
│   │   ├── Integrations.ts           # External API integrations
│   │   ├── MediaController.ts        # File/media handling
│   │   └── openAi.ts                 # OpenAI API controller
│   ├── 📁 services/                  # Business logic layer
│   │   ├── 📁 campaign-service/      # Campaign operations
│   │   ├── 📁 contract-service/      # Smart contract interactions
│   │   ├── 📁 reward-service/        # Reward distribution logic
│   │   ├── 📁 transaction-service/   # Transaction handling
│   │   └── 📁 user-service/          # User management
│   ├── 📁 routes/                    # API route definitions
│   │   ├── api.ts                    # Main API routes
│   │   ├── auth.ts                   # Authentication routes
│   │   └── index.ts                  # Route aggregator
│   ├── 📁 middleware/                # Express middleware
│   │   ├── auth.middleware.ts        # Authentication middleware
│   │   ├── validation.middleware.ts  # Request validation
│   │   └── error.middleware.ts       # Error handling
│   ├── 📁 shared/                    # Shared utilities
│   │   ├── 📁 helper/                # Utility functions
│   │   ├── prisma.ts                 # Database client
│   │   └── errors.ts                 # Custom error classes
│   ├── 📁 contractsV201/             # Smart contract artifacts
│   ├── 📁 validator/                 # Input validation schemas
│   ├── 📁 after-start/               # Post-startup tasks
│   ├── 📁 pre-start/                 # Pre-startup tasks
│   ├── appConfig.ts                  # Application configuration
│   └── index.ts                      # Application entry point
├── 📁 prisma/                        # Database schema and migrations
│   └── schema.prisma                 # Prisma schema definition
├── 📁 public/                        # Static files and uploads
│   └── 📁 uploads/                   # User uploaded files
├── 📁 scripts/                       # Deployment and utility scripts
├── 📁 logs/                          # Application logs
├── 📄 package.json                   # Dependencies and scripts
├── 📄 tsconfig.json                  # TypeScript configuration
├── 📄 .env.example                   # Environment template
└── 📄 README.md                      # This file
```

## ⚙️ Environment Setup

### Required Environment Variables

Create a `.env` file in the project root with these variables:

```bash
# === APPLICATION CONFIGURATION ===
NODE_ENV=development                    # development | production | test
PORT=4000                              # Server port
HOST=localhost                         # Server hostname
APP_NAME=HashBuzz-dApp-Backend         # Application name

# === DATABASE CONFIGURATION ===
DATABASE_URL="postgresql://username:password@localhost:5432/hashbuzz_db?schema=public"

# === REDIS CONFIGURATION ===
REDIS_URL=redis://localhost:6379      # Redis connection string
REDIS_PASSWORD=                        # Redis password (if required)

# === HEDERA HASHGRAPH CONFIGURATION ===
HEDERA_NETWORK=testnet                 # testnet | mainnet
HEDERA_OPERATOR_ID=0.0.xxxxxx          # Hedera account ID
HEDERA_OPERATOR_KEY=302e020100300506... # Hedera private key
HEDERA_CONTRACT_ID=0.0.xxxxxx          # Smart contract ID

# === TWITTER API CONFIGURATION ===
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_BEARER_TOKEN=your_twitter_bearer_token
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret

# === OPENAI CONFIGURATION ===
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx     # OpenAI API key
OPENAI_MODEL=gpt-3.5-turbo            # OpenAI model to use

# === SECURITY CONFIGURATION ===
JWT_SECRET=your-super-secret-jwt-key-min-256-bits
SESSION_SECRET=your-session-secret-key
ENCRYPTION_KEY=your-32-character-encryption-key

# === FILE UPLOAD CONFIGURATION ===
MAX_FILE_SIZE=10485760                 # 10MB in bytes
UPLOAD_DIR=./public/uploads            # Upload directory
ALLOWED_FILE_TYPES=jpg,jpeg,png,gif,mp4,mov

# === CAMPAIGN CONFIGURATION ===
CAMPAIGN_DURATION=1440                 # Campaign duration in minutes (24 hours)
MAX_REWARD_AMOUNT=1000                 # Maximum reward amount
MIN_REWARD_AMOUNT=1                    # Minimum reward amount

# === EXTERNAL SERVICE URLs ===
MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
FRONTEND_URL=http://localhost:3000     # Frontend application URL

# === DEVELOPMENT CONFIGURATION ===
LOG_LEVEL=debug                        # error | warn | info | debug
ENABLE_CORS=true                       # Enable CORS for development
DEBUG_MODE=true                        # Enable debug features
```

### Environment Validation

The application validates all required environment variables on startup. Missing or invalid variables will prevent the server from starting.

## 🗄️ Database Configuration

### PostgreSQL Setup

1. **Install PostgreSQL** (version 13 or higher)
2. **Create Database**:

   ```sql
   CREATE DATABASE hashbuzz_db;
   CREATE USER hashbuzz_user WITH ENCRYPTED PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE hashbuzz_db TO hashbuzz_user;
   ```

3. **Update DATABASE_URL** in your `.env` file

### Prisma Commands

```bash
# Pull schema from existing database
npm run db:pull

# Push schema changes to database
npm run db:push

# Generate Prisma client
npm run readyPrisma

# Reset database (⚠️ DESTRUCTIVE)
npx prisma db reset
```

### Database Schema Overview

Key tables and their purposes:

- **`user_user`**: User accounts and authentication
- **`campaign_twittercard`**: Campaign definitions and metadata
- **`campaign_tweetengagements`**: User engagement tracking
- **`token_transactions`**: Hedera token transactions
- **`user_balances`**: User token balances
- **`admin_settings`**: Application configuration

## 🔧 Development Guidelines

### Getting Started for Developers

1. **Fork and Clone**:

   ```bash
   git fork https://github.com/hashbuzz/dApp-backend.git
   git clone https://github.com/your-username/dApp-backend.git
   cd dApp-backend
   ```

2. **Setup Development Environment**:

   ```bash
   npm install
   cp .env.example .env
   # Configure your .env file
   npm run db:pull
   ```

3. **Start Development Server**:
   ```bash
   npm run dev  # Starts with nodemon for auto-restart
   ```

### Development Workflow

1. **Create Feature Branch**:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes** following our code standards

3. **Test Your Changes**:

   ```bash
   npm run lint      # Check code style
   npm run test      # Run tests
   npm run build     # Verify build
   ```

4. **Commit and Push**:

   ```bash
   git add .
   git commit -m "feat: add your feature description"
   git push origin feature/your-feature-name
   ```

5. **Create Pull Request** with detailed description

### Available Scripts

```bash
# Development
npm run dev              # Start development server with hot reload
npm run build           # Build for production
npm run start           # Start production server

# Database
npm run db:pull         # Pull schema from database
npm run db:push         # Push schema to database
npm run readyPrisma     # Generate Prisma client

# Code Quality
npm run lint            # Run ESLint
npm run format          # Format code with Prettier
npm run test            # Run test suite

# Utilities
npm run env-config      # Validate environment configuration
```

## 📝 API Documentation

### Base URL

- Development: `http://localhost:4000`
- Production: `https://api.hashbuzz.com` (example)

### Authentication

Most endpoints require authentication via JWT token:

```bash
Authorization: Bearer <jwt_token>
```

### API Endpoints Overview

#### Authentication (`/auth`)

```bash
POST   /auth/challenge          # Create auth challenge
POST   /auth/generate           # Generate auth token
POST   /auth/logout             # Logout user
GET    /auth/ping               # Check auth status
POST   /auth/admin-login        # Admin authentication
```

#### User Management (`/api/users`)

```bash
GET    /api/users/current       # Get current user
PUT    /api/users/update        # Update user profile
GET    /api/users/token-balances # Get user token balances
POST   /api/users/sync-balance  # Sync token balance
```

#### Campaign Management (`/api/campaign`)

```bash
GET    /api/campaign/all        # Get all campaigns
POST   /api/campaign/add-new    # Create new campaign
POST   /api/campaign/update-status # Update campaign status
GET    /api/campaign/reward-details # Get reward details
PUT    /api/campaign/claim-reward # Claim rewards
POST   /api/campaign/chatgpt    # AI content generation
```

#### Admin Operations (`/api/admin`)

```bash
GET    /api/admin/user/all      # Get all users
POST   /api/admin/list-token    # Add new token
GET    /api/admin/listed-tokens # Get listed tokens
PUT    /api/admin/update-status # Approve/reject campaigns
GET    /api/admin/twitter-pending-cards # Get pending campaigns
```

### Request/Response Examples

#### Create Campaign

```bash
POST /api/campaign/add-new
Content-Type: multipart/form-data

{
  "name": "Summer Campaign 2024",
  "tweet_text": "Join our amazing summer campaign! #HashBuzz",
  "comment_reward": "10",
  "retweet_reward": "15",
  "like_reward": "5",
  "quote_reward": "20",
  "follow_reward": "25",
  "campaign_budget": "1000",
  "type": "HBAR",
  "media": [file1, file2]
}
```

#### Response Format

```json
{
  "success": true,
  "data": {
    "id": 123,
    "name": "Summer Campaign 2024",
    "status": "PENDING_APPROVAL",
    "created_at": "2024-08-15T10:30:00Z"
  },
  "message": "Campaign created successfully"
}
```

## 🧪 Testing

### Test Structure

```
spec/
├── unit/                    # Unit tests
├── integration/             # Integration tests
├── e2e/                     # End-to-end tests
└── fixtures/                # Test data
```

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- spec/unit/campaign.spec.ts

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Writing Tests

```typescript
// Example test structure
describe('CampaignService', () => {
  beforeEach(async () => {
    // Setup test data
  });

  afterEach(async () => {
    // Cleanup
  });

  it('should create a new campaign', async () => {
    // Test implementation
  });
});
```

## 🚀 Deployment

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm run start
```

### Docker Deployment

#### 🐳 Quick Start with Docker Compose

The easiest way to run the entire stack:

```bash
# Copy environment template
cp .env.example .env

# Edit critical values (passwords, secrets, API keys)
nano .env

# Start development environment
docker compose --profile dev up -d

# Or start production with monitoring
docker compose --profile monitoring --profile backup up -d
```

#### 📦 Available Docker Profiles

| Profile | Services | Use Case |
|---------|----------|----------|
| `default` | API, PostgreSQL, Redis | Basic production |
| `dev` | + Prisma Studio, Debug port | Development |
| `monitoring` | + Prometheus, Grafana, Loki | Production monitoring |
| `backup` | + Automated DB backups | Production backup |
| `proxy` | + Nginx reverse proxy | SSL/Load balancing |

#### 🚀 Docker Services

```yaml
# Core services included:
services:
  api:          # Main backend application (Port 4000)
  postgres:     # Primary database (Port 5432)
  redis:        # Cache and sessions (Port 6379)
  
  # Development tools (--profile dev)
  prisma-studio: # Database browser (Port 5555)
  
  # Monitoring stack (--profile monitoring)
  prometheus:   # Metrics collection (Port 9090)
  grafana:      # Dashboards (Port 3001)
  loki:         # Log aggregation (Port 3100)
  
  # Production features
  backup:       # Automated DB backups
  nginx:        # Reverse proxy (Port 80/443)
```

#### 🛠️ Development Commands

```bash
# Start development environment
./docker-dev.sh dev

# View logs
docker compose logs -f api

# Access container shell
docker compose exec api sh

# Run database migrations
docker compose exec api yarn prisma migrate deploy

# Check service health
docker compose ps
./docker-dev.sh health
```

#### 📊 Image Sizes

| Variant | Size | Use Case |
|---------|------|----------|
| Standard (Node 22 Alpine) | 483MB | Development, full features |
| Minimal (Distroless) | 183MB | Production, size-critical |

#### 🔧 Environment Configuration

Critical variables to configure in `.env`:

```bash
# Security (REQUIRED)
POSTGRES_PASSWORD=your_secure_password
JWT_SECRET=your_256_bit_random_string
SESSION_SECRET=your_session_secret

# Email Alerts (RECOMMENDED)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
ALERT_RECEIVER="admin@domain.com support@domain.com"

# Hedera Configuration
HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=your_private_key

# Social Media APIs
TWITTER_API_KEY=your_key
TWITTER_API_SECRET=your_secret
TWITTER_BEARER_TOKEN=your_token
```

#### 📈 Monitoring & Health Checks

Access monitoring dashboards:

- **API Health**: http://localhost:4000/health
- **Grafana Dashboards**: http://localhost:3001 (admin / configured password)
- **Prometheus Metrics**: http://localhost:9090
- **Prisma Studio**: http://localhost:5555 (dev profile)

All services include health checks and automatic restarts.

#### 💾 Automated Backups

Database backups run daily at 2 AM (configurable):

```bash
# Manual backup
docker compose exec backup /backup.sh

# List backups
docker compose exec backup ls -la /backups/

# Restore backup
docker compose exec backup /restore.sh /backups/backup-YYYYMMDD-HHMMSS.sql
```

#### 🔒 Security Features

- ✅ Non-root user execution
- ✅ Read-only containers where possible
- ✅ Resource limits and health checks
- ✅ Network isolation
- ✅ Secrets management via environment variables
- ✅ Multi-stage builds for minimal attack surface

#### 🚨 Troubleshooting

Common issues and solutions:

```bash
# Check service status
docker compose ps

# View service logs
docker compose logs -f [service_name]

# Restart services
docker compose restart [service_name]

# Full cleanup (DESTRUCTIVE)
docker compose down -v --remove-orphans

# Check resource usage
docker stats
```

### Environment Considerations

- **Production**: Set `NODE_ENV=production`, use strong secrets
- **Security**: Configure firewall rules, enable SSL certificates
- **Monitoring**: Set up alerts and log rotation
- **Backup**: Test restore procedures regularly
- **Performance**: Adjust resource limits based on load

### Additional Docker Documentation

For more detailed Docker information, see:

- **[DOCKER_README.md](./DOCKER_README.md)** - Comprehensive Docker usage guide
- **[DOCKER_QUICKSTART.md](./DOCKER_QUICKSTART.md)** - Step-by-step quick start guide
- **[.env.example](./.env.example)** - Complete environment variable reference

## 📚 Code Standards & Rules

### TypeScript Guidelines

1. **Strict Type Safety**:

   ```typescript
   // ✅ Good: Explicit typing
   interface UserCreateRequest {
     name: string;
     email: string;
     hedera_wallet_id: string;
   }

   // ❌ Bad: Any type
   function createUser(data: any) {}
   ```

2. **Error Handling**:

   ```typescript
   // ✅ Good: Proper error handling
   try {
     const result = await riskyOperation();
     return result;
   } catch (error) {
     logger.error('Operation failed:', error);
     throw new ErrorWithCode('Operation failed', 500);
   }
   ```

3. **Async/Await Pattern**:

   ```typescript
   // ✅ Good: Async/await
   async function fetchUserData(id: string): Promise<User> {
     const user = await userService.findById(id);
     return user;
   }

   // ❌ Bad: Promise chains
   function fetchUserData(id: string) {
     return userService.findById(id).then((user) => user);
   }
   ```

### File Naming Conventions

```
PascalCase:     Controller files, Class files
camelCase:      Function names, Variable names
kebab-case:     URL endpoints, File names (when appropriate)
UPPER_CASE:     Constants, Environment variables
```

### Import/Export Standards

```typescript
// ✅ Good: Explicit imports
import { UserService } from '@services/user-service';
import { validateEmail } from '@shared/helper';

// ✅ Good: Grouped imports
// 1. Node modules
import express from 'express';
import bcrypt from 'bcrypt';

// 2. Internal modules
import { UserController } from '@controller/User';
import userService from '@services/user-service';

// 3. Types
import type { User, Campaign } from '@types';
```

### Database Interaction Rules

1. **Always use Prisma client**:

   ```typescript
   // ✅ Good
   const user = await prisma.user_user.findUnique({
     where: { id: userId },
   });

   // ❌ Bad: Raw SQL unless absolutely necessary
   ```

2. **Proper transaction handling**:

   ```typescript
   // ✅ Good: Use transactions for multiple operations
   await prisma.$transaction(async (tx) => {
     await tx.user_user.update({ ... });
     await tx.user_balances.create({ ... });
   });
   ```

3. **Database connection management**:
   ```typescript
   // ✅ Good: Always disconnect in finally block
   let prisma;
   try {
     prisma = await createPrismaClient();
     // operations
   } finally {
     if (prisma) await prisma.$disconnect();
   }
   ```

### API Design Rules

1. **RESTful Design**:

   ```
   GET    /api/campaigns           # Get all campaigns
   GET    /api/campaigns/:id       # Get specific campaign
   POST   /api/campaigns           # Create campaign
   PUT    /api/campaigns/:id       # Update campaign
   DELETE /api/campaigns/:id       # Delete campaign
   ```

2. **Response Format**:

   ```typescript
   // ✅ Good: Consistent response structure
   interface ApiResponse<T> {
     success: boolean;
     data?: T;
     message?: string;
     error?: string;
   }
   ```

3. **Status Codes**:
   ```typescript
   // Use appropriate HTTP status codes
   200: OK (successful GET, PUT)
   201: Created (successful POST)
   400: Bad Request (validation errors)
   401: Unauthorized (authentication required)
   403: Forbidden (access denied)
   404: Not Found (resource not found)
   500: Internal Server Error (server errors)
   ```

### Security Rules

1. **Input Validation**:

   ```typescript
   // ✅ Good: Validate all inputs
   const { error, value } = campaignSchema.validate(req.body);
   if (error) {
     return res.status(400).json({ error: error.details[0].message });
   }
   ```

2. **Authentication Check**:

   ```typescript
   // ✅ Good: Check authentication for protected routes
   if (!req.currentUser) {
     return res.status(401).json({ error: 'Authentication required' });
   }
   ```

3. **Data Sanitization**:
   ```typescript
   // ✅ Good: Sanitize sensitive data in responses
   const sanitizedUser = rmKeyFrmData(user, ['password', 'privateKey']);
   ```

### Performance Rules

1. **Database Queries**:

   ```typescript
   // ✅ Good: Limit query results
   const campaigns = await prisma.campaign_twittercard.findMany({
     take: 100,
     select: { id: true, name: true, status: true },
   });

   // ❌ Bad: Unlimited queries
   const campaigns = await prisma.campaign_twittercard.findMany();
   ```

2. **Memory Management**:
   ```typescript
   // ✅ Good: Process large datasets in chunks
   for (let i = 0; i < users.length; i += BATCH_SIZE) {
     const batch = users.slice(i, i + BATCH_SIZE);
     await processBatch(batch);
   }
   ```

### Code Review Checklist

Before submitting PR, ensure:

- [ ] All TypeScript errors resolved
- [ ] Proper error handling implemented
- [ ] Database connections properly managed
- [ ] Input validation in place
- [ ] Authentication checks added
- [ ] Logging statements added for debugging
- [ ] No sensitive data exposed in responses
- [ ] Performance considerations addressed
- [ ] Tests written for new functionality
- [ ] Documentation updated

## 🐛 Error Handling

### Error Classes

```typescript
// Custom error with HTTP status code
class ErrorWithCode extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'ErrorWithCode';
  }
}

// Usage
throw new ErrorWithCode('Campaign not found', 404);
```

### Global Error Handler

```typescript
// middleware/error.middleware.ts
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Error occurred:', err);

  if (err instanceof ErrorWithCode) {
    return res.status(err.statusCode).json({
      error: true,
      message: err.message,
    });
  }

  return res.status(500).json({
    error: true,
    message: 'Internal server error',
  });
};
```

### Best Practices

1. **Always log errors** with context
2. **Return appropriate status codes**
3. **Don't expose internal errors** to clients
4. **Use specific error messages** for debugging
5. **Handle async errors** properly

## 🔒 Security

### Authentication Flow

1. **Challenge-Response Authentication**:

   ```
   Client → GET /auth/challenge → Server (returns challenge)
   Client → POST /auth/generate (with signed challenge) → Server (returns JWT)
   Client → Authenticated requests with JWT header
   ```

2. **JWT Token Structure**:
   ```typescript
   interface JWTPayload {
     userId: string;
     walletId: string;
     role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
     iat: number;
     exp: number;
   }
   ```

### Security Measures

1. **Input Validation**: All inputs validated using Joi schemas
2. **Rate Limiting**: API endpoints rate-limited to prevent abuse
3. **CORS**: Properly configured for frontend origins
4. **Helmet**: Security headers for all responses
5. **Data Sanitization**: Sensitive data removed from responses

## 📈 Performance

### Optimization Strategies

1. **Database Indexing**: Critical queries optimized with proper indexes
2. **Query Optimization**: Use `select` to fetch only required fields
3. **Caching**: Redis used for frequently accessed data
4. **Pagination**: Large datasets paginated to prevent memory issues
5. **Connection Pooling**: Database connections properly managed

### Monitoring

- **Response Times**: Monitor API endpoint performance
- **Database Queries**: Track slow queries and optimize
- **Memory Usage**: Monitor memory consumption patterns
- **Error Rates**: Track error frequency and types

## 🤝 Contributing

### Development Process

1. **Fork** the repository
2. **Create feature branch** from `develop`
3. **Make changes** following code standards
4. **Write tests** for new functionality
5. **Submit pull request** with detailed description

### Commit Message Convention

```
type(scope): description

feat(campaign): add reward distribution logic
fix(auth): resolve JWT token validation issue
docs(readme): update installation instructions
refactor(database): optimize user query performance
test(campaign): add unit tests for campaign service
```

### Pull Request Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or marked as such)
```

---

## 📞 Support & Contact

- **Issues**: [GitHub Issues](https://github.com/hashbuzz/dApp-backend/issues)
- **Documentation**: This README and inline code documentation
- **Team**: Contact the development team for questions

## 📄 License

This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for details.

---

**Happy Coding! 🚀**

> Remember: Clean code is not written by following a set of rules. Clean code is written by someone who cares about their craft and takes pride in their work.
