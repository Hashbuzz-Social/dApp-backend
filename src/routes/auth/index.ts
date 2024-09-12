import { Router } from "express";
import authRoutes from "./routes";

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
router.use("/auth", authRoutes);

export default router;
