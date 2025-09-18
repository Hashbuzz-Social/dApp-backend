import authMiddleware from "@middleware/auth";
import { Router } from "express";
import adminRouter from "./admin";
import campaignRouter from "./campaign-router";
import integrationRouter from "./integrations";
import transactionRouter from "./transaction-router";
import userRouter from "./user-router";
import userInfo from "@middleware/userInfo";
import { asyncHandler } from '@shared/asyncHandler';
import { V201Router } from '../V201';

// Export the base-router
const baseRouter = Router();

// Health check endpoint - no authentication required
baseRouter.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin || 'no-origin',
    userAgent: req.headers['user-agent'],
    corsHeaders: {
      'access-control-allow-origin': res.getHeader(
        'access-control-allow-origin'
      ),
      'access-control-allow-credentials': res.getHeader(
        'access-control-allow-credentials'
      ),
    },
  });
});

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User API routes
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get user information
 *     tags: [Users]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
baseRouter.use(
  '/users',
  asyncHandler(authMiddleware.isHavingValidAst),
  userRouter
);

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin API routes
 */

/**
 * @swagger
 * /admin:
 *   get:
 *     summary: Admin API routes
 *     tags: [Admin]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
baseRouter.use(
  '/admin',
  asyncHandler(authMiddleware.isHavingValidAst),
  asyncHandler(authMiddleware.isAdminRequesting),
  adminRouter
);

/**
 * @swagger
 * tags:
 *   name: Campaigns
 *   description: Campaign API routes
 */

/**
 * @swagger
 * /campaigns:
 *   get:
 *     summary: Campaign API routes
 *     tags: [Campaigns]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
baseRouter.use(
  '/campaign',
  asyncHandler(authMiddleware.isHavingValidAst),
  campaignRouter
);

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Transaction API routes
 */

/**
 * @swagger
 * /transactions:
 *   get:
 *     summary: Transaction API routes
 *     tags: [Transactions]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
baseRouter.use(
  '/transaction',
  asyncHandler(authMiddleware.isHavingValidAst),
  asyncHandler(userInfo.getCurrentUserInfo),
  transactionRouter
);

/**
 * @swagger
 * tags:
 *   name: Integrations
 *   description: Integration API routes
 */

/**
 * @swagger
 * /integrations:
 *   get:
 *     summary: Integration API routes
 *     tags: [Integrations]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
baseRouter.use(
  '/integrations',
  asyncHandler(authMiddleware.isHavingValidAst),
  integrationRouter
);

/**
 * @swagger
 * tags:
 *   name: V201 Campaigns
 *   description: V201 Campaign API routes with new rewarding mechanism
 */

/**
 * @swagger
 * /v201:
 *   get:
 *     summary: V201 Campaign API routes
 *     tags: [V201 Campaigns]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Successful response
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
baseRouter.use(
  '/v201',
  asyncHandler(authMiddleware.isHavingValidAst),
  V201Router
);

export default baseRouter;
