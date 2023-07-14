import authMiddleware from "@middleware/auth";
import { Router } from "express";
import campaignRouter from './campaign-router';
import transactionRouter from "./transaction-router";
import userRouter from "./user-router";
import adminRouter from "./admin";

// Export the base-router
const baseRouter = Router();

/**
 * Base API router.
 *
 * @namespace baseRouter
 */

/**
 * User API routes.
 *
 * @memberof baseRouter
 * @path /users
 * @middleware authMiddleware.isHavingValidAuthToken
 * @handler userRouter
 */
baseRouter.use("/users", authMiddleware.isHavingValidAuthToken, userRouter);

/**
 * Transaction API routes.
 *
 * @memberof baseRouter
 * @path /transaction
 * @middleware authMiddleware.isHavingValidAuthToken
 * @handler transactionRouter
 */
baseRouter.use("/transaction", authMiddleware.isHavingValidAuthToken, transactionRouter);

/**
 * Campaign API routes.
 *
 * @memberof baseRouter
 * @path /campaign
 * @middleware authMiddleware.isHavingValidAuthToken
 * @handler campaignRouter
 */
baseRouter.use("/campaign", authMiddleware.isHavingValidAuthToken, campaignRouter);

/**
 * Admin API routes.
 *
 * @memberof baseRouter
 * @path /admin
 * @middleware authMiddleware.isHavingValidAuthToken
 * @middleware authMiddleware.isAdminRequesting
 * @handler adminRouter
 */
baseRouter.use("/admin", authMiddleware.isHavingValidAuthToken, authMiddleware.isAdminRequesting, adminRouter);

// Export default.
export default baseRouter;
