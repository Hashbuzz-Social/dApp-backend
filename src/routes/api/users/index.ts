import authMiddleware from "@middleware/auth";
import { Router } from "express";
import userRouter from "./routes";

// Export the base-router
const baseRouter = Router();


/**
 * @swagger
 * /api/users:
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