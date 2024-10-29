import { AccountId, ContractExecuteTransaction, ContractFunctionParameters, ContractId, TokenInfo, TransferTransaction } from "@hashgraph/sdk";
import { Decimal } from "@prisma/client/runtime/library";
import hederaService from "@services/hedera-service";
import signingService from "@services/signing-service";
import { encodeFunctionCall, provideActiveContract, queryBalance, queryFungibleBalanceOfCampaigner } from "@services/smartcontract-service";
import { sensitizeUserData, waitFor } from "@shared/helper";
import { networkHelpers } from "@shared/NetworkHelpers";
import prisma from "@shared/prisma";
import BigNumber from "bignumber.js";
import logger from "jet-logger";
import JSONBigInt from "json-bigint";
import { CreateTranSactionEntity } from "src/@types/custom";
import { TransactionResponse } from "src/@types/networkResponses";
import { getCampaignDetailsById } from "./campaign-service";
import { contractTransactionHandler } from "./ContractTransactionHandler";
import userService from "./user-service";

const { hederaClient, operatorKey, operatorId } = hederaService;

export const updateBalanceToContract = async (payerId: string, amounts: { value: number; fee: number; total: number }) => {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    // const address = AccountId.fromString(payerId);
    const deposit = true;
    const amount = Math.floor(amounts.value * 1e8);

    const userUpdatedBalance = await contractTransactionHandler.updateBalance(payerId, amount, deposit);
    console.info("User updated balance", userUpdatedBalance);

    return {
      userUpdatedBalance
    };
  } else {
    throw new Error("Contract id not found");
  }
};

export const updateFungibleAmountToContract = async (payerId: string, amount: number, token_id: string) => {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    amount = Math.floor(amount);
    const balanceRecord = await contractTransactionHandler.addFungibleAmount(payerId, token_id, amount);
    return balanceRecord;
  } else {
    throw new Error("Contract id not found");
  }
};

export const createTopUpTransaction = async (entity: CreateTranSactionEntity, connectedAccountId: string) => {
  // console.log("Creating Transaction Hash with:", { payerId, amounts });
  const { value, fee, total } = entity.amount;
  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const transferTx = new TransferTransaction().setTransactionMemo("Hashbuzz balance topup");
    if (entity.entityType === "HBAR") transferTx.addHbarTransfer(connectedAccountId, -total).addHbarTransfer(contractDetails.contract_id?.toString(), value).setTransactionMemo("Hashbuzz escrow payment").addHbarTransfer(operatorId, fee);

    if (entity.entityType === "fungible" && entity.entityId) {
      const token = await prisma.whiteListedTokens.findUnique({
        where: { token_id: entity.entityId },
      });
      if (token && token.tokendata) {
        const tokenInfo: TokenInfo = JSON.parse(JSON.stringify(token.tokendata));
        const decimal = parseInt("" + tokenInfo.decimals);
        transferTx
          .addTokenTransfer(entity.entityId, connectedAccountId, -(total * Math.pow(10, decimal)))
          .addTokenTransfer(entity.entityId, contractDetails.contract_id.toString(), value * Math.pow(10, decimal))
          .setTransactionMemo("Hashbuzz escrow payment")
          .addTokenTransfer(entity.entityId, operatorId, fee * Math.pow(10, decimal));
      }
    }
    const transactionId = transferTx.transactionId?.toString();
    console.log(transactionId, "Transaction Id");
    //signing and returning
    return signingService.signAndMakeBytes(transferTx, connectedAccountId);
  } else {
    throw new Error("Contract id not found");
  }
};

/**
 * @description - This function debits balance from the campaigner's Hedera account and credits the same balance to the campaign account.
 * @param campaignId - Database ID of the campaign
 * @param amounts - Amount allocated to the campaign in tinybar
 * @param campaignerAccount - Campaigner account address in "0.0.123456" format
 * @param campaignAddress - Campaign account address
 * @returns A Promise with the transaction details
 * @throws Will throw an error if the operation fails
 */
export const allocateBalanceToCampaign = async (
  campaignId: bigint | number,
  amounts: number,
  campaignerAccount: string,
  campaignAddress: string
): Promise<{ contract_id: string; transactionId: string; receipt: any, status: string }> => {
  logger.info("=========== AllocateBalanceToCampaign ===============");
  logger.info(`Start for campaign: ${JSONBigInt.stringify({ campaignId, campaignAddress })}`);

  try {
    const contractDetails = await provideActiveContract();

    if (!contractDetails || !contractDetails.contract_id) {
      throw new Error("Active contract ID not found");
    }

    const contractAddress = ContractId.fromString(contractDetails.contract_id.toString());
    const campaigner = AccountId.fromString(campaignerAccount);
    logger.info(`Campaigner account: ${campaignerAccount}`);
    logger.info(`Tiny amount to be added to contract: ${amounts}`);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(10000000)
      .setFunction(
        "addCampaign",
        new ContractFunctionParameters()
          .addString(campaignAddress)
          .addAddress(campaigner.toSolidityAddress())
          .addUint256(amounts)
      )
      .setTransactionMemo(`Hashbuzz add balance to campaign account ${campaignAddress}`);

    const exResult = await contractExBalTx.execute(hederaClient);
    const receipt = await exResult.getReceipt(hederaClient);
    const status = receipt.status.toString();

    logger.info(`Finished with transaction ID :: ${exResult.transactionId.toString()}`);
    logger.info("============== Balance Allocation ends ===========");

    return {
      contract_id: campaignAddress,
      transactionId: exResult.transactionId.toString(),
      receipt,
      status
    };
  } catch (error: any) {
    logger.err(`Error in allocateBalanceToCampaign:, ${error.message}, ${JSON.stringify({
      campaignId,
      campaignerAccount,
      campaignAddress,
      amounts,
    })}`);
    logger.info("============== Balance Allocation ends with error ===========");

    throw error; // Rethrow the error after logging
  }
};

export const updateCampaignBalance = async ({ campaignerAccount, campaignId, amount }: { campaignerAccount: string; campaignId: string; amount: number }) => {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails.contract_id.toString());
    // const campaignAddress = buildCampaignAddress(campaignerAccount, campaignId.toString());
    const user = AccountId.fromString(campaignerAccount);
    const campaign = AccountId.fromString(campaignerAccount);

    console.log("Update SM balances For campaign", {
      campaignAddress: campaign,
      contract_id: contractDetails.contract_id,
      amount,
    });
    const distributeHbar = new ContractExecuteTransaction().setContractId(contractAddress).setGas(400000).setFunction("transferHbar", new ContractFunctionParameters().addAddress(user.toSolidityAddress()).addString(campaignId).addUint256(amount)).setTransactionMemo("Update campaign details");

    const distributeHbarTx = await distributeHbar.execute(hederaClient);
    const distributeHbarRx = await distributeHbarTx.getReceipt(hederaClient);
    const distributeHbarstatus = distributeHbarRx.status;

    console.log(" - Distribute Hbar transaction status: " + distributeHbarstatus.toString());

    return distributeHbarstatus;
  }
};

export const withdrawHbarFromContract = async (intracterAccount: string, amount: number) => {
  const contractDetails = await provideActiveContract();
  amount = amount / Math.pow(10, 8);

  console.log({
    intracterAccount,
    contract_id: contractDetails?.contract_id,
    amount,
    amounte8: amount * 1e8,
  });

  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails.contract_id.toString());
    const IntractorAddress = AccountId.fromString(intracterAccount).toSolidityAddress();

    //   //!! BUILD Parameters
    const functionCallAsUint8Array = encodeFunctionCall("callHbarToPayee", [IntractorAddress, Math.round(amount * 1e8)]);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setFunctionParameters(functionCallAsUint8Array)
      .setTransactionMemo("Hashbuzz rewarding to intractor with adderss" + intracterAccount)
      .setGas(1000000);

    const contractExecuteSubmit = await contractExBalTx.execute(hederaClient);
    const contractExecuteRx = await contractExecuteSubmit.getReceipt(hederaClient);
    return contractExecuteRx;
  }
};

export const transferAmountFromContractUsingSDK = async (intracterAccount: string, amount: number, memo = "Reward payment from hashbuzz") => {
  const contractDetails = await provideActiveContract();
  amount = Math.round(amount) / 1e8;

  if (contractDetails?.contract_id) {
    const backupContract = contractDetails?.contract_id;
    const backupContract1 = AccountId.fromString(backupContract);

    const transferTx = new TransferTransaction().addHbarTransfer(backupContract1, -amount).addHbarTransfer(intracterAccount, amount).setTransactionMemo(memo).freezeWith(hederaClient);

    const transferSign = await transferTx.sign(hederaService.operatorKey);
    const transferSubmit = await transferSign.execute(hederaClient);
    const transferRx = await transferSubmit.getReceipt(hederaClient);
    return transferRx;
  }
};

export const transferFungibleFromContractUsingSDK = async (intracterAccount: string, amount: number, memo = "Reward fungible payment from hashbuzz", tokenId: string) => {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const backupContract = contractDetails?.contract_id;
    const backupContract1 = AccountId.fromString(backupContract);
    const token = AccountId.fromString(tokenId);

    const transaction = new TransferTransaction().addTokenTransfer(token, backupContract1, -amount).addTokenTransfer(token, intracterAccount, amount).setTransactionMemo(memo).freezeWith(hederaClient);

    //Sign with the sender account private key
    const signTx = await transaction.sign(operatorKey);

    //Sign with the hederaClient operator private key and submit to a Hedera network
    const txResponse = await signTx.execute(hederaClient);

    //Request the receipt of the transaction
    const receipt = await txResponse.getReceipt(hederaClient);

    //Obtain the transaction consensus status
    const transactionStatus = receipt.status;

    console.log("The transaction consensus status " + transactionStatus.toString());
  }
};

export const closeCampaignSMTransaction = async (campingId: number | bigint, campaign: string) => {
  const campaignDetails = await getCampaignDetailsById(campingId);
  const { user_user, id, contract_id, name } = campaignDetails!;

  const contractDetails = await provideActiveContract();

  // if (contractDetails?.contract_id) {
  console.log(campaignDetails, "---------");
  if (contractDetails?.contract_id && user_user?.hedera_wallet_id && contract_id && name) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
    const campaigner = user_user?.hedera_wallet_id;
    const campaignId = AccountId.fromString(campaigner);

    const contractExBalTx = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(400000)
      .setFunction("closeCampaign", new ContractFunctionParameters().addString(campaign).addUint256(600))
      .setTransactionMemo("Hashbuzz close campaign operation for " + name);

    const contractExecuteSubmit = await contractExBalTx.execute(hederaClient);
    const contractExecuteRx = await contractExecuteSubmit.getReceipt(hederaClient);
    return contractExecuteRx;
  }
};

export const reimbursementAmount = async (params: { userId: number | bigint, amounts: number, accountId: string, currentBalance: number }) => {
  const { userId, accountId, amounts, currentBalance } = params;
  console.group("Reimbursement::");
  console.log({ amounts, accountId });
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const deposit = false;
    const userUpdatedBalance = await contractTransactionHandler.updateBalance(accountId, Math.floor(amounts * 1e8), deposit);
    console.info("User updated balance after reimbersement", userUpdatedBalance);

    const totalReimbersement = currentBalance - Number(userUpdatedBalance);

    const userData = await userService.topUp(userId, Number(userUpdatedBalance), "update");
    const paymentTransaction = await transferAmountFromContractUsingSDK(accountId, totalReimbersement, "Reimbursement payment from hashbuzz");

    console.groupEnd();
    return {
      paymentTransaction,
      userData: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(userData))),
    };
  }
};

export const reimbursementFungible = async (accountId: string, amounts: number, tokenId: string, decimals: Decimal, id: bigint, idToken: bigint) => {
  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const backupContract = contractDetails?.contract_id;

    const token = AccountId.fromString(tokenId);
    const account = AccountId.fromString(accountId);

    const contractAddress = ContractId.fromString(backupContract.toString());

    const transferToken = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(2000000)
      .setFunction(
        "reimburseBalanceForFungible",
        new ContractFunctionParameters()
          .addAddress(token.toSolidityAddress())
          .addAddress(account.toSolidityAddress())
          .addInt64(new BigNumber(amounts * 10 ** Number(decimals)))
      );

    const transferTokenTx = await transferToken.execute(hederaClient);
    const transferTokenRx = await transferTokenTx.getReceipt(hederaClient);
    const tokenStatus = transferTokenRx.status;
    console.log(" - The transfer back transaction status " + tokenStatus);
    const balance = await queryFungibleBalanceOfCampaigner(accountId, tokenId, false);

    const balanceRecord = await userService.updateTokenBalanceForUser({
      amount: amounts * 10 ** Number(decimals),
      operation: "decrement",
      token_id: idToken,
      decimal: Number(decimals),
      user_id: id,
    });
    return balanceRecord;
  }
};

type ValidatedResult = {
  validated: true;
  amount: number;
  transferFrom: string;
  token_id?: string;
};
type UnvalidatedResult = { validated: false; status: "unhandled" | "failed" };
type ValidationResult = ValidatedResult | UnvalidatedResult;

export const validateTransactionFormNetwork = async (transactionId: string, transferFrom: string, retryCount = 2): Promise<ValidationResult> => {
  try {
    // Active contract
    const contractDetails = await provideActiveContract();
    const contract_address = contractDetails?.contract_id;

    // Collector account
    const collectorAccount = process.env.HEDERA_ACCOUNT_ID;

    // Fetch transaction details from the network
    const data = await networkHelpers.getTransactionDetails<TransactionResponse>(transactionId);
    const transaction = data.transactions[0];

    // Check if the transaction is successful and necessary details are available
    if (transaction.result !== "SUCCESS" || !contract_address || !collectorAccount) {
      return { validated: false, status: "failed" };
    }

    const { token_transfers, transfers } = transaction;

    if (token_transfers.length > 0) {
      // Transaction involves token transfers
      const trxFrom = token_transfers.find((d) => d.account === transferFrom);
      const trxTo = token_transfers.find((d) => d.account === contract_address);
      const collectorPay = token_transfers.find((d) => d.account === collectorAccount);

      if (trxFrom && trxTo && collectorPay && trxFrom.amount + trxTo.amount + collectorPay.amount === 0) {
        // Fungible token transaction verified
        return {
          validated: true,
          amount: trxTo.amount,
          transferFrom,
          token_id: trxTo.token_id,
        };
      }
    } else {
      // Transaction involves HBAR transfers
      const trxFrom = transfers.find((d) => d.account === transferFrom);
      const trxTo = transfers.find((d) => d.account === contract_address);
      const collectorPay = transfers.find((d) => d.account === collectorAccount);

      if (trxFrom && trxTo && collectorPay) {
        // HBAR transaction verified
        return { validated: true, amount: trxTo.amount, transferFrom };
      }
    }

    // Unhandled transaction
    return { validated: false, status: "unhandled" };
  } catch (error) {
    // Handle any errors during the validation process;
    if (retryCount > 0) {
      console.log(`Retrying (${retryCount} attempts left)`);
      // Wait for 5 seconds before retrying
      await waitFor(12000);
      return validateTransactionFormNetwork(transactionId, transferFrom, retryCount - 1);
    } else {
      console.error("Error during transaction validation:", error);
      return { validated: false, status: "failed" };
    }
  }
};

