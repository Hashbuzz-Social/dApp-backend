import { Router } from "express";
import apiRouter from "../index";
import authMiddleware from "@middleware/auth";
import { V201Router } from "src/V201";
import asyncHandler from "@shared/asyncHandler";

const router = Router();
/**
 * @swagger
 * /api:
 *   get:
 *     summary: Entry point for the API server
 *     description: This is the entry point for the API server.
 *     responses:
 *       200:
 *         description: Successful response
 */
router.use("/api", apiRouter);
router.use('/v201', asyncHandler(authMiddleware.isHavingValidAst), V201Router);

export default router;
