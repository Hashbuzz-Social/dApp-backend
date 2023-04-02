import { whiteListedTokens } from "@prisma/client";
import { getCampaignDetailsById } from "@services/campaign-service";
import htsServices from "@services/hts-services";
import { addCampaigner, getSMInfo, provideActiveContract } from "@services/smartcontract-service";
import { allocateBalanceToCampaign, createTopUpTransaction, reimbursementAmount, updateBalanceToContract } from "@services/transaction-service";
import userService from "@services/user-service";
import { formatTokenBalancesObject } from "@shared/helper";
import { checkErrResponse, checkWalletFormat, validateEntityObject } from "@validator/userRoutes.validator";
import { NextFunction, Request, Response, Router } from "express";
import { body } from "express-validator";
import statusCodes from "http-status-codes";
import { CreateTranSactionEntity } from "src/@types/custom";
// import { topUpHandler } from "@controller/transaction.controller";

// Constants
const router = Router();
const { OK, CREATED, BAD_REQUEST, NON_AUTHORITATIVE_INFORMATION } = statusCodes;
// Paths

//@handlers

//===============================

/****
 *@description top-up handler
 */

const topUpHandler = (req: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const accountId = req.currentUser?.hedera_wallet_id;
      const user_id = req.currentUser?.id;
      const entity: CreateTranSactionEntity = req.body.entity;
      const amounts = entity.amount;

      if (!accountId || !amounts?.value || !amounts.fee || !amounts.total || !user_id) {
        return res.status(BAD_REQUEST).json({ error: true, message: "amounts is incorrect" });
      }

      if (entity.entityType === "FUNGIBLE_COMMON" && entity.entityId) {
        const tokenDetails = await htsServices.getEntityDetailsByTokenId(entity.entityId);

        if (!tokenDetails) return res.status(BAD_REQUEST).json({ error: true, message: "Wrong parameters provided" });
        const decimal = tokenDetails.tokendata.decimals;
        const amount = amounts.value * Math.pow(10, decimal);

        //update Balance to contract
        await htsServices.updateTokenTopupBalanceToContract(accountId, amount, entity.entityId);
        //update Balance to db;
        const balanceRecord = await userService.updateTokenBalanceForUser({ amount, operation: "increment", token_id: tokenDetails.id, decimal, user_id });

        return res
          .status(OK)
          .json({
            success: true,
            message: `Token balance for ${tokenDetails.name}(${tokenDetails.token_symbol}) Update successfully`,
            balance: formatTokenBalancesObject(tokenDetails as any as whiteListedTokens, balanceRecord),
          });
      }

      if (req.currentUser?.id && accountId && entity.entityType === "HBAR") {
        await updateBalanceToContract(accountId, amounts);
        const topUp = await userService.topUp(req.currentUser?.id, amounts.value * 1e8, "increment");
        return res.status(OK).json({ success: true, message: "Hbar(ℏ) budget update successfully", available_budget: topUp.available_budget });
      }
      return res.status(BAD_REQUEST).json({ message: "Error while processing request." });
    })();
  } catch (err) {
    next(err);
  }
};

//===============================

/*****
 * @description Add campaign to smart contract handler.
 **/
function addCampaignerHandlers(req: Request, res: Response) {
  (async () => {
    const walletId: string = req.body.walletId;

    const addWalletAddressToCampaign = await addCampaigner(walletId, req.currentUser?.id);
    return res.status(CREATED).json(addWalletAddressToCampaign);
  })();
}

//===============================

/****
 *
 *@description Check active contract and return to the user.
 */

function activeContractHandler(req: Request, res: Response) {
  (async () => {
    const activeContract = await provideActiveContract();
    return res.status(OK).json(activeContract);
  })();
}

//===============================

/****
 *@description this function is handling crete topup transaction
 */

const creteTopUpHandler = (req: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const entity: CreateTranSactionEntity = req.body.entity;

      const payeeId = req.currentUser?.hedera_wallet_id;
      const connectedAccountId: string = req.body.connectedAccountId;

      if (payeeId && connectedAccountId) {
        const transactionBytes = await createTopUpTransaction(entity, connectedAccountId);
        return res.status(CREATED).json(transactionBytes);
      }
      return res.status(BAD_REQUEST).json({ error: true, message: "Connect your wallet first." });
    })();
  } catch (err) {
    next(err);
  }
};

function handleCampaignFundAllocation(req: Request, res: Response) {
  (async () => {
    const campaignId: number = req.body.campaignId;

    //! get campaignById
    const campaignDetails = await getCampaignDetailsById(campaignId);

    if (campaignDetails && campaignDetails.campaign_budget && campaignDetails.user_user?.hedera_wallet_id && campaignDetails.owner_id) {
      const amounts = Math.round(campaignDetails?.campaign_budget * Math.pow(10, 8));
      const campaignerAccount = campaignDetails.user_user?.hedera_wallet_id;
      const campaignerId = campaignDetails.owner_id;

      //?  call the function to update the balances of the camp
      const { transactionId, receipt } = await allocateBalanceToCampaign(campaignDetails.id, amounts, campaignerAccount);
      await userService.topUp(campaignerId, amounts, "decrement");

      return res.status(CREATED).json({ transactionId, receipt });
    }

    return res.status(NON_AUTHORITATIVE_INFORMATION).json({ error: true, message: "CampaignIs is not correct" });
  })();
}

function handleContractInfoReq(_: Request, res: Response) {
  (async () => {
    const info = await getSMInfo();
    if (info) return res.status(OK).json(info);
    return res.status(BAD_REQUEST).json({ error: true });
  })();
}

function handleReimbursement(req: Request, res: Response) {
  (async () => {
    const amount: number = req.body.amount;

    if (!req.currentUser?.id || !req.currentUser?.hedera_wallet_id) {
      return res.status(BAD_REQUEST).json({ error: true, message: "Sorry This request can't be completed." });
    }

    if (!req.currentUser?.available_budget || (req.currentUser?.available_budget && req.currentUser?.available_budget < amount)) {
      return res.status(BAD_REQUEST).json({ error: true, message: "Insufficient available amount in user's account." });
    }

    const reimbursementTransaction = await reimbursementAmount(req.currentUser?.id, amount, req.currentUser.hedera_wallet_id);
    return res.status(OK).json(reimbursementTransaction);
  })();
}

router.post(
  "/create-topup-transaction",
  body("entity").custom(validateEntityObject),
  body("connectedAccountId").custom(checkWalletFormat),
  checkErrResponse,
  creteTopUpHandler
);
router.post("/top-up", body("entity").custom(validateEntityObject), body("transactionId").isString(), checkErrResponse, topUpHandler);
router.post("/addCampaigner", body("walletId").custom(checkWalletFormat), checkErrResponse, addCampaignerHandlers);
router.post("/activeContractId", body("accountId").custom(checkWalletFormat), checkErrResponse, activeContractHandler);
router.post("/add-campaign", body("campaignId").isNumeric(), checkErrResponse, handleCampaignFundAllocation);
router.post("/reimbursement", body("amount").isNumeric(), checkErrResponse, handleReimbursement);
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post("/contract-info", handleContractInfoReq);

export default router;

