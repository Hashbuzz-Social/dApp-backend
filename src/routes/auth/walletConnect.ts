import { createChallenge, vertifyResponseAndGenrateToekn } from "@controller/WalletConnectAuth";
import auth from "@middleware/auth";
import { checkErrResponse } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body } from "express-validator";

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: WalletConnect
 *     description: WalletConnect related endpoints
 */

/**
 * @swagger
 * /auth/walletConnect/create-challenge:
 *   get:
 *     summary: Create a challenge
 *     tags: [WalletConnect]
 *     responses:
 *       200:
 *         description: Successfully created challenge
 */
router.get("/create-challange", auth.deviceIdIsRequired, createChallenge);

/**
 * @swagger
 * /auth/walletConnect/verify-response:
 *   post:
 *     summary: Verify response and generate token
 *     tags: [WalletConnect]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payload:
 *                 type: object
 *                 description: The payload to verify
 *     responses:
 *       200:
 *         description: Successfully verified response and generated token
 *       400:
 *         description: Invalid request
 */
router.post("/verify-response", auth.deviceIdIsRequired, body().isObject(), checkErrResponse, vertifyResponseAndGenrateToekn);

export default router;
