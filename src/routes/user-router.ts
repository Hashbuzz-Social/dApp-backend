/* eslint-disable @typescript-eslint/no-misused-promises */
import { handleCurrentUser, handleGetAllUser, handleGetUserBalances, handleTokenBalReq, handleTokenContractBal, handleUpdateConcent, syncBal } from "@controller/User";
import adminMiddleWare from "@middleware/admin";
import userInfo from "@middleware/userInfo";
import { checkErrResponse, checkWalletFormat } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body, param } from "express-validator";

// Constants
const router = Router();


/**
 * Get all users.
 *
 * @api GET /api/users/all
 * @middleware adminMiddleWare.isAdmin
 * @handler handleGetAllUser
 */
router.get("/all", adminMiddleWare.isAdmin, handleGetAllUser);

/**
 * Get the current user.
 *
 * @api GET /api/users/current
 * @handler handleCurrentUser
 */
router.get("/current", handleCurrentUser);

// router.put("/update/wallet", body("walletId").custom(checkWalletFormat), handleWalletUpdate);

/**
 * Update concent.
 *
 * @api PATCH /api/users/update-concent
 * @handler handleUpdateConcent
 */
router.patch("/update-concent", handleUpdateConcent);

/**
 * Get user balances.
 *
 * @api POST /api/users/get-balances
 * @bodyParam {string} accountId - The account ID.
 * @validator checkWalletFormat - Custom wallet format validation.
 * @bodyParam {boolean} contractBal - Indicates whether to include contract balances.
 * @handler handleGetUserBalances
 */
router.post("/get-balances", userInfo.getCurrentUserInfo, body("accountId").custom(checkWalletFormat), body("contractBal").isBoolean(), handleGetUserBalances);

// router.put(
//   "/update-password",
//   body("email").isEmail(),
//   body("password").isStrongPassword(passwordCheck),
//   checkErrResponse,
//   handleUpdatePassword
// );

/**
 * Get token balances.
 *
 * @api GET /api/users/token-balances
 * @handler handleTokenBalReq
 */
router.get("/token-balances", userInfo.getCurrentUserInfo, handleTokenBalReq);

router.get("/token-contractbal/:tokenId" , param("tokenId").custom(checkWalletFormat) , checkErrResponse , userInfo.getCurrentUserInfo , handleTokenContractBal)

router.get("/sync-bal/:tokenId" , param("tokenId").custom(checkWalletFormat) , checkErrResponse , userInfo.getCurrentUserInfo , syncBal)

export default router;
