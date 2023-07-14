import {
  handleCurrentUser,
  handleGetAllUser,
  handleGetUserBalances,
  handleTokenBalReq,
  handleUpdateConcent,
  handleUpdatePassword,
  handleWalletUpdate,
} from "@controller/User";
import adminMiddleWare from "@middleware/admin";
import { checkErrResponse, checkWalletFormat } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body } from "express-validator";
import { IsStrongPasswordOptions } from "express-validator/src/options";

// Constants
const router = Router();

/**
 * Strong password validation options.
 *
 * @type {IsStrongPasswordOptions}
 */
const passwordCheck: IsStrongPasswordOptions = {
  minLength: 8,
  minNumbers: 1,
  minLowercase: 1,
  minUppercase: 1,
  minSymbols: 1,
};

/**
 * Get all users.
 *
 * @route GET /api/users/all
 * @middleware adminMiddleWare.isAdmin
 * @handler handleGetAllUser
 */
router.get("/all", adminMiddleWare.isAdmin, handleGetAllUser);

/**
 * Get the current user.
 *
 * @route GET /api/users/current
 * @handler handleCurrentUser
 */
router.get("/current", handleCurrentUser);

/**
 * Update wallet ID for the current user.
 *
 * @route PUT /api/users/update/wallet
 * @bodyParam {string} walletId - The wallet ID to update.
 * @validator checkWalletFormat - Custom wallet format validation.
 * @handler handleWalletUpdate
 */
router.put("/update/wallet", body("walletId").custom(checkWalletFormat), handleWalletUpdate);

/**
 * Update concent.
 *
 * @route PATCH /api/users/update-concent
 * @handler handleUpdateConcent
 */
router.patch("/update-concent", handleUpdateConcent);

/**
 * Get user balances.
 *
 * @route POST /api/users/get-balances
 * @bodyParam {string} accountId - The account ID.
 * @validator checkWalletFormat - Custom wallet format validation.
 * @bodyParam {boolean} contractBal - Indicates whether to include contract balances.
 * @handler handleGetUserBalances
 */
router.post(
  "/get-balances",
  body("accountId").custom(checkWalletFormat),
  body("contractBal").isBoolean(),
  handleGetUserBalances
);

/**
 * Update password.
 *
 * @route PUT /api/users/update-password
 * @bodyParam {string} email - The user's email.
 * @bodyParam {string} password - The new password.
 * @validator checkErrResponse - Error response validation.
 * @validator body("password").isStrongPassword(passwordCheck) - Strong password validation.
 * @handler handleUpdatePassword
 */
router.put(
  "/update-password",
  body("email").isEmail(),
  body("password").isStrongPassword(passwordCheck),
  checkErrResponse,
  handleUpdatePassword
);

/**
 * Get token balances.
 *
 * @route GET /api/users/token-balances
 * @handler handleTokenBalReq
 */
router.get("/token-balances", handleTokenBalReq);

export default router;
