import {
  campaignstatus,
  campaign_twittercard,
  user_user,
} from '@prisma/client';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import UserBalancesModel from '@V201/Modals/UserBalances';
import WhiteListedTokensModel from '@V201/Modals/WhiteListedTokens';
import PrismaClientManager from '@V201/PrismaClient';

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

  if (type === 'HBAR') {
    if (Number(cardOwner?.available_budget) < Number(campaign_budget)) {
      return { isValid: false, message: validationMessages.insufficientBudget };
    }
    return { isValid: true, message: validationMessages.allChecksPassed };
  }

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

    return { isValid: true, message: validationMessages.allChecksPassed };
  }

  return { isValid: false, message: validationMessages.unsupportedType };
};

export const startPublishingCampaign = async (
  campaignId: number,
  userId: number
): Promise<void> => {
  // get the cmapign details
  // check is cmapaign is valid for the publishing
  // then crate fiest conent post to X platform using API
  // emit event to next setep i.e to perform SM contract tranction to publish the campaign
  // return fist tweet Id or post Id;

  const prisma = await PrismaClientManager.getInstance();

  const card = await new CampaignTwitterCardModel(
    prisma
  ).getCampaignsWithOwnerData(campaignId);
  const cardOwner = card?.user_user;

  if (!card) {
    throw new Error('Campaign not found');
  }

  const isValidToMakeRunning = await isCampaignValidForMakeRunning(
    card,
    campaignstatus.CampaignRunning
  );

  if (!isValidToMakeRunning.isValid) {
    throw new Error(isValidToMakeRunning.message);
  }
};

const publshCampaignSMTransactionHandler = async (
  campaignId: number,
  userId: number
): Promise<void> => {
  // ferform create campaign transaction on SM
  // is scuccess then update remaingn balance and emit event {Campaigner:Balance:Update {userId , newBalance , enityType, entityid}}
  // then emit next step event to perform the final tweet thered about rates and closing time of the campaign
  // update transaction status in DB
  //  update campaign status in DB
  // return transaction Id
  // if faiils then delete the campaign and return error
  // emit CampaignPublish:Error event with error message and userID campaignId
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
