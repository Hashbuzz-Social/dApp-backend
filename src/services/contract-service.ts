import {
  AccountId
} from "@hashgraph/sdk";
import { campaign_twittercard, user_user } from "@prisma/client";
import initHederaService from "@services/hedera-service";
import createPrismaClient from "@shared/prisma";
import logger from "jet-logger";
import JSONBigInt from "json-bigint";
import ContractCampaignLifecycle from "./ContractCampaignLifecycle";
import ContractUtils from "./ContractUtilsHandlers";
// import { hederaSDKCallHandler } from "./HederaSDKCalls";
import { getConfig } from "@appConfig";
import HederaSDKCalls from "./HederaSDKCalls";


// Function to provide the active contract details
export const provideActiveContract = async () => {
  const prisma = await createPrismaClient();
  const appConfig = await getConfig();
  const hederaService = await initHederaService();
  const availableContracts = await prisma.smartcontracts.findMany({
    where: {
      is_active: true,
      network: hederaService.network,
    },
  });

  if (availableContracts.length > 0) {
    const { contract_id, contractAddress, logicalContract_id } = availableContracts[0];
    return { contract_id, contractAddress, logicalContract_id };
  } else {
    console.info("No active contract found in records, Getting from env");
    const contract_id_new = appConfig.network.contractAddress;
    if (contract_id_new) {
      const contractData = await prisma.smartcontracts.create({
        data: {
          contractAddress: AccountId.fromString(contract_id_new).toSolidityAddress(),
          contract_id: `${contract_id_new}`,
          logicalContract_id: `${contract_id_new}`,
          is_active: true,
          lcFileID: contract_id_new ?? "",
          network: hederaService.network,
          fileId: contract_id_new ?? "",
          created_at: new Date().toISOString(),
        },
      });
      return { contract_id: contractData.contract_id, contractAddress: contractData.contractAddress, logicalContract_id: contractData.logicalContract_id };
    }
  }
  return null;
}


// Function to add a fungible and NFT campaign
export async function addFungibleAndNFTCampaign(tokenId: string, amount: number, user_id: string, campaign: string) {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const campaignLifecycleService = new ContractCampaignLifecycle(contractDetails.contract_id);
    const addCampaignFungibleStateUpdate = await campaignLifecycleService.addFungibleCampaign(tokenId, campaign, user_id, amount);
    return addCampaignFungibleStateUpdate;
  }
}

// Function to close a fungible and NFT campaign
export async function closeFungibleAndNFTCampaign(campaign: string) {
  const contractDetails = await provideActiveContract();
  const appConfig = await getConfig();
  const expiryDuration = Number(appConfig.app.defaultCampaignDuratuon ?? 15) * 60;

  if (contractDetails?.contract_id) {
    const campaignLifecycleService = new ContractCampaignLifecycle(contractDetails.contract_id);
    const closeCampaignStateUpdate = campaignLifecycleService.closeFungibleCampaign(campaign, expiryDuration);
    return closeCampaignStateUpdate;
  }
}

// Function to expire a fungible campaign
export async function expiryFungibleCampaign(card: campaign_twittercard, cardOwner: user_user) {
  const contractDetails = await provideActiveContract();

  logger.info(`Fungible campaign expiry operation for card ::::  ${card.id}`);

  if (contractDetails?.contract_id && card.contract_id && card?.fungible_token_id) {
    const campaignLifecycleService = new ContractCampaignLifecycle(contractDetails.contract_id);

    const props = {
      tokenId: card.fungible_token_id,
      campaignAddress: card.contract_id,
      campaigner: cardOwner.hedera_wallet_id,
    }

    const expiryCampaignStateUpdate = await campaignLifecycleService.expiryFungibleCampaign(props);

    logger.info(`- Expiry campaign transaction status for card ${card.id.toString()} ::: ${expiryCampaignStateUpdate.status.toString()}`);

    return expiryCampaignStateUpdate;
  }
}

// Function to expire a campaign
export async function expiryCampaign(card: campaign_twittercard, cardOwner: user_user) {
  logger.info(`SM transaction for update expiry status of card ::  ${card.id}`);

  // Get active contract for transaction
  const contractDetails = await provideActiveContract();

  // Check for required conditions
  if (contractDetails?.contract_id && cardOwner.hedera_wallet_id && card.contract_id) {
    const campaignLifecycleService = new ContractCampaignLifecycle(contractDetails.contract_id);
    const campagnExpiryStatusUpdate = await campaignLifecycleService.expiryCampaign(card.contract_id, cardOwner.hedera_wallet_id);
    logger.info(`Expiry campaign SM transaction status for card ${card.id}:::${campagnExpiryStatusUpdate.status.toString()} `);

    return campagnExpiryStatusUpdate;
  } else {
    throw new Error("User or card details are incorrect");
  }
}

// Function to distribute tokens using SDK
export async function distributeTokenUsingSDK(params: { tokenId: string, userId: string, amount: number, xHandle: string }) {
  try {
    const { amount, userId, tokenId, xHandle } = params;
    const contractDetails = await provideActiveContract();
    if (contractDetails?.contract_id) {
      const { operatorId, operatorKey, hederaClient } = await initHederaService();
      const hederaSDKCallHandler = new HederaSDKCalls(hederaClient, operatorId, operatorKey)
      const transactionRecipt = await hederaSDKCallHandler.rewardIntractorWithToken(userId, amount, tokenId, xHandle);
      return transactionRecipt;
    }
  } catch (error) {
    logger.err(`Error in distributeTokenUsingSDK :: ${error}`);
    throw new Error(error.message ?? "Error in distributeTokenUsingSDK");
  }
}


export const getSMInfo = async () => {
  const activeContract = await provideActiveContract();
  return activeContract;
};

export const queryCampaignBalanceFromContract = async (
  campaignAddress: string,
  tokenId: string | null = null,
) => {
  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const contractUtils = new ContractUtils(contractDetails.contract_id);
    if (tokenId) {
      const balance = await contractUtils.getFungibleCampaignBalance(campaignAddress, tokenId);
      return balance;
    } else {
      const balance = await contractUtils.getCampaignBalance(campaignAddress);
      return balance;
    }
  }
};

export const queryFungibleBalanceOfCampaigner = async (address: string, fungible_tokenId: string) => {
  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const utilsHandlerService = new ContractUtils(contractDetails.contract_id);
    const balances = await utilsHandlerService.getFungibleTokenBalance(address, fungible_tokenId);
    return Number(balances);
  }
};

export const queryBalance = async (address: string) => {
  // Execute the contract to check changes in state variable
  address = AccountId.fromString(address).toSolidityAddress();

  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const utilsHandlerService = new ContractUtils(contractDetails.contract_id);
    const balances = await utilsHandlerService.getHbarBalance(address);

    return { balances };
  }
};
