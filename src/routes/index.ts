import authMiddleware from "@middleware/auth";
import { Router } from "express";
import campaignRouter from "./campaign-router";
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
 * @middleware authMiddleware.isHavingValidAst
 * @handler userRouter
 */
baseRouter.use("/users", authMiddleware.isHavingValidAst, userRouter);

/**
 * Transaction API routes.
 *
 * @memberof baseRouter
 * @path /transaction
 * @middleware authMiddleware.isHavingValidAst
 * @handler transactionRouter
 */
baseRouter.use("/transaction", authMiddleware.isHavingValidAst, transactionRouter);

/**
 * Campaign API routes.
 *
 * @memberof baseRouter
 * @path /campaign
 * @middleware authMiddleware.isHavingValidAst
 * @handler campaignRouter
 */
baseRouter.use("/campaign", authMiddleware.isHavingValidAst, campaignRouter);

/**
 * Admin API routes.
 *
 * @memberof baseRouter
 * @path /admin
 * @middleware authMiddleware.isHavingValidAst
 * @middleware authMiddleware.isAdminRequesting
 * @handler adminRouter
 */
// baseRouter.use("/admin", authMiddleware.isHavingValidAst, authMiddleware.isAdminRequesting, adminRouter);

// Export default.
export default baseRouter;
