import {
  handleActiveContractInfoReq,
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
} from "@controller/Admin";
import { handleGetAllUser } from "@controller/User";
import userInfo from "@middleware/userInfo";
import { checkErrResponse, checkWalletFormat } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body, query } from "express-validator";
import { IsStrongPasswordOptions } from "express-validator/src/options";

const router = Router();

const cardTypes = ["Pending", "Completed", "Running"];
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
router.get("/active-contract", handleActiveContractInfoReq);

router.get("/campaign-logs/:id", handleGetCmapingLogs);

router.post("/user/all" , handleGetAllUser);
router.patch("/user/allowCampaigner" , handleAllowAsCampaigner);
router.get('campaigns/all',  )


router.patch('/biz-handle' , body("userId").isNumeric() , checkErrResponse ,  handleDeleteBizHanlde)

router.patch('/personal-handle' , body("userId").isNumeric() , checkErrResponse , handleDeletePerosnalHanlde)

export default router;
