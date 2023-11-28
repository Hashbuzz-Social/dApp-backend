import authMiddleware from "@middleware/auth";
import userInfo from "@middleware/userInfo";
import { Router } from "express";
import adminRouter from "./admin";
import campaignRouter from "./campaign-router";
import transactionRouter from "./transaction-router";
import userRouter from "./user-router";
import integrationRouter from "./integrations";
import auth from "@middleware/auth";
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
baseRouter.use("/transaction", authMiddleware.isHavingValidAst, userInfo.getCurrentUserInfo, transactionRouter);

/**
 * Campaign API routes.
 *
 * @memberof baseRouter
 * @path /campaign
 * @middleware authMiddleware.isHavingValidAst
 * @handler campaignRouter
 */
baseRouter.use("/campaign", authMiddleware.isHavingValidAst, userInfo.getCurrentUserInfo, campaignRouter);

/**
 * Admin API routes.
 *
 * @memberof baseRouter
 * @path /admin
 * @middleware authMiddleware.isHavingValidAst
 * @middleware authMiddleware.isAdminRequesting
 * @handler adminRouter
 */
baseRouter.use("/admin", authMiddleware.isHavingValidAst, authMiddleware.isAdminRequesting, adminRouter);

baseRouter.use("/integrations", auth.isHavingValidAst, integrationRouter);

// Export default.
export default baseRouter;
