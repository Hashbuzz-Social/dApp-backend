import {
  AccountId,
  ContractCallQuery,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Hbar,
  TransferTransaction
} from "@hashgraph/sdk";
import { campaign_twittercard, network, user_user } from "@prisma/client";
import hederaService from "@services/hedera-service";
import BigNumber from "bignumber.js";
import logger from "jet-logger";
import { claimDuration } from "./CloseCampaign";
import { campaignLifecycleService } from "./ContractCampaignLifecycle";
import { provideActiveContract } from "./smartcontract-service";
import { hederaSDKCallHandler } from "./HederaSDKCalls";
const { hederaClient } = hederaService;

export async function associateTokentoContract(tokenId: string) {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());
    const token = ContractId.fromString(tokenId.toString())
    const associateToken = new ContractExecuteTransaction()
      .setContractId(contractAddress)
      .setGas(2000000)
      .setFunction(
        "contractAssociate",
        new ContractFunctionParameters().addAddress(token.toSolidityAddress())
      );

    const contractCallResult = await associateToken.execute(hederaClient);
    const associateTokenRx = await contractCallResult.getReceipt(hederaClient);
    const associateTokenStatus = associateTokenRx.status;
    console.log(
      " - The Contract associate transaction status:" + associateTokenStatus
    );
  }
}

export async function addFungibleAndNFTCampaign(tokenId: string, amount: number, user_id: string, campaign: string) {
  const contractDetails = await provideActiveContract();

  if (contractDetails?.contract_id) {
    console.log(tokenId, amount, user_id, "Inside fungible campaign");
    const addCampaignFungibleStateUpdate = await campaignLifecycleService.addFungibleCampaign(tokenId, campaign, user_id, amount);
    console.log(
      " - Add campaign transaction contractId: " +
      (addCampaignFungibleStateUpdate).status.toString()
    );
    return addCampaignFungibleStateUpdate
  }
}

export async function closeFungibleAndNFTCampaign(campaign: string) {
  const contractDetails = await provideActiveContract();
  const expiryDuration = claimDuration * 60

  if (contractDetails?.contract_id) {
    const closeCampaignStateUpdate = campaignLifecycleService.closeFungibleCampaign(campaign, expiryDuration)
    return closeCampaignStateUpdate
  }
}
export async function getHbarCampaignBalance(campaignId: any) {
  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const contractAddress = ContractId.fromString(contractDetails?.contract_id.toString());

    const getBalance = new ContractCallQuery()
      .setContractId(contractAddress)
      .setGas(2000000)
      .setFunction(
        "getCampaignBalance",
        new ContractFunctionParameters().addAddress(
          campaignId.toSolidityAddress()
        )
      )
      .setQueryPayment(new Hbar(10));

    const contractCallResult = await getBalance.execute(hederaClient);
    const getBalanceRx = contractCallResult.getUint256();
    console.log(" - The Campaign Balance " + getBalanceRx);
    return getBalanceRx;
  }
}

export async function expiryFungibleCampaign(card: campaign_twittercard, cardOwner: user_user) {
  const contractDetails = await provideActiveContract();

  logger.info(`Fungible campaign expiry operation for card ::::  ${card.id}`);

  if (contractDetails?.contract_id && card.contract_id && card?.fungible_token_id) {
    const expiryCampaignStateUpdate = await campaignLifecycleService.expiryFungibleCampaign(card.fungible_token_id, cardOwner.hedera_wallet_id, card.contract_id, 1);

    logger.info(`- Expiry campaign transaction status for card ${card.id} ::: ${expiryCampaignStateUpdate.status.toString()}`);

    return expiryCampaignStateUpdate
  }
}

export async function expiryCampaign(card: campaign_twittercard, cardOwner: user_user) {

  logger.info(`SM transaction for update expiry status of card ::  ${card.id}`);

  // get Active contract for transaction.
  const contractDetails = await provideActiveContract();

  // check for  required coditions 
  if (contractDetails?.contract_id && cardOwner.hedera_wallet_id && card.contract_id) {

    const campagnExpiryStatusUpdate = await campaignLifecycleService.expiryCampaign(card.contract_id, cardOwner.hedera_wallet_id);
    logger.info(`Expiry campaign SM transaction status for card ${card.id}:::${campagnExpiryStatusUpdate.status.toString()} `);

    return campagnExpiryStatusUpdate;
  }
  else {
    throw new Error("User Or card details os incorrect")
  }
}

export async function distributeTokenUsingSDK(params: { tokenId: string, userId: string, amount: number, campaign: string }) {
  const { amount, userId, campaign, tokenId } = params;
  const contractDetails = await provideActiveContract();
  if (contractDetails?.contract_id) {
    const transactionRecipt = await hederaSDKCallHandler.rewardIntractorWithToken(
      userId,
      amount,
      campaign,
      tokenId
    )
    return transactionRecipt;
  }
}  