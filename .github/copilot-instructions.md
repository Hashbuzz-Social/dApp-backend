# HashBuzz Backend - AI Coding Agent Instructions

## Project Overview

HashBuzz is a **Hedera Hashgraph-based social media campaign platform** backend built with Node.js/Express/TypeScript. The system manages Twitter-based marketing campaigns with blockchain-backed reward distribution via smart contracts.

**Version:** 0.201.x (V201 architecture active)
**Runtime:** Node.js 18+ | TypeScript 5.0+ | Express.js 4.18+
**Database:** PostgreSQL + Prisma ORM
**Blockchain:** Hedera Hashgraph SDK v2.x

---

## Critical Architecture Patterns

### 1. **Dual Architecture - Legacy + V201**

The codebase has TWO parallel systems:

- **Legacy:** `src/controller/`, `src/routes/`, `src/services/` - Original monolithic structure
- **V201:** `src/V201/Modules/` - **New modular architecture** (use this for new features)

**V201 Module Structure:**
```
src/V201/Modules/{module}/
  ├── Controller.ts       # Singleton class: export default new XController()
  ├── Routes.ts          # Express router with validators
  ├── services/          # Business logic (pure functions)
  │   ├── index.ts       # Export all services
  │   └── {feature}.ts   # Individual service functions
  └── types.ts           # TypeScript interfaces (optional)
```

**Example:** See `src/V201/Modules/quest/` for reference implementation.

### 2. **Path Aliases (tsconfig.json)**

```typescript
import userInfo from '@middleware/userInfo';      // src/middleware/userInfo.ts
import asyncHandler from '@shared/asyncHandler';  // src/shared/asyncHandler.ts
import createPrismaClient from '@shared/prisma';  // src/shared/prisma.ts
```

**Available aliases:** `@middleware`, `@shared`, `@services`, `@V201`, `@controller`

### 3. **Async Handler Pattern (MANDATORY)**

ALL async route handlers MUST be wrapped in `asyncHandler` to satisfy ESLint `no-misused-promises`:

```typescript
import asyncHandler from '@shared/asyncHandler';

router.post('/example',
  asyncHandler(userInfo.getCurrentUserInfo),  // ✅ Correct
  asyncHandler(Controller.method.bind(Controller))
);

// ❌ WRONG - Will fail ESLint
router.post('/wrong', async (req, res) => { ... });
```

**Important:** The `asyncHandler` is **generic** and automatically infers types from your controller methods. No need to specify type parameters manually - TypeScript will match the Request generics from your controller.

```typescript
// Controller with typed Request
async myMethod(
  req: Request<{ id: string }, Record<string, never>, MyBodyType>,
  res: Response
): Promise<Response | void> { ... }

// Route - asyncHandler automatically matches the types
router.post('/:id',
  asyncHandler(Controller.myMethod.bind(Controller))  // ✅ Type-safe!
);
```

### 4. **Standardized Response Format**

Use custom response methods added via middleware (`src/server/config/responseFormatter.ts`):

```typescript
// Success responses
return res.success(data, 'Message');           // 200 OK
return res.created(data, 'Created');           // 201 Created
return res.accepted(data, 'Processing');       // 202 Accepted

// Error responses
return res.badRequest('Invalid input', errors); // 400
return res.unauthorized('Auth required');       // 401
return res.forbidden('No permission');          // 403
return res.notFound('Not found', resourceId);   // 404
return res.conflict('Duplicate entry');         // 409
```

**Response structure:**
```json
{
  "status": "success|error",
  "message": "Human-readable message",
  "data": { ... },           // Only on success
  "errors": [ ... ],         // Only on errors
  "metadata": { ... }        // Optional
}
```

### 5. **Validation Pattern with express-validator**

Use `checkSchema` for request validation:

```typescript
// src/V201/MiddleWare/{module}/validators.ts
import { checkSchema, Schema } from 'express-validator';
import { getValidationRules } from '@V201/modules/common';

const MySchema: Schema = getValidationRules<MyBodyType>({
  field: {
    in: ['body'],
    notEmpty: { errorMessage: 'Field required' },
    isInt: { options: { min: 1 }, errorMessage: 'Must be positive integer' },
    toInt: true,  // Auto-convert string to number
  },
});

export const validateMyBody = checkSchema(MySchema);

// Routes.ts
import { validationResult } from 'express-validator';

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.badRequest('Validation failed', errors.array());
  }
  next();
};

router.post('/example',
  validateMyBody,
  handleValidationErrors,
  asyncHandler(Controller.method)
);
```

**Type conversions:** Use `toInt`, `toFloat`, `toBoolean` in validators to convert strings automatically.

### 6. **Controller Type Safety**

Controllers use TypeScript generics for type-safe request handling:

```typescript
import { Request, Response } from 'express';

class MyController {
  async myMethod(
    req: Request<{ id: string }, Record<string, never>, MyBodyType>,
    //            ↑ Params      ↑ ResBody (usually empty) ↑ Body
    res: Response
  ): Promise<Response | void> {
    const userId = req.currentUser?.id;  // Set by userInfo middleware
    const { field } = req.body;          // Type-safe from MyBodyType

    const result = await myService({ userId, field });
    return res.success(result, 'Success message');
  }
}

export default new MyController();  // Singleton pattern
```

### 7. **Hedera Smart Contract Error Handling**

When contract transactions fail, use `ContractErrorHandler` (see `docs/CONTRACT_ERROR_HANDLING.md`):

```typescript
import {
  getContractErrorDetails,
  EnhancedContractError
} from '@V201/services/ContractErrorHandler';

try {
  const tx = await contract.executeMethod(params);
  await tx.getRecord();
} catch (error) {
  // Extract detailed error from Hedera Mirror Node
  const errorDetails = await getContractErrorDetails(
    transactionId,
    contractInstance
  );

  throw new EnhancedContractError({
    message: errorDetails.decodedError || errorDetails.errorMessage,
    errorCode: errorDetails.errorCode,  // E001-E017 from contract
    transactionId: errorDetails.transactionId,
    hashscanUrl: errorDetails.hashscanUrl,
  });
}
```

**Contract error codes:** E001 (Invalid token), E002 (Insufficient balance), E003-E017 (see contract code).

### 8. **Prisma Client Pattern**

Use the factory function to get fresh instances:

```typescript
import createPrismaClient from '@shared/prisma';

async function myService() {
  const prisma = await createPrismaClient();

  const result = await prisma.campaign_twittercard.create({
    data: { ... },
  });

  return result;
}
```

**Important:** Prisma schema is in `prisma/schema.prisma`. Models use **snake_case** (e.g., `campaign_twittercard`, `user_user`).

### 9. **BigInt Handling**

Hedera uses BigInt for IDs. Use `JSONBigInt` for serialization:

```typescript
import JSONBigInt from 'json-bigint';

// Database: Store as BigInt
const questId: bigint = BigInt('123456789012345678');

// API: Accept as string, convert to BigInt
const { questId } = req.body;  // "123456789012345678"
await publishQuest({ questId: BigInt(questId), userId });

// Response: Automatically serialized by responseFormatter
return res.success({ questId });  // Serialized to string in JSON
```

---

## Development Workflows

### Build & Run

```bash
npm run dev           # Development with hot reload (nodemon)
npm run build         # Compile TypeScript to dist/
npm start             # Production server
npm run db:pull       # Sync Prisma schema from database
npm run db:push       # Push schema changes to database
```

### Docker Development

```bash
docker compose --profile dev up -d     # Full stack (DB + Redis + API)
docker compose ps                      # Check service status
docker compose logs -f api             # View API logs
docker compose down                    # Stop all services
```

**Services:** API (4000), PostgreSQL (5432), Redis (6379), Prisma Studio (5555), Monitoring (3001)

### Testing

```bash
npm run test:v201:safe --test-db      # Full test suite with test database
npm run test:v201:bdd                 # BDD-style tests
npm run test:v201:audit               # Audit test results
```

**Important:** Tests use a SEPARATE test database to avoid corrupting production data. See `SAFE_TESTING_GUIDE.md`.

---

## Code Conventions

### File Naming

- **Controllers:** `Controller.ts` (singular, PascalCase class)
- **Routes:** `Routes.ts` (exports router)
- **Services:** `{feature}.ts` (lowercase, descriptive)
- **Validators:** `validators.ts` (exports multiple validators)
- **Types:** `types.ts` or inline interfaces

### Error Handling

```typescript
// Service layer - throw errors
throw new Error('Campaign not found');

// Controller layer - catch and format
try {
  const result = await service();
  return res.success(result);
} catch (error: unknown) {
  logger.err(error);
  const message = error instanceof Error ? error.message : 'Unknown error';
  return res.badRequest(message);
}
```

### Logging

```typescript
import logger from 'jet-logger';

logger.info('User action', { userId, action });
logger.warn('Potential issue', { context });
logger.err(error);  // Automatically formats errors
```

### Authentication Flow

1. **userInfo.getCurrentUserInfo** - Extracts userId from JWT, sets `req.currentUser`
2. **auth.isHavingValidAst** - Validates access token
3. **admin.isAdmin** - Checks admin role

```typescript
router.post('/protected',
  asyncHandler(userInfo.getCurrentUserInfo),  // Sets req.currentUser
  asyncHandler(Controller.method)
);
```

---

## Common Pitfalls

1. **Don't use `{}` as type** - Use `Record<string, never>` for empty objects
2. **Always bind controller methods** - `Controller.method.bind(Controller)` in routes
3. **Check `req.currentUser?.id`** - May be undefined if middleware fails
4. **Validate BigInt strings** - Use regex `/^\d+$/` before `BigInt()`
5. **Don't forget `asyncHandler`** - ESLint will fail without it
6. **Import validators before controllers** - Validation runs first in middleware chain

---

## Key Files to Reference

- `src/V201/Modules/quest/` - Complete V201 module example
- `src/V201/MiddleWare/quest/validators.ts` - Validation pattern
- `src/server/config/responseFormatter.ts` - Response methods
- `src/shared/asyncHandler.ts` - Async wrapper
- `docs/CONTRACT_ERROR_HANDLING.md` - Hedera error handling
- `tsconfig.json` - Path aliases and compiler options

---

## When Creating New Features

1. **Use V201 architecture** - Create module in `src/V201/Modules/{name}/`
2. **Start with types** - Define TypeScript interfaces first
3. **Create validators** - Use express-validator with checkSchema
4. **Implement services** - Pure functions in `services/`
5. **Build controller** - Singleton class with typed request handlers
6. **Wire routes** - Validators → handleErrors → asyncHandler(userInfo) → asyncHandler(controller)
7. **Document** - Add brief comments, update docs if complex

**Follow existing patterns** - Copy structure from `quest` or `campaigns` modules.
