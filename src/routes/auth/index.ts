import { Router } from "express";
import authRoutes from "./routes";
import walletConnectRoutes from "./walletConnect";

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
router.use("/", authRoutes);
router.use("/walletConnect/", walletConnectRoutes);

export default router;
