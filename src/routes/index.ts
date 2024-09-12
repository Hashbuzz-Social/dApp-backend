import authMiddleware from "@middleware/auth";
import { Router } from "express";
import adminRouter from "./admin";
import campaignRouter from "./campaign-router";
import integrationRouter from "./integrations";
import transactionRouter from "./transaction-router";
import userRouter from "./user-router";


// Export the base-router
const baseRouter = Router();

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
baseRouter.use("/users", authMiddleware.isHavingValidAst, userRouter);

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
baseRouter.use("/admin", authMiddleware.isHavingValidAst, authMiddleware.isAdminRequesting, adminRouter);

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
baseRouter.use("/campaign", authMiddleware.isHavingValidAst, campaignRouter);

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
baseRouter.use("/transaction", authMiddleware.isHavingValidAst, transactionRouter);

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
baseRouter.use("/integrations", authMiddleware.isHavingValidAst, integrationRouter);

export default baseRouter;