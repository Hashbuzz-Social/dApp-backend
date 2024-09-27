import { Router } from "express";
import authRoutes from "./routes";
import walletConnectRoutes from "./walletConnect";
import hashConnectRoutes from "./hashconnect";

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
 * /auth/walletconnect:
 *   get:
 *     summary: WalletConnect related endpoints
 *     description: Entry point for WalletConnect related operations.
 *     tags: [WalletConnect]
 *     responses:
 *       200:
 *         description: Successful response
 */
router.use("/walletconnect", walletConnectRoutes);

/**
 * @swagger
 * /auth/hashconnect:
 *   get:
 *     summary: HashConnect related endpoints
 *     description: Entry point for HashConnect related operations.
 *     tags: [HashConnect]
 *     responses:
 *       200:
 *         description: Successful response
 */
router.use("/hashconnect", hashConnectRoutes);

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
