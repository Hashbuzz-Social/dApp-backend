import { Status } from "@hashgraph/sdk";
import { getCampaignDetailsById } from "@services/campaign-service";
import { utilsHandlerService } from "@services/ContractUtilsHandlers";
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
import JSONBigInt from "json-bigint"

const { OK, CREATED, BAD_REQUEST, NON_AUTHORITATIVE_INFORMATION, ACCEPTED } = statusCodes;

/****
 *@description top-up handler
 * Step 1. Validate the transaction from the network.
 * Step 2. Then get the entity type and validate with the transaction too.
 */

export const handleTopUp = async (req: Request, res: Response, next: NextFunction) => {
  const accountId = req.currentUser?.hedera_wallet_id;
  const userId = req.currentUser?.id;
  const entity: CreateTranSactionEntity = req.body.entity;
  const amounts = entity.amount;
  const address = entity?.entityId;
  const transactionId: string = req.body.transactionId;
  const response: string = req.body.response;

  if (!accountId || !amounts?.value || !amounts.fee || !amounts.total || !userId || !address) {
    return res.status(BAD_REQUEST).json({ error: true, message: "Amounts are incorrect" });
  }

  try {
    let tokenDetails;

    if (entity.entityType === "fungible" && entity.entityId) {
      tokenDetails = await htsServices.getEntityDetailsByTokenId(entity.entityId);
      if (!tokenDetails) {
        return res.status(BAD_REQUEST).json({ error: true, message: "Wrong fungible token provided" });
      }
    }

    if (!Boolean(req.currentUser?.whitelistUser)) {
      // user is performing top-up for the first time so add user to contract
      const status = await utilsHandlerService.addCampaigner(accountId);

      if (status !== Status.Success) {
        throw new ErrorWithCode("Failed to add user to contract for HBAR", BAD_REQUEST);
        // return res.status(BAD_REQUEST).json({ error: true, message: "Failed to add user to contract for HBAR" });
      }

      // update the user whitelist status
      await userService.updateUserById(userId, { whitelistUser: true });
    }

    // Respond user about acceptance for the transaction data
    res.status(ACCEPTED).json({
      success: true,
      message: "Transaction validation in progress. Balance will be updated in a few seconds. Do not close the browser.",
    });

    await waitFor(10000);

    const validate = await validateTransactionFormNetwork(transactionId, accountId);

    await createOrUpdateTransactionRecord(transactionId, response, amounts.total, validate.validated ? "validated" : validate.status);

    if (validate.validated) {
      await handleValidatedTransaction(entity, accountId, address, amounts, userId, validate, tokenDetails);
    }
  } catch (err) {
    await createOrUpdateTransactionRecord(transactionId, response, amounts.total, "unhandled");
    console.error("Error while processing top-up request", err);
  }
};


const createOrUpdateTransactionRecord = async (transactionId: string, response: string, amount: number, status: string) => {
  const finddataByTransactionId = await prisma.transactions.findFirst({
    where: { transaction_id: transactionId },
  })
  if (finddataByTransactionId) {
    // update the transaction record
    await prisma.transactions.update({
      where: { id: finddataByTransactionId.id },
      data: {
        transaction_data: response,
        amount,
        status
      }
    });
  } else {
    await prisma.transactions.create({
      data: {
        transaction_data: response,
        transaction_id: transactionId,
        transaction_type: "topup",
        network: client.network,
        amount,
        status,
      },
    });
  }
};

const handleValidatedTransaction = async (
  entity: CreateTranSactionEntity,
  accountId: string,
  address: string,
  amounts: any,
  userId: number | bigint,
  validate: any,
  tokenDetails: any
) => {
  if (entity.entityType === "HBAR") {
    const balanceRecord = await updateBalanceToContract(address, amounts);
    await userService.topUp(userId, Number(balanceRecord.userUpdatedBalance), "update");
  }

  if (entity.entityType === "fungible" && validate.token_id && tokenDetails) {
    const decimal = Number(tokenDetails.decimals);
    const amount = await updateFungibleAmountToContract(accountId, validate.amount, validate.token_id);
    await userService.updateTokenBalanceForUser({
      amount: Number(amount),
      operation: "update",
      token_id: tokenDetails.id,
      decimal,
      user_id: userId,
    });
  }
};
/*****
 * @description Add campaign to smart contract handler.
 **/
export const handleAddCampaigner = async (req: Request, res: Response, next: NextFunction) => {
  const walletId: string = req.body.walletId;

  const addWalletAddressToCampaign = await addCampaigner(walletId, req.currentUser?.id);
  return res.status(CREATED).json(addWalletAddressToCampaign);

};

//===============================

/****
 *
 *@description Check active contract and return to the user.
 */

export const handleGetActiveContract = async (req: Request, res: Response, next: NextFunction) => {
  const activeContract = await provideActiveContract();
  return res.status(OK).json(activeContract);

};

/****
 *@description this function is handling crete topup transaction
 */

export const handleCrateToupReq = async (req: Request, res: Response, next: NextFunction) => {

  const entity: CreateTranSactionEntity = req.body.entity;
  const connectedAccountId = req.currentUser?.hedera_wallet_id;

  if (connectedAccountId) {
    const transactionBytes = await createTopUpTransaction(entity, connectedAccountId);
    return res.status(CREATED).json(transactionBytes);
  } else { next(new ErrorWithCode("Error while processing request", BAD_REQUEST)); }
};

export const handleCampaignFundAllocation = async (req: Request, res: Response, next: NextFunction) => {

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

  return res.status(NON_AUTHORITATIVE_INFORMATION).json({ error: true, message: "CampaignIs is not correct" })
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

    const reimbursementTransaction = await reimbursementAmount({
      userId: req.currentUser.id,
      amounts: amount,
      accountId: req.currentUser.hedera_wallet_id,
      currentBalance: req.currentUser.available_budget
    });
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

      //req.currentUser.hedera_wallet_id, amount, tokenId, tokenDetails?.decimals, req.currentUser?.id, tokenDetails.id
      const reimbursementTransaction = await reimbursementFungible({
        accountId: req.currentUser.hedera_wallet_id,
        amounts: amount,
        tokenId,
        decimals: tokenDetails.decimals,
        id: req.currentUser.id,
        idToken: tokenDetails.id,
        currentBalance: balRecord.entity_balance
      });
      return res.status(OK).json({ message: "Reimbursement Successfully", data: JSONBigInt.parse(JSONBigInt.stringify(reimbursementTransaction)) });
    }
  }
};

