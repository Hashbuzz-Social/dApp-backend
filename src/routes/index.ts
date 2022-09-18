import authMiddleware from "@middleware/auth";
import { Router } from "express";
import campaignRouter from './campaign-router';
import transactionRouter from "./transaction-router";
import userRouter from "./user-router";

// Export the base-router
const baseRouter = Router();

// Setup routers
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-misused-promises
baseRouter.use("/users", authMiddleware.isHavingValidAuthToken, userRouter);
baseRouter.use("/transaction", authMiddleware.isHavingValidAuthToken, transactionRouter);
baseRouter.use("/campaign", authMiddleware.isHavingValidAuthToken, campaignRouter);

// Export default.
export default baseRouter;
