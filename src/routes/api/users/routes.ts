import { handleCurrentUser, handleGetAllUser, handleGetUserBalances, handleTokenBalReq, handleTokenContractBal, handleUpdateConcent, syncBal } from "@controller/User";
import adminMiddleWare from "@middleware/admin";
import userInfo from "@middleware/userInfo";
import { checkErrResponse, checkWalletFormat } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body, param } from "express-validator";

// Constants
const router = Router();

/**
 * @swagger
 * /api/users/all:
 *   get:
 *     summary: Get all users
 *     description: Get all users list allowed only for admin.
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get("/all", adminMiddleWare.isAdmin, handleGetAllUser);

/**
 * @swagger
 * /api/users/current:
 *   get:
 *     summary: Get the current user
 *     description: Retrieves the current user's information.
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get("/current", handleCurrentUser);

/**
 * @swagger
 * /api/users/update-concent:
 *   patch:
 *     summary: Update consent
 *     description: Updates the user's consent.
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: Successful response
 */
router.patch("/update-concent", handleUpdateConcent);

/**
 * @swagger
 * /api/users/get-balances:
 *   post:
 *     summary: Get user balances
 *     description: Retrieves the balances for the current user.
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountId:
 *                 type: string
 *                 description: The account ID of the user.
 *               contractBal:
 *                 type: boolean
 *                 description: Indicates whether to include contract balances.
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post("/get-balances", userInfo.getCurrentUserInfo, body("accountId").custom(checkWalletFormat), body("contractBal").isBoolean(), handleGetUserBalances);

/**
 * @swagger
 * /api/users/token-balances:
 *   get:
 *     summary: Get token balances
 *     description: Retrieves the token balances for the current user.
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get("/token-balances", userInfo.getCurrentUserInfo, handleTokenBalReq);

/**
 * @swagger
 * /api/users/token-contractbal/{tokenId}:
 *   get:
 *     summary: Get token contract balance
 *     description: Retrieves the contract balance for a specific token.
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the token.
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get("/token-contractbal/:tokenId", param("tokenId").custom(checkWalletFormat), checkErrResponse, userInfo.getCurrentUserInfo, handleTokenContractBal);

/**
 * @swagger
 * /api/users/sync-bal/{tokenId}:
 *   get:
 *     summary: Sync balance
 *     description: Synchronizes the balance for a specific token.
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the token.
 *     responses:
 *       200:
 *         description: Successful response
 */
router.get("/sync-bal/:tokenId", param("tokenId").custom(checkWalletFormat), checkErrResponse, userInfo.getCurrentUserInfo, syncBal);

export default router;