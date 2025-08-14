# Contributing to HashBuzz dApp Backend

Thank you for your interest in contributing to HashBuzz dApp Backend! This document provides comprehensive guidelines for developers joining the project.

## 🚀 Quick Start for New Developers

### 1. Prerequisites Setup

Ensure you have the following installed:
- **Node.js**: 18.0.0 or higher ([Download](https://nodejs.org/))
- **npm**: 8.0.0 or higher (comes with Node.js)
- **PostgreSQL**: 13.0 or higher ([Download](https://www.postgresql.org/download/))
- **Redis**: 6.0 or higher ([Download](https://redis.io/download))
- **Git**: Latest version ([Download](https://git-scm.com/downloads))

### 2. Development Environment Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/your-username/dApp-backend.git
cd dApp-backend

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your configuration (see Environment Setup section)

# 4. Setup database
createdb hashbuzz_db  # PostgreSQL command
npm run db:pull       # Pull existing schema
npm run readyPrisma   # Generate Prisma client

# 5. Start development server
npm run dev
```

## 📋 Development Workflow

### Branch Strategy

We follow **Git Flow** with these branch types:

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/*`: New features (`feature/user-authentication`)
- `fix/*`: Bug fixes (`fix/reward-calculation`)
- `hotfix/*`: Urgent production fixes
- `release/*`: Release preparation

### Feature Development Process

1. **Create Feature Branch**:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. **Development Cycle**:
   ```bash
   # Make your changes
   npm run lint          # Check code style
   npm run test          # Run tests
   npm run build         # Verify build works
   ```

3. **Commit Changes**:
   ```bash
   git add .
   git commit -m "feat(scope): description"
   # Follow conventional commit format (see below)
   ```

4. **Push and Create PR**:
   ```bash
   git push origin feature/your-feature-name
   # Create Pull Request on GitHub
   ```

## 📝 Code Standards & Best Practices

### TypeScript Guidelines

#### 1. Type Safety
```typescript
// ✅ GOOD: Explicit interfaces
interface CampaignRequest {
  name: string;
  budget: number;
  rewards: RewardStructure;
}

// ❌ BAD: Using any
function createCampaign(data: any) { ... }

// ✅ GOOD: Proper error handling
async function createCampaign(data: CampaignRequest): Promise<Campaign> {
  try {
    const campaign = await campaignService.create(data);
    return campaign;
  } catch (error) {
    logger.error('Campaign creation failed:', error);
    throw new ErrorWithCode('Failed to create campaign', 400);
  }
}
```

#### 2. Naming Conventions
```typescript
// Interfaces: PascalCase
interface UserProfile { }

// Classes: PascalCase  
class CampaignService { }

// Functions/Variables: camelCase
const getUserById = async (id: string) => { }

// Constants: UPPER_SNAKE_CASE
const MAX_CAMPAIGN_DURATION = 86400;

// Files: kebab-case or PascalCase
// campaign-service.ts (services)
// CampaignController.ts (controllers)
```

#### 3. Import Organization
```typescript
// 1. Node.js built-in modules
import fs from 'fs';
import path from 'path';

// 2. Third-party packages
import express from 'express';
import { PrismaClient } from '@prisma/client';

// 3. Internal modules (absolute imports)
import { CampaignService } from '@services/campaign-service';
import { validateInput } from '@shared/helper';

// 4. Type-only imports (separate group)
import type { Request, Response } from 'express';
import type { Campaign, User } from '@types';
```

### Database Best Practices

#### 1. Prisma Client Usage
```typescript
// ✅ GOOD: Proper connection management
export const getUserCampaigns = async (userId: string) => {
  let prisma;
  try {
    prisma = await createPrismaClient();
    
    const campaigns = await prisma.campaign_twittercard.findMany({
      where: { user_id: userId },
      select: {
        id: true,
        name: true,
        status: true,
        created_at: true
      },
      take: 100 // Limit results
    });
    
    return campaigns;
  } catch (error) {
    logger.error('Failed to fetch user campaigns:', error);
    throw error;
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
};

// ✅ GOOD: Transaction usage
export const createCampaignWithRewards = async (data: CampaignData) => {
  const prisma = await createPrismaClient();
  
  try {
    return await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign_twittercard.create({
        data: {
          name: data.name,
          budget: data.budget
        }
      });
      
      await tx.campaign_rewards.createMany({
        data: data.rewards.map(reward => ({
          campaign_id: campaign.id,
          ...reward
        }))
      });
      
      return campaign;
    });
  } finally {
    await prisma.$disconnect();
  }
};
```

#### 2. Query Optimization
```typescript
// ✅ GOOD: Efficient queries
const getActiveCampaigns = async () => {
  return await prisma.campaign_twittercard.findMany({
    where: { 
      status: 'ACTIVE',
      end_date: { gte: new Date() }
    },
    select: {
      id: true,
      name: true,
      budget: true
    },
    take: 50,
    orderBy: { created_at: 'desc' }
  });
};

// ❌ BAD: Fetching all data
const getAllCampaigns = async () => {
  return await prisma.campaign_twittercard.findMany(); // No limits or selects
};
```

### API Design Standards

#### 1. Controller Structure
```typescript
// controllers/Campaign.ts
export const createCampaign = async (req: Request, res: Response) => {
  try {
    // 1. Validate authentication
    if (!req.currentUser) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // 2. Validate input
    const { error, value } = campaignSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: error.details
      });
    }

    // 3. Business logic
    const campaign = await campaignService.create({
      ...value,
      userId: req.currentUser.id
    });

    // 4. Success response
    return res.status(201).json({
      success: true,
      data: campaign,
      message: 'Campaign created successfully'
    });

  } catch (error) {
    logger.error('Campaign creation error:', error);
    
    if (error instanceof ErrorWithCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
```

#### 2. Service Layer Pattern
```typescript
// services/campaign-service/index.ts
class CampaignService {
  async create(data: CreateCampaignRequest): Promise<Campaign> {
    // 1. Validate business rules
    await this.validateCampaignRules(data);
    
    // 2. Process data
    const processedData = this.processCampaignData(data);
    
    // 3. Create in database
    const campaign = await this.createInDatabase(processedData);
    
    // 4. Post-creation tasks
    await this.handlePostCreation(campaign);
    
    return campaign;
  }
  
  private async validateCampaignRules(data: CreateCampaignRequest) {
    // Business validation logic
    if (data.budget < MIN_CAMPAIGN_BUDGET) {
      throw new ErrorWithCode('Budget too low', 400);
    }
  }
}

export default new CampaignService();
```

### Error Handling Standards

#### 1. Custom Error Classes
```typescript
// shared/errors.ts
export class ErrorWithCode extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ErrorWithCode';
  }
}

export class ValidationError extends ErrorWithCode {
  constructor(message: string, public details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends ErrorWithCode {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}
```

#### 2. Global Error Handler
```typescript
// middleware/error.middleware.ts
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Request error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    user: req.currentUser?.id
  });

  if (err instanceof ErrorWithCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code
    });
  }

  return res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
};
```

## 🧪 Testing Guidelines

### Test Structure
```
spec/
├── unit/                    # Unit tests for individual functions
│   ├── services/           # Service layer tests
│   ├── controllers/        # Controller tests
│   └── utils/              # Utility function tests
├── integration/            # Integration tests
│   ├── api/               # API endpoint tests
│   └── database/          # Database operation tests
├── e2e/                   # End-to-end tests
├── fixtures/              # Test data and mocks
└── helpers/               # Test utility functions
```

### Writing Tests

#### 1. Unit Tests
```typescript
// spec/unit/services/campaign-service.spec.ts
import { CampaignService } from '@services/campaign-service';
import { createMockPrismaClient } from '../helpers/mock-prisma';

describe('CampaignService', () => {
  let campaignService: CampaignService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    campaignService = new CampaignService(mockPrisma);
  });

  describe('create', () => {
    it('should create a campaign with valid data', async () => {
      // Arrange
      const campaignData = {
        name: 'Test Campaign',
        budget: 1000
      };
      
      mockPrisma.campaign_twittercard.create.mockResolvedValue({
        id: 1,
        ...campaignData
      });

      // Act
      const result = await campaignService.create(campaignData);

      // Assert
      expect(result.id).toBe(1);
      expect(result.name).toBe('Test Campaign');
      expect(mockPrisma.campaign_twittercard.create).toHaveBeenCalledWith({
        data: campaignData
      });
    });

    it('should throw error for invalid budget', async () => {
      // Arrange
      const campaignData = {
        name: 'Test Campaign',
        budget: 0 // Invalid budget
      };

      // Act & Assert
      await expect(campaignService.create(campaignData))
        .rejects
        .toThrow('Budget too low');
    });
  });
});
```

#### 2. Integration Tests
```typescript
// spec/integration/api/campaign.spec.ts
import request from 'supertest';
import { app } from '@server';
import { createTestUser, createTestToken } from '../helpers/test-data';

describe('Campaign API', () => {
  let authToken: string;
  let testUser: any;

  beforeAll(async () => {
    testUser = await createTestUser();
    authToken = createTestToken(testUser);
  });

  describe('POST /api/campaign/add-new', () => {
    it('should create campaign with valid data', async () => {
      const campaignData = {
        name: 'Integration Test Campaign',
        budget: 1000,
        type: 'HBAR'
      };

      const response = await request(app)
        .post('/api/campaign/add-new')
        .set('Authorization', `Bearer ${authToken}`)
        .send(campaignData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(campaignData.name);
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .post('/api/campaign/add-new')
        .send({ name: 'Test' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
```

### Test Commands
```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- spec/unit/campaign-service.spec.ts

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode (development)
npm run test:watch

# Run only integration tests
npm run test -- spec/integration

# Run tests for specific service
npm run test -- spec/unit/services/campaign*
```

## 📋 Pull Request Guidelines

### PR Template
Use this template for all pull requests:

```markdown
## 📝 Description
Brief description of the changes made.

## 🎯 Type of Change
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 Documentation update
- [ ] 🔧 Configuration change
- [ ] 🧪 Test improvements

## 🧪 Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] New tests added for new functionality

## 📝 Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

## 🔗 Related Issues
Closes #(issue_number)

## 📸 Screenshots (if applicable)
<!-- Add screenshots for UI changes -->

## 📋 Additional Notes
<!-- Any additional information about the PR -->
```

### PR Review Process

1. **Automated Checks**: All PRs must pass:
   - ESLint checks
   - TypeScript compilation
   - Unit tests
   - Build process

2. **Code Review**: At least one team member must review:
   - Code quality and standards
   - Security considerations
   - Performance implications
   - Test coverage

3. **Testing**: Reviewer should verify:
   - Functionality works as expected
   - No regression bugs
   - Edge cases handled

## 📦 Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes

### Examples
```bash
feat(campaign): add reward distribution logic
fix(auth): resolve JWT token validation issue
docs(readme): update installation instructions
refactor(database): optimize user query performance
test(campaign): add unit tests for campaign service
chore(deps): update dependencies to latest versions
```

### Scope Guidelines
- `auth`: Authentication related
- `campaign`: Campaign management
- `user`: User management
- `admin`: Admin functionality
- `database`: Database operations
- `api`: API endpoints
- `contract`: Smart contract integration
- `validation`: Input validation
- `middleware`: Express middleware
- `config`: Configuration changes

## 🔧 Development Tools

### Required IDE Extensions (VS Code)
```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### IDE Configuration
```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "absolute"
}
```

## 🚀 Release Process

### Version Numbering
We follow [Semantic Versioning](https://semver.org/):
- `MAJOR.MINOR.PATCH` (e.g., 1.2.3)
- `MAJOR`: Breaking changes
- `MINOR`: New features (backward compatible)
- `PATCH`: Bug fixes (backward compatible)

### Release Checklist
1. **Pre-release**:
   - [ ] All tests pass
   - [ ] Documentation updated
   - [ ] CHANGELOG.md updated
   - [ ] Version bumped in package.json

2. **Release**:
   - [ ] Create release branch
   - [ ] Tag release
   - [ ] Deploy to staging
   - [ ] Run smoke tests
   - [ ] Deploy to production

3. **Post-release**:
   - [ ] Verify production deployment
   - [ ] Monitor error logs
   - [ ] Update team on release

## 🆘 Getting Help

### Resources
1. **Documentation**: Start with this README
2. **Code Examples**: Check existing controllers and services
3. **API Documentation**: Use Postman collection or inline docs
4. **Team Chat**: Ask in development channel

### Common Issues & Solutions

#### Database Connection Issues
```bash
# Reset database connection
npm run db:pull
npm run readyPrisma

# Check database status
pg_ctl status
```

#### TypeScript Errors
```bash
# Clear TypeScript cache
npx tsc --build --clean

# Regenerate Prisma types
npm run readyPrisma
```

#### Development Server Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Reset nodemon
pkill -f nodemon
npm run dev
```

### Contact
- **Issues**: Create GitHub issue with detailed description
- **Questions**: Tag team members in comments
- **Urgent**: Contact team lead directly

---

## 🎉 Welcome to the Team!

Thank you for contributing to HashBuzz dApp Backend. Your work helps build the future of decentralized social media campaigns!

Remember:
- 🧹 **Clean code** is better than clever code
- 🧪 **Test everything** you write
- 📝 **Document your changes**
- 🤝 **Help your teammates**
- 🚀 **Ship with confidence**

Happy coding! 🎯
