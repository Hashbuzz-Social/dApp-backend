/* eslint-disable max-len */
import { getCampaignDetailsById } from "@services/campaign-service";
import client from "@services/hedera-service";
import htsServices from "@services/hts-services";
import { addCampaigner, addUserToContractForHbar, provideActiveContract } from "@services/smartcontract-service";
import { allocateBalanceToCampaign, createTopUpTransaction, reimbursementAmount, reimbursementFungible, updateBalanceToContract, updateFungibleAmountToContract, validateTransactionFormNetwork } from "@services/transaction-service";
import userService from "@services/user-service";
import { ErrorWithCode } from "@shared/errors";
import { waitFor } from "@shared/helper";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import statusCodes from "http-status-codes";
import { CreateTranSactionEntity } from "src/@types/custom";
// import { topUpHandler } from "@controller/transaction.controller";

const { OK, CREATED, BAD_REQUEST, NON_AUTHORITATIVE_INFORMATION, ACCEPTED } = statusCodes;

/****
 *@description top-up handler
 * Step 1. Validate the transaction from the network.
 * Step 2. Then get the entity type and validate with the transaction too.
 */

export const handleTopUp = async (req: Request, res: Response, next: NextFunction) => {

    const accountId = req.currentUser?.hedera_wallet_id;
    const user_id = req.currentUser?.id;
    const entity: CreateTranSactionEntity = req.body.entity;
    const amounts = entity.amount;
    const address = entity?.entityId;
    const transactionId: string = req.body.transactionId;
    const response: string = req.body.response;
    let tokenDetails;
    try {
    if (!accountId || !amounts?.value || !amounts.fee || !amounts.total || !user_id || !address) {
      return res.status(BAD_REQUEST).json({ error: true, message: "amounts is incorrect" });
    }

    if (entity.entityType === "fungible" && entity.entityId) {
      tokenDetails = await htsServices.getEntityDetailsByTokenId(entity.entityId);
      if (!tokenDetails) return res.status(BAD_REQUEST).json({ error: true, message: "Wrong fungible token provided" });
    }

    if (req.currentUser?.id && accountId && entity.entityType === "HBAR" && address) {
      const status = await addUserToContractForHbar(address, user_id);
      if (!status)
        return res.status(BAD_REQUEST).json({
          error: true,
          message: "Failed to add user to contract for HBAR",
        });
    }

    res.status(ACCEPTED).json({
      success: true,
      message: "Transaction validation in progress.Balance will be updated in few seconds.Do not close the browser.",
    });

    //Wait for 5 sec first;
    await waitFor(10000);

    //validate transaction id;
    const validate = await validateTransactionFormNetwork(transactionId, accountId);

    //create a transaction record;
    await prisma.transactions.create({
      data: {
        transaction_data: response,
        transaction_id: transactionId,
        transaction_type: "topup",
        network: client.network,
        amount: amounts.total,
        status: validate.validated ? "validated" : validate.status,
      },
    });


    if (validate.validated && entity.entityType === "HBAR") {
      // transaction is validated;
      // Update the record in the smart contract;
      await updateBalanceToContract(address, amounts);
      await userService.topUp(user_id, validate.amount, "increment");
    }

    if (validate.validated && validate.token_id && entity.entityType === "fungible" && tokenDetails) {
      const decimal = Number(tokenDetails.decimals);
      // update record to the smart contract
      await updateFungibleAmountToContract(accountId, validate.amount, validate.token_id);
      // updating balance record for the user.
      await userService.updateTokenBalanceForUser({
        amount: validate.amount,
        operation: "increment",
        token_id: tokenDetails.id,
        decimal,
        user_id,
      });
    }
    return;
  } catch (err) {
    //create a transaction record;
    prisma.transactions.create({
      data: {
        transaction_data: response,
        transaction_id: transactionId,
        transaction_type: "topup",
        network: client.network,
        amount: amounts.total,
        status: "unhandled",
      },
    });
    next(err);
  }
};

/*****
 * @description Add campaign to smart contract handler.
 **/
export const handleAddCampaigner = async (req: Request, res: Response, next: NextFunction) => {
  // try {
  //   (async () => {
  const walletId: string = req.body.walletId;

  const addWalletAddressToCampaign = await addCampaigner(walletId, req.currentUser?.id);
  return res.status(CREATED).json(addWalletAddressToCampaign);
  //   })();
  // } catch (err) {
  //   next(err);
  // }
};

//===============================

/****
 *
 *@description Check active contract and return to the user.
 */

export const handleGetActiveContract = async (req: Request, res: Response, next: NextFunction) => {
  // try {
  //   (async () => {
  const activeContract = await provideActiveContract();
  return res.status(OK).json(activeContract);
  //   })();
  // } catch (err) {
  //   next(err);
  // }
};

/****
 *@description this function is handling crete topup transaction
 */

export const handleCrateToupReq = async (req: Request, res: Response, next: NextFunction) => {
  // try {
  //   (async () => {
  const entity: CreateTranSactionEntity = req.body.entity;
  const connectedAccountId = req.currentUser?.hedera_wallet_id;

  if (connectedAccountId) {
    const transactionBytes = await createTopUpTransaction(entity, connectedAccountId);
    return res.status(CREATED).json(transactionBytes);
  } else next(new ErrorWithCode("Error while processing request", BAD_REQUEST));
  //   })();
  // } catch (err) {
  //   next(err);
  // }
};

export const handleCampaignFundAllocation = async (req: Request, res: Response, next: NextFunction) => {
  // try {
  //   (async () => {
  const campaignId: number = req.body.campaignId;

  //! get campaignById
  const campaignDetails = await getCampaignDetailsById(campaignId);

  if (campaignDetails && campaignDetails.campaign_budget && campaignDetails.user_user?.hedera_wallet_id && campaignDetails.owner_id && campaignDetails?.contract_id) {
    const amounts = Math.round(campaignDetails?.campaign_budget * Math.pow(10, 8));
    const campaignerAccount = campaignDetails.user_user?.hedera_wallet_id;
    const campaignerId = campaignDetails.owner_id;

    //?  call the function to update the balances of the camp
    const { transactionId, receipt } = await allocateBalanceToCampaign(campaignDetails.id, amounts, campaignerAccount, campaignDetails.contract_id);
    await userService.topUp(campaignerId, amounts, "decrement");

    return res.status(CREATED).json({ transactionId, receipt });
  }

  return res.status(NON_AUTHORITATIVE_INFORMATION).json({ error: true, message: "CampaignIs is not correct" });
  //   })();
  // } catch (err) {
  //   next(err);
  // }
};

export const handleReimbursement = async (req: Request, res: Response, next: NextFunction) => {
  // try {
  //   (async () => {
  const amount: number = req.body.amount;
  const type: string = req.body.type;
  const tokenId: string = req.body.token_id;

  if (!req.currentUser?.id || !req.currentUser?.hedera_wallet_id) {
    return res.status(BAD_REQUEST).json({ error: true, message: "Sorry This request can't be completed." });
  }

  if (type === "HBAR") {
    if (!req.currentUser?.available_budget || (req.currentUser?.available_budget && req.currentUser?.available_budget < amount)) {
      return res.status(BAD_REQUEST).json({
        error: true,
        message: "Insufficient available amount in user's account.",
      });
    }

    const reimbursementTransaction = await reimbursementAmount(req.currentUser?.id, amount, req.currentUser.hedera_wallet_id);
    return res.status(OK).json({
      message: "Reimbursement Successfully",
      reimbursementTransaction,
    });
  } else if (type === "FUNGIBLE") {
    const tokenDetails = await prisma.whiteListedTokens.findUnique({
      where: { token_id: tokenId },
    });

    if (tokenDetails?.decimals) {
      const balRecord = await prisma.user_balances.findFirst({
        where: { user_id: req.currentUser?.id, token_id: tokenDetails.id },
      });

      if (!balRecord || (balRecord?.entity_balance && balRecord?.entity_balance < amount)) {
        return res.status(BAD_REQUEST).json({
          error: true,
          message: "Insufficient available amount in user's account.",
        });
      }
      const reimbursementTransaction = await reimbursementFungible(req.currentUser.hedera_wallet_id, amount, tokenId, tokenDetails?.decimals, req.currentUser?.id, tokenDetails.id);
      return res.status(OK).json({ message: "Reimbursement Successfully" });
    }
  }
  //   })();
  // } catch (err) {
  //   next(err);
  // }
};

