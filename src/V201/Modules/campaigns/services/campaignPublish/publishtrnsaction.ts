import {
  campaign_twittercard,
  campaignstatus,
  network,
  user_user,
} from '@prisma/client';
import { addFungibleAndNFTCampaign } from '@services/contract-service';
import { allocateBalanceToCampaign } from '@services/transaction-service';
import { CampaignEvents } from '@V201/events/campaign';
import CampaignLogsModel from '@V201/Modals/CampaignLogs';
import TransactionRecordModel from '@V201/Modals/TransactionRecord';
import { safeParsedData, updateCampaignInMemoryStatus } from '@V201/modules/common';
import PrismaClientManager from '@V201/PrismaClient';
import { EventPayloadMap } from '@V201/types';
import logger from 'jet-logger';
import appConfigManager from 'src/V201/appConfigManager';
import { publishEvent } from 'src/V201/eventPublisher';

const handleSmartContractTransaction = async (
  card: campaign_twittercard,
  cardOwner: user_user,
  transactionHandler: (
    card: campaign_twittercard,
    cardOwner: user_user
  ) => Promise<any>
): Promise<void> => {
  try {
    const transactionDetails = await transactionHandler(card, cardOwner);

    logger.info(
      `Smart contract transaction successful for card ID: ${card.id}`
    );

    const prisma = await PrismaClientManager.getInstance();
    const apConfig = await appConfigManager.getConfig();

    // log transaction record
    const transactionRecord = await new TransactionRecordModel(
      prisma
    ).createTransaction({
      transaction_data: safeParsedData({
        ...transactionDetails,
        status: transactionDetails.status.toString(),
      }),
      transaction_id: transactionDetails.transactionId,
      status: transactionDetails.status.toString(),
      amount: Number(card.campaign_budget),
      transaction_type: 'campaign_top_up',
      network: apConfig.network.network as network,
    });

    // log campaign status update
    const logableCampaignData = {
      campaign_id: card.id,
      status: campaignstatus.CampaignRunning,
      message: `Campaign balance ${card.campaign_budget} is added to the SM Contract`,
      data: safeParsedData({
        transaction_id: transactionDetails.transactionId,
        status: transactionDetails.status,
        amount: Number(card.campaign_budget),
        transactionLogId: transactionRecord.id.toString(),
      }),
    };

    await new CampaignLogsModel(prisma).createLog({
      ...logableCampaignData,
      campaign: { connect: { id: card.id } },
    });

    updateCampaignInMemoryStatus(card.contract_id!, "transactionLogsCreated", true);
  } catch (error) {
    publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_ERROR, {
      campaignMeta: { campaignId: card.id, userId: cardOwner.id },
      atStage: 'handleSmartContractTransaction',
      message: error.message,
      error,
    });
    logger.err('Error in handleSmartContractTransaction:', error);
    throw error;
  }
};

export const publshCampaignSMTransactionHandlerHBAR = async (
  card: campaign_twittercard,
  cardOwner: user_user
): Promise<void> => {
  if (card.type !== 'HBAR') {
    throw new Error('Unsupported card type for smart contract transaction');
  }

  const { contract_id, campaign_budget } = card;
  const { hedera_wallet_id } = cardOwner;

  if (!contract_id || !campaign_budget || !hedera_wallet_id) {
    throw new Error('Missing required data for smart contract transaction');
  }

  return handleSmartContractTransaction(card, cardOwner, async () => {
    const contractStateUpdateResult = await allocateBalanceToCampaign(
      card.id,
      campaign_budget,
      hedera_wallet_id,
      contract_id
    );

    return {
      contract_id,
      transactionId: contractStateUpdateResult?.transactionId,
      receipt: contractStateUpdateResult?.receipt,
      status: contractStateUpdateResult?.status._code.toString(),
    };
  });
};

export const publshCampaignSMTransactionHandlerFungible = async (
  card: campaign_twittercard,
  cardOwner: user_user
): Promise<void> => {
  if (card.type !== 'FUNGIBLE') {
    throw new Error('Unsupported card type for smart contract transaction');
  }

  const { contract_id, campaign_budget, fungible_token_id } = card;
  const { hedera_wallet_id } = cardOwner;

  if (
    !contract_id ||
    !campaign_budget ||
    !hedera_wallet_id ||
    !fungible_token_id
  ) {
    throw new Error('Missing required data for smart contract transaction');
  }

  return handleSmartContractTransaction(card, cardOwner, async () => {
    const transactionDetails = await addFungibleAndNFTCampaign(
      fungible_token_id,
      campaign_budget,
      hedera_wallet_id,
      contract_id
    );

    if (!transactionDetails) {
      throw new Error('Failed to add campaign to contract');
    }

    return transactionDetails;
  });
};

export const handleCampaignPublishTransaction = async ({
  card,
  cardOwner,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION]): Promise<void> => {
  try {
    if (card.type === 'HBAR') {
      return publshCampaignSMTransactionHandlerHBAR(card, cardOwner);
    }

    if (card.type === 'FUNGIBLE') {
      return publshCampaignSMTransactionHandlerFungible(card, cardOwner);
    }

    throw new Error('Unsupported card type for smart contract transaction');
  } catch (error) {
    publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_ERROR, {
      campaignMeta: { campaignId: card.id, userId: cardOwner.id },
      atStage: 'HandleCampaignPublishTransaction',
      message: error.message,
      error,
    });
    logger.err('Error in HandleCampaignPublishTransaction:', error);
    throw error;
  }
};
