import { AccountId, ContractExecuteTransaction, ContractFunctionParameters, ContractId, TokenInfo, TransferTransaction } from "@hashgraph/sdk";
import { Decimal } from "@prisma/client/runtime/library";
import initHederaservice from "@services/hedera-service";
import signingService from "@services/signing-service";
import { sensitizeUserData, waitFor } from "@shared/helper";
import NetworkHelpers from "@shared/NetworkHelpers";
import createPrismaClient from "@shared/prisma";
import logger from "jet-logger";
import JSONBigInt from "json-bigint";
import { CreateTranSactionEntity } from "src/@types/custom";
import { TransactionResponse } from "src/@types/networkResponses";
import { getConfig } from "@appConfig";
import { provideActiveContract } from "./contract-service";
import ContractCampaignLifecycle from "./ContractCampaignLifecycle";
import { contractTransactionHandler } from "./ContractTransactionHandler";
import userService from "./user-service";
import HederaSDKCalls from "./HederaSDKCalls";


export const updateBalanceToContract = async (payerId: string, amounts: { value: number; fee: number; total: number }) => {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
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
  const { value, fee, total } = entity.amount;
  const contractDetails = await provideActiveContract();
  const prisma = await createPrismaClient();
  const hederaService = await initHederaservice()
  const { operatorId } = hederaService;
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
) => {
  logger.info("=========== AllocateBalanceToCampaign ===============");
  logger.info(`Start for campaign: ${JSONBigInt.stringify({ campaignId, campaignAddress })}`);

  try {
    const contractDetails = await provideActiveContract();
    if (!contractDetails || !contractDetails.contract_id) {
      throw new Error("Active contract ID not found");
    }
    const campaignLifecycleService = new ContractCampaignLifecycle(contractDetails.contract_id);
    const stateUppdateData = await campaignLifecycleService.addCampaignOrTopUp(campaignAddress, campaignerAccount, amounts)

    if (stateUppdateData && 'dataDecoded' in stateUppdateData && stateUppdateData.dataDecoded) {
      const updatedBalance = stateUppdateData.dataDecoded[0];
      logger.info(`Campaigner updated balance after campaign::${campaignAddress} created: ${Number(updatedBalance).toString()}`);
    }
    logger.info("============== Balance Allocation ends ===========");
    return {
      contract_id: campaignAddress,
      ...stateUppdateData,
    };
  } catch (error: any) {
    logger.err(`Error in allocateBalanceToCampaign:, ${error.message}, ${JSONBigInt.stringify({
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

  const hederaService = await initHederaservice()
  const { hederaClient } = hederaService;

  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails.contract_id.toString());
    const user = AccountId.fromString(campaignerAccount);
    const campaign = AccountId.fromString(campaignerAccount);


    const distributeHbar = new ContractExecuteTransaction().setContractId(contractAddress).setGas(400000).setFunction("transferHbar", new ContractFunctionParameters().addAddress(user.toSolidityAddress()).addString(campaignId).addUint256(amount)).setTransactionMemo("Update campaign details");

    const distributeHbarTx = await distributeHbar.execute(hederaClient);
    const distributeHbarRx = await distributeHbarTx.getReceipt(hederaClient);
    const distributeHbarstatus = distributeHbarRx.status;

    console.log(" - Distribute Hbar transaction status: " + distributeHbarstatus.toString());

    return distributeHbarstatus;
  }
};



export const transferAmountFromContractUsingSDK = async (params: {
  /** Local DB address in string */
  xHandle: string,
  /** Total amount rewwarded to this user */
  amount: number,
  /** Wallet of intractor */
  intractorWallet: string,
}) => {
  const { xHandle, amount, intractorWallet } = params;
  const contractDetails = await provideActiveContract();
  const amountInHbar = Math.round(amount) / 1e8;

  if (contractDetails?.contract_id) {
    const { operatorId, operatorKey, hederaClient } = await initHederaservice();
    const hederaSDKCallHandler = new HederaSDKCalls(hederaClient, operatorId, operatorKey)
    const recipt = await hederaSDKCallHandler.rewardIntractor(intractorWallet, amountInHbar, xHandle);
    return recipt;
  }
};

export const transferFungibleFromContractUsingSDK = async (intracterAccount: string, amount: number, memo = "Reward fungible payment from hashbuzz", tokenId: string) => {
  const contractDetails = await provideActiveContract();
  const hederaService = await initHederaservice()
  const { hederaClient, operatorKey } = hederaService;

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

export const closeCampaignSMTransaction = async (campaign: string) => {

  const contractDetails = await provideActiveContract();
  const congis = await getConfig();
  const timeDuration = Number(congis.app.defaultCampaignDuratuon) * 60;

  console.log("Inside close campaign", { campaign, timeDuration });

  if (contractDetails?.contract_id) {
    const campaignLifecycleService = new ContractCampaignLifecycle(contractDetails.contract_id);
    const closeCampaignStateUpdate = await campaignLifecycleService.closeCampaign(campaign, timeDuration);

    return closeCampaignStateUpdate;
  }
};

export const reimbursementAmount = async (params: { userId: number | bigint, amounts: number, accountId: string, currentBalance: number }) => {
  const { userId, accountId, amounts, currentBalance } = params;

  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const deposit = false;
    const userUpdatedBalance = await contractTransactionHandler.updateBalance(accountId, Math.floor(amounts * 1e8), deposit);
    console.info("User updated balance after reimbersement", userUpdatedBalance);

    const totalReimbersement = currentBalance - Number(userUpdatedBalance);

    const userData = await userService.topUp(userId, Number(userUpdatedBalance), "update");
    const { operatorId, operatorKey, hederaClient } = await initHederaservice();
    const hederaSDKCallHandler = new HederaSDKCalls(hederaClient, operatorId, operatorKey)
    const paymentTransaction = hederaSDKCallHandler.transferHbarUsingSDK({
      fromAccountId: contractDetails.contract_id,
      toAccountId: accountId,
      amount: Math.round(totalReimbersement) / 1e8,
      memo: "Reimbursement payment from hashbuzz",
    })

    console.groupEnd();
    return {
      paymentTransaction,
      userData: JSONBigInt.parse(JSONBigInt.stringify(await sensitizeUserData(userData))),
    };
  }
};

export const reimbursementFungible = async (params: { accountId: string, amounts: number, tokenId: string, decimals: Decimal, id: bigint, idToken: bigint, currentBalance: number }) => {
  const { accountId, amounts, tokenId, decimals, id, idToken, currentBalance } = params;

  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const amount = Number(amounts * 10 ** Number(decimals))

    const updatedTokenBalance = await contractTransactionHandler.reimburseBalanceForFungible(
      tokenId,
      accountId,
      amount
    );
    // Total reimbursement
    const totalReimbersement = currentBalance - Number(updatedTokenBalance);

    // Transfer token using sdk;
    const { operatorId, operatorKey, hederaClient } = await initHederaservice();
    const hederaSDKCallHandler = new HederaSDKCalls(hederaClient, operatorId, operatorKey)
    const paymentTransaction = hederaSDKCallHandler.transferTokenUsingSDK({
      fromAccountId: contractDetails.contract_id,
      toAccountId: accountId,
      tokenId,
      amount: (totalReimbersement),
      memo: "Reimbursement payment from hashbuzz",
    })


    const balanceRecord = await userService.updateTokenBalanceForUser({
      amount: Number(updatedTokenBalance),
      operation: "update",
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
    const configs = await getConfig();
    const contract_address = contractDetails?.contract_id;

    // Collector account
    const collectorAccount = configs.network.accountID;

    // Fetch transaction details from the network
    const networkHelpers = new NetworkHelpers(configs.app.mirrorNodeURL);
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

