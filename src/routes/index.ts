import { Router } from "express";
import userRouter from "./user-router";
import transactionRouter from "./transaction-router";
import { isHavingValidAuthToken } from "@middleware/auth";

// Export the base-router
const baseRouter = Router();

// Setup routers
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-misused-promises
baseRouter.use("/users", isHavingValidAuthToken, userRouter);
baseRouter.use("/transaction", isHavingValidAuthToken, transactionRouter);

// Export default.
export default baseRouter;
