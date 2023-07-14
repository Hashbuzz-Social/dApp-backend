import {
  handleAddCampaigner,
  handleCampaignFundAllocation,
  handleCrateToupReq,
  handleGetActiveContract,
  handleReimbursement,
  handleTopUp,
} from "@controller/Transactions";
import { checkErrResponse, checkWalletFormat, validateEntityObject } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body } from "express-validator";

const router = Router();


/**
 * Create a top-up transaction.
 *
 * @route POST /api/create-topup-transaction
 * @param {Object} req.body - The request body.
 * @param {Object} req.body.entity - The entity object.
 * @param {string} req.body.entity.name - The name of the entity.
 * @param {string} req.body.entity.type - The type of the entity.
 * @param {string} req.body.connectedAccountId - The connected account ID.
 * @validator body("entity").custom(validateEntityObject)
 * @validator body("connectedAccountId").custom(checkWalletFormat)
 * @validator checkErrResponse
 * @handler handleCrateToupReq
 */
router.post(
  "/create-topup-transaction",
  body("entity").custom(validateEntityObject),
  body("connectedAccountId").custom(checkWalletFormat),
  checkErrResponse,
  handleCrateToupReq
);

/**
 * Perform a top-up transaction.
 *
 * @route POST /api/top-up
 * @param {Object} req.body - The request body.
 * @param {Object} req.body.entity - The entity object.
 * @param {string} req.body.entity.name - The name of the entity.
 * @param {string} req.body.entity.type - The type of the entity.
 * @param {string} req.body.transactionId - The transaction ID.
 * @validator body("entity").custom(validateEntityObject)
 * @validator body("transactionId").isString()
 * @validator checkErrResponse
 * @handler handleTopUp
 */
router.post("/top-up", body("entity").custom(validateEntityObject), body("transactionId").isString(), checkErrResponse, handleTopUp);

/**
 * Add a campaigner.
 *
 * @route POST /api/addCampaigner
 * @param {string} req.body.walletId - The wallet ID.
 * @validator body("walletId").custom(checkWalletFormat)
 * @validator checkErrResponse
 * @handler handleAddCampaigner
 */
router.post("/addCampaigner", body("walletId").custom(checkWalletFormat), checkErrResponse, handleAddCampaigner);

/**
 * Get the active contract ID.
 *
 * @route POST /api/activeContractId
 * @param {string} req.body.accountId - The account ID.
 * @validator body("accountId").custom(checkWalletFormat)
 * @validator checkErrResponse
 * @handler handleGetActiveContract
 */
router.post("/activeContractId", body("accountId").custom(checkWalletFormat), checkErrResponse, handleGetActiveContract);

/**
 * Add funds to a campaign.
 *
 * @route POST /api/add-campaign
 * @param {number} req.body.campaignId - The ID of the campaign.
 * @validator body("campaignId").isNumeric()
 * @validator checkErrResponse
 * @handler handleCampaignFundAllocation
 */
router.post("/add-campaign", body("campaignId").isNumeric(), checkErrResponse, handleCampaignFundAllocation);

/**
 * Perform a reimbursement.
 *
 * @route POST /api/reimbursement
 * @param {number} req.body.amount - The amount to be reimbursed.
 * @validator body("amount").isNumeric()
 * @validator checkErrResponse
 * @handler handleReimbursement
 */
router.post("/reimbursement", body("amount").isNumeric(), checkErrResponse, handleReimbursement);

export default router;
