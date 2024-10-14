import { handleAdminLogin, handleAuthPing, handleLogout, handleRefreshToken } from "@controller/Auth";
import { handleTwitterBizRegister, handleTwitterReturnUrl } from "@controller/Integrations";
import auth from "@middleware/auth";
import userInfo from "@middleware/userInfo";
import { checkErrResponse } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body } from "express-validator";
import { IsStrongPasswordOptions } from "express-validator/src/options";
import hashConnectRoutes from "./hashconnect";
import walletConnectRoutes from "./walletConnect";

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     RefreshToken:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 *           description: The refresh token
 *       example:
 *         refreshToken: your_refresh_token_here
 */

const passwordCheck: IsStrongPasswordOptions = {
  minLength: 8,
  minNumbers: 1,
  minLowercase: 1,
  minUppercase: 1,
  minSymbols: 1,
};

const router = Router();

/**
 * @swagger
 * /logout:
 *   post:
 *     summary: Logout the user
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully logged out
 */
router.post("/logout", auth.isHavingValidAst, userInfo.getCurrentUserInfo, handleLogout);

/**
 * @swagger
 * /refresh-token:
 *   post:
 *     summary: Refresh the access token
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshToken'
 *     responses:
 *       200:
 *         description: Successfully refreshed token
 */
router.post("refresh-token", auth.isHavingValidAst, body("refreshToken").isString(), checkErrResponse, handleRefreshToken);

/**
 * @swagger
 * /twitter-return:
 *   get:
 *     summary: Handle Twitter return URL
 *     responses:
 *       200:
 *         description: Successfully handled Twitter return
 */
router.get("/twitter-return", handleTwitterReturnUrl);

/**
 * @swagger
 * /business-twitter-return:
 *   get:
 *     summary: Handle Twitter business registration return URL
 *     responses:
 *       200:
 *         description: Successfully handled Twitter business registration return
 */
router.get("/business-twitter-return", handleTwitterBizRegister);

/**
 * @swagger
 * /admin-login:
 *   post:
 *     summary: Admin login
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 description: The admin password
 *     responses:
 *       200:
 *         description: Successfully logged in as admin
 */
router.post("/admin-login", auth.isHavingValidAst, auth.isAdminRequesting, userInfo.getCurrentUserInfo, body("password").isStrongPassword(passwordCheck), handleAdminLogin);

/**
 * @swagger
 * /ping:
 *   get:
 *     summary: Ping the server to check authentication status
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully pinged
 */
router.get("/ping", auth.deviceIdIsRequired, auth.isHavingValidAst, handleAuthPing);

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

export default router;
