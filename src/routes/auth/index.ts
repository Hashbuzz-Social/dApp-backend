import { Router } from "express";
import authRoutes from "./routes";

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication related endpoints
 *   - name: WalletConnect
 *     description: WalletConnect related endpoints
 *   - name: HashConnect
 *     description: HashConnect related endpoints
 */

/**
 * @swagger
 * /auth:
 *   get:
 *     summary: Entry point for the API server
 *     description: This is the entry point for the API server.
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Successful response
 */
router.use(authRoutes);

export default router;
