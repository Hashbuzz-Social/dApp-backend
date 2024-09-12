import { Router } from "express";
import limiter from "../../server/config/rateLimit";
import apiRouter from "../index";

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
router.use("/api",  limiter ,  apiRouter);

export default router;