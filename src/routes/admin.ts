import {
  handleAllowAsCampaigner,
  handleDeleteBizHanlde,
  handleDeletePerosnalHanlde,
  handleGetAllCard,
  handleGetAllCardPendingCards,
  handleGetAllWLToken,
  handleGetCmapingLogs,
  handleTokenInfoReq,
  handleUpdateCard,
  handleUpdatePasswordReq,
  handleWhiteListToken,
  handleGetTrailsettters,
  updateTrailsettersData,
  // Transaction management handlers
  handleGetAllTransactions,
  handleGetTransactionById,
  handleUpdateTransactionStatus,
  handleGetTransactionStats,
  handleGetRecentTransactions,
  handleDeleteTransaction,
  handleRetryTransaction,
} from '@controller/Admin';
import { handleGetAllUser } from "@controller/User";
import userInfo from "@middleware/userInfo";
import auth from '@middleware/auth';
import { checkErrResponse, checkWalletFormat } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body, query } from "express-validator";
import { IsStrongPasswordOptions } from "express-validator/src/options";
import asyncHandler from '@shared/asyncHandler';

const router = Router();

const cardTypes = ["Pending", "Completed", "Running"];
/**
 * Configuration options for checking the strength of a password.
 *
 * @property {number} minLength - Minimum length of the password.
 * @property {number} minNumbers - Minimum number of numeric characters required.
 * @property {number} minLowercase - Minimum number of lowercase alphabetic characters required.
 * @property {number} minUppercase - Minimum number of uppercase alphabetic characters required.
 * @property {number} minSymbols - Minimum number of special characters required.
 */
const passwordCheck: IsStrongPasswordOptions = {
  minLength: 8,
  minNumbers: 1,
  minLowercase: 1,
  minUppercase: 1,
  minSymbols: 1,
};

/**
 * Get all Twitter cards.
 *
 * @api GET /api/twitter-card
 * @param {string} req.query.status - The status of the cards. Must be one of: Pending, Completed, Running.
 * @validator query("status").isIn(cardTypes)
 * @validator checkErrResponse
 * @handler handleGetAllCard
 */
router.get("/twitter-card", query("status").isIn(cardTypes), checkErrResponse, handleGetAllCard);

router.get("/twitter-pending-cards", checkErrResponse, handleGetAllCardPendingCards);

router.put("/update-status", body("id").isNumeric(), body("approve").isBoolean(), checkErrResponse, handleUpdateCard);

/**
 * Update password.
 *
 * @api PUT /api/update-password
 * @param {string} req.body.email - The email (optional).
 * @param {string} req.body.password - The new password.
 * @validator body("email").optional().isEmail()
 * @validator body("password").isStrongPassword(passwordCheck)
 * @validator checkErrResponse
 * @handler handleUpdatePassword
 */
router.put("/update-password", userInfo.getCurrentUserInfo, body("password").isStrongPassword(passwordCheck), checkErrResponse, handleUpdatePasswordReq);

/**
 * Update email.
 *
 * @api PATCH /api/update-email
 * @param {string} req.body.email - The new email.
 * @param {string} req.body.password - The current password.
 * @validator body("email").isEmail()
 * @validator body("password").isStrongPassword(passwordCheck)
 * @validator checkErrResponse
 * @handler handleUpdateEmailReq
 */
// router.patch("/update-email", body("email").isEmail(), body("password").isStrongPassword(passwordCheck), checkErrResponse, handleUpdateEmailReq);

/**
 * Get token information.
 *
 * @api POST /api/token-info
 * @param {string} req.body.tokenId - The token ID.
 * @validator body("tokenId").custom(checkWalletFormat)
 * @validator checkErrResponse
 * @handler handleTokenInfoReq
 */
router.post("/token-info", body("tokenId").custom(checkWalletFormat), checkErrResponse, handleTokenInfoReq);

/**
 * List a token.
 *
 * @api POST /api/list-token
 * @param {string} req.body.tokenId - The token ID.
 * @param {Object} req.body.tokenData - The token data object.
 * @param {string} req.body.token_type - The type of the token.
 * @validator body("tokenId").custom(checkWalletFormat)
 * @validator body("tokenData").isObject()
 * @validator body("token_type").isString()
 * @validator checkErrResponse
 * @handler handleWhiteListToken
 */
router.post("/list-token", body("token_id").custom(checkWalletFormat), body("tokendata").isString(), body("token_type").isString(), checkErrResponse, userInfo.getCurrentUserInfo, handleWhiteListToken);

/**
 * Get all listed tokens.
 *
 * @api GET /api/listed-tokens
 * @handler handleGetAllWLToken
 */
router.get("/listed-tokens", handleGetAllWLToken);

/**
 * Get active contract information.
 *
 * @api GET /api/active-contract
 * @handler handleActiveContractInfoReq
 */
// router.get("/active-contract", handleActiveContractInfoReq);

router.get("/campaign-logs/:id", handleGetCmapingLogs);

router.post("/user/all", handleGetAllUser);
router.patch("/user/allowCampaigner", handleAllowAsCampaigner);
router.get('campaigns/all',)


router.patch('/biz-handle', body("userId").isNumeric(), checkErrResponse, handleDeleteBizHanlde)

router.patch('/personal-handle', body("userId").isNumeric(), checkErrResponse, handleDeletePerosnalHanlde)

router.get("/trailsetters", handleGetTrailsettters)
router.put("/trailsetters", body("accounts").isArray(), checkErrResponse, updateTrailsettersData)

// ============================================================================
// TRANSACTION MANAGEMENT ROUTES
// ============================================================================

/**
 * Get all transactions with filtering and pagination
 * @api GET /api/admin/transactions
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 20)
 * @query {string} status - Filter by status
 * @query {string} transaction_type - Filter by transaction type
 * @query {string} network - Filter by network
 */
router.get("/transactions",
  asyncHandler(auth.isHavingValidAst),
  asyncHandler(auth.isAdminRequesting),
  asyncHandler(handleGetAllTransactions)
);

/**
 * Get transaction statistics
 * @api GET /api/admin/transactions/stats
 */
router.get("/transactions/stats",
  asyncHandler(auth.isHavingValidAst),
  asyncHandler(auth.isAdminRequesting),
  asyncHandler(handleGetTransactionStats)
);

/**
 * Get recent transactions
 * @api GET /api/admin/transactions/recent
 * @query {number} limit - Number of recent transactions (default: 10)
 */
router.get("/transactions/recent",
  asyncHandler(auth.isHavingValidAst),
  asyncHandler(auth.isAdminRequesting),
  asyncHandler(handleGetRecentTransactions)
);

/**
 * Get transaction by ID
 * @api GET /api/admin/transactions/:id
 * @param {string} id - Transaction ID
 */
router.get("/transactions/:id",
  asyncHandler(auth.isHavingValidAst),
  asyncHandler(auth.isAdminRequesting),
  asyncHandler(handleGetTransactionById)
);

/**
 * Update transaction status
 * @api PUT /api/admin/transactions/status
 * @body {string} id - Transaction ID
 * @body {string} status - New status (pending, completed, failed, cancelled, processing)
 */
router.put("/transactions/status",
  asyncHandler(auth.isHavingValidAst),
  asyncHandler(auth.isAdminRequesting),
  body("id").isNumeric().withMessage("Transaction ID must be numeric"),
  body("status").isString().isLength({ min: 1 }).withMessage("Status is required"),
  checkErrResponse,
  asyncHandler(handleUpdateTransactionStatus)
);

/**
 * Retry failed transaction
 * @api POST /api/admin/transactions/:id/retry
 * @param {string} id - Transaction ID
 */
router.post("/transactions/:id/retry",
  asyncHandler(auth.isHavingValidAst),
  asyncHandler(auth.isAdminRequesting),
  asyncHandler(handleRetryTransaction)
);

/**
 * Delete transaction (soft delete)
 * @api DELETE /api/admin/transactions/:id
 * @param {string} id - Transaction ID
 */
router.delete("/transactions/:id",
  asyncHandler(auth.isHavingValidAst),
  asyncHandler(auth.isAdminRequesting),
  asyncHandler(handleDeleteTransaction)
);

export default router;
