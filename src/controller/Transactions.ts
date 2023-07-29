import { whiteListedTokens } from "@prisma/client";
import { getCampaignDetailsById } from "@services/campaign-service";
import htsServices from "@services/hts-services";
import { addCampaigner, addUserToContractForHbar, provideActiveContract } from "@services/smartcontract-service";
import { allocateBalanceToCampaign, createTopUpTransaction, reimbursementAmount, updateBalanceToContract } from "@services/transaction-service";
import userService from "@services/user-service";
import { ErrorWithCode } from "@shared/errors";
import { formatTokenBalancesObject } from "@shared/helper";
import { NextFunction, Request, Response } from "express";
import statusCodes from "http-status-codes";
import { CreateTranSactionEntity } from "src/@types/custom";
// import { topUpHandler } from "@controller/transaction.controller";

const { OK, CREATED, BAD_REQUEST, NON_AUTHORITATIVE_INFORMATION } = statusCodes;

/****
 *@description top-up handler
 */

export const handleTopUp = (req: Request, res: Response, next: NextFunction) => {
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
        // console.log("topUpHandler::topUpHandler");
        const tokenDetails = await htsServices.getEntityDetailsByTokenId(entity.entityId);

        if (!tokenDetails) return res.status(BAD_REQUEST).json({ error: true, message: "Wrong parameters provided" });
        const decimal = tokenDetails.tokendata.decimals;
        const amount = amounts.value * Math.pow(10, decimal);

        //update Balance to contract
        await htsServices.updateTokenTopupBalanceToContract(accountId, amount, entity.entityId);
        //update Balance to db;
        const balanceRecord = await userService.updateTokenBalanceForUser({ amount, operation: "increment", token_id: tokenDetails.id, decimal, user_id });

        return res.status(OK).json({
          success: true,
          message: `Token balance for ${tokenDetails.name}(${tokenDetails.token_symbol}) Update successfully`,
          balance: formatTokenBalancesObject(tokenDetails as any as whiteListedTokens, balanceRecord),
        });
      }

      if (req.currentUser?.id && accountId && entity.entityType === "HBAR") {
        if (req.currentUser.available_budget === 0) {
          await addUserToContractForHbar(accountId);
        }
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

/*****
 * @description Add campaign to smart contract handler.
 **/
export const handleAddCampaigner = (req: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const walletId: string = req.body.walletId;

      const addWalletAddressToCampaign = await addCampaigner(walletId, req.currentUser?.id);
      return res.status(CREATED).json(addWalletAddressToCampaign);
    })();
  } catch (err) {
    next(err);
  }
};

//===============================

/****
 *
 *@description Check active contract and return to the user.
 */

export const handleGetActiveContract = (req: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const activeContract = await provideActiveContract();
      return res.status(OK).json(activeContract);
    })();
  } catch (err) {
    next(err);
  }
};

/****
 *@description this function is handling crete topup transaction
 */

export const handleCrateToupReq = (req: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const entity: CreateTranSactionEntity = req.body.entity;
      const connectedAccountId = req.currentUser?.hedera_wallet_id;

      if (connectedAccountId) {
        const transactionBytes = await createTopUpTransaction(entity, connectedAccountId);
        return res.status(CREATED).json(transactionBytes);
      } else next(new ErrorWithCode("Error while processing request", BAD_REQUEST));
    })();
  } catch (err) {
    next(err);
  }
};

export const handleCampaignFundAllocation = (req: Request, res: Response, next: NextFunction) => {
  try {
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
  } catch (err) {
    next(err);
  }
};

export const handleReimbursement = (req: Request, res: Response, next: NextFunction) => {
  try {
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
  } catch (err) {
    next(err);
  }
};
