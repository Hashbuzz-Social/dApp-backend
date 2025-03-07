import {
  campaign_twittercard,
  campaignstatus,
  network,
  user_user,
} from '@prisma/client';
import { addFungibleAndNFTCampaign } from '@services/contract-service';
import { allocateBalanceToCampaign } from '@services/transaction-service';
import tweetService from '@services/twitterCard-service';
import { CampaignEvents } from '@V201/events/campaign';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import TransactionRecordModel from '@V201/Modals/TransactionRecordModal';
import UserBalancesModel from '@V201/Modals/UserBalances';
import WhiteListedTokensModel from '@V201/Modals/WhiteListedTokens';
import { logCampaignStatus, safeParsedData } from '@V201/modules/common';
import PrismaClientManager from '@V201/PrismaClient';
import { EventPayloadMap } from '@V201/types';
import logger from 'jet-logger';
import appConfigManager from 'src/V201/appConfigManager';
import { publishEvent } from 'src/V201/eventPublisher';

const validationMessages = {
  runningCardExists: 'There is a card already in running status',
  sameState: 'Campaign already has the same state from before',
  adminApprovalRequired: 'Admin approval for content is required',
  contractIdMissing: 'ID for contract is missing in the record.',
  insufficientBudget:
    'User available budget is lower than the required campaign budget',
  noValidToken: 'There is no valid token associated with the card',
  insufficientTokenBalance: 'Insufficient balance to start the campaign',
  unsupportedType: 'Unsupported campaign type',
  allChecksPassed: 'All checks passed',
};

/**
 * Validates if the campaign can be transitioned to the running state.
 * @param card - The campaign card details.
 * @param currentCardStatusToValidate - The status to validate against.
 * @returns An object containing the validation result and an optional message.
 */

const isCampaignValidForMakeRunning = async (
  card: campaign_twittercard & { user_user?: user_user },
  currentCardStatusToValidate: campaignstatus
): Promise<{ isValid: boolean; message?: string }> => {
  const {
    user_user: cardOwner,
    card_status,
    approve,
    contract_id,
    type,
    campaign_budget,
    fungible_token_id,
  } = card;

  const prisma = await PrismaClientManager.getInstance();

  const runningCardCount = await new CampaignTwitterCardModel(
    prisma
  ).getCampaignCountByStatus(campaignstatus.CampaignRunning, card.id);

  if (Number(runningCardCount) > 0) {
    return { isValid: false, message: validationMessages.runningCardExists };
  }

  if (
    card_status.toLocaleLowerCase() ===
    currentCardStatusToValidate.toLocaleLowerCase()
  ) {
    return { isValid: false, message: validationMessages.sameState };
  }

  if (!approve) {
    return {
      isValid: false,
      message: validationMessages.adminApprovalRequired,
    };
  }

  if (!contract_id) {
    return { isValid: false, message: validationMessages.contractIdMissing };
  }

  // Check if the user has sufficient budget to start the campaign
  if (type === 'HBAR') {
    if (Number(cardOwner?.available_budget) < Number(campaign_budget)) {
      return { isValid: false, message: validationMessages.insufficientBudget };
    }
    // All checks passed for HBAR
    return { isValid: true, message: validationMessages.allChecksPassed };
  }

  // Check if the user has sufficient token balance to start the campaign
  if (type === 'FUNGIBLE') {
    if (!fungible_token_id) {
      return { isValid: false, message: validationMessages.noValidToken };
    }

    const tokenData = await new WhiteListedTokensModel(
      prisma
    ).getTokenDataByAddress(fungible_token_id);
    if (!tokenData) {
      return { isValid: false, message: validationMessages.noValidToken };
    }

    const tokenBalData = await new UserBalancesModel(prisma).getBalanceById(
      tokenData.id
    );

    if (!tokenBalData) {
      return { isValid: false, message: validationMessages.noValidToken };
    }

    const hasSufficientTokenBalance =
      Number(tokenBalData.entity_balance) >= Number(campaign_budget);
    if (!hasSufficientTokenBalance) {
      return {
        isValid: false,
        message: validationMessages.insufficientTokenBalance,
      };
    }

    // All checks passed for fungible token
    return { isValid: true, message: validationMessages.allChecksPassed };
  }

  return { isValid: false, message: validationMessages.unsupportedType };
};

/**
 * Starts the process of publishing a campaign.
 * @param campaignId - The ID of the campaign to publish.
 * @param userId - The ID of the user who owns the campaign.
 * @returns A promise that resolves when the campaign is published.
 * @throws An error if the campaign is invalid for publishing.
 */

export const startPublishingCampaign = async (
  campaignId: number,
  userId: number
): Promise<void> => {
  try {
    const prisma = await PrismaClientManager.getInstance();

    const card = await new CampaignTwitterCardModel(
      prisma
    ).getCampaignsWithOwnerData(campaignId);
    const cardOwner = card?.user_user;

    if (!card || !cardOwner) {
      throw new Error('Could not fetch campaign by tweet ID.');
    }

    const isValidToMakeRunning = await isCampaignValidForMakeRunning(
      card,
      campaignstatus.CampaignRunning
    );

    if (!isValidToMakeRunning.isValid) {
      throw new Error(isValidToMakeRunning.message);
    }

    logger.info('Campaign is valid for publishing');
    // Emit event to perform SM transaction
    publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_CONTENT, {
      cardOwner,
      card,
    });
  } catch (error) {
    publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_ERROR, {
      campaignMeta: { campaignId, userId },
      atStage: 'startPublishingCampaign',
      message: error.message,
      error,
    });
    logger.err('Error in startPublishingCampaign:', error);
    throw error;
  }
};

export const publshCampaignContentHandler = async ({
  cardOwner,
  card,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_CONTENT]): Promise<void> => {
  const prisma = await PrismaClientManager.getInstance();
  const tweetId = await tweetService.publistFirstTweet(card, cardOwner);
  await logCampaignStatus(card.contract_id!, 'firstTweetOut', true);
  const updatedCard = await new CampaignTwitterCardModel(prisma).updateCampaign(
    card.id,
    {
      tweet_id: tweetId,
    }
  );
  publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_CONTENT, {
    cardOwner,
    card: updatedCard,
  });
};

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

    await new TransactionRecordModel(prisma).createTransaction({
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

const publshCampaignFinalTweetHandler = async (
  campaignId: number,
  userId: number
): Promise<void> => {
  // create final tweet
  // publish the final tweet
  // if fails then retry 3 times
  // if success then schedule close campaign event emiiter to BullMQ
  // return sse to the client with the final tweet id and campaignId, userId
};

// handler error for the campaign publish
export const publshCampaignErrorHandler = async ({
  error,
  campaignMeta,
  atStage,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_ERROR]): Promise<void> => {
  logger.err(
    `Error in campaign publish event at stage ${atStage}:${error.message}`
  );
  // handle error
};
