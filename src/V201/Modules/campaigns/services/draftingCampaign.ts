import { campaignstatus } from '@prisma/client';
import { CampaignTypes } from '@services/CampaignLifeCycleBase';
import { convertToTinyHbar, rmKeyFrmData } from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import { CampaignEvents } from '@V201/events/campaign';
import WhiteListedTokensModel from '@V201/Modals/WhiteListedTokens';
import { generateRandomString, safeParsedData } from '@V201/modules/common';
import { DraftCampaignBody } from '@V201/types';
import logger from 'jet-logger';
import { publishEvent } from '../../../eventPublisher';

/**
 * Calculate the maximum activity reward rate based on equal distribution mechanism
 * Formula: Max Activity Rate = (Budget ÷ Expected Users) ÷ 4
 *
 * @param expectedEngagers - Maximum number of expected users/engagers
 * @param budget - Total campaign budget
 * @returns Maximum reward rate per activity
 */
const calculateMaxActivityReward = (
  expectedEngagers: number,
  budget: number
): number => {
  if (expectedEngagers <= 0 || budget <= 0) {
    throw new Error('Expected engagers and budget must be positive numbers');
  }

  // Equal reward distribution: Budget divided by expected users, then divided by 4 activities
  // This ensures each activity gets equal reward rate
  const maxActivityRate = budget / expectedEngagers / 4;

  logger.info(`Equal Reward Distribution Calculation:
    - Budget: ${budget}
    - Expected Engagers: ${expectedEngagers}
    - Max Activity Rate: ${maxActivityRate}
    - Formula: (${budget} ÷ ${expectedEngagers}) ÷ 4 = ${maxActivityRate}`);

  return maxActivityRate;
};

const getRewardsValues = (
  reward: number,
  type: CampaignTypes,
  tokenId?: string,
  decimals?: number
) => {
  if (type === 'HBAR' && !tokenId) {
    return convertToTinyHbar(reward.toString());
  } else if (type === 'FUNGIBLE' && tokenId && decimals !== undefined) {
    return reward * 10 ** decimals;
  }
  throw new Error('Invalid campaign type or missing token information');
};

/**
 * Drafts a new campaign.
 *
 * @param campaignBody - The body of the campaign containing all necessary details.
 * @param userId - The ID of the user creating the campaign.
 * @returns The newly created campaign data.
 */
export const draftCampaign = async (
  campaignBody: DraftCampaignBody,
  userId: number | bigint
) => {
  const {
    name,
    tweet_text,
    expected_engaged_users,
    campaign_budget,
    type,
    media,
    fungible_token_id,
  } = campaignBody;
  const contract_id = generateRandomString(20); // Generate a random contract ID

  const prisma = await createPrismaClient(); // Get an instance of Prisma client

  try {
    if (type === 'FUNGIBLE' && !fungible_token_id) {
      throw new Error('Fungible token ID is required for fungible campaigns');
    }

    // initiate The token Data here.
    let tokenData;
    if (fungible_token_id) {
      tokenData = await new WhiteListedTokensModel(
        prisma
      ).getTokenDataByAddress(fungible_token_id.toString());
    }

    // Calculate equal reward distribution - all activities get the same reward rate
    // Formula: Max Activity Rate = (Budget ÷ Expected Users) ÷ 4
    const equalActivityReward = calculateMaxActivityReward(
      expected_engaged_users,
      Number(campaign_budget)
    );

    logger.info(`Equal Activity Reward Calculation:
      - Expected Engagers: ${expected_engaged_users}
      - Total Budget: ${campaign_budget}
      - Equal Reward Per Activity: ${equalActivityReward}`);

    // Apply equal reward rate to all 4 activity types + campaign budget conversion
    const rewardValues = await Promise.all([
      getRewardsValues(
        equalActivityReward,
        type,
        fungible_token_id,
        tokenData?.decimals?.toNumber()
      ), // comment_reward
      getRewardsValues(
        equalActivityReward,
        type,
        fungible_token_id,
        tokenData?.decimals?.toNumber()
      ), // retweet_reward
      getRewardsValues(
        equalActivityReward,
        type,
        fungible_token_id,
        tokenData?.decimals?.toNumber()
      ), // like_reward
      getRewardsValues(
        equalActivityReward,
        type,
        fungible_token_id,
        tokenData?.decimals?.toNumber()
      ), // quote_reward
      getRewardsValues(
        campaign_budget,
        type,
        fungible_token_id,
        tokenData?.decimals?.toNumber()
      ), // campaign_budget_value
    ]);

    const [
      comment_reward,
      retweet_reward,
      like_reward,
      quote_reward,
      campaign_budget_value,
    ] = rewardValues;

    // Prepare the campaign data to be inserted into the database
    // Extract only the S3 keys from media objects (matching legacy behavior)
    const mediaKeys: string[] =
      media?.map((mediaItem: any) =>
        typeof mediaItem === 'string' ? mediaItem : (mediaItem.key as string)
      ) || [];

    const campaignData = {
      name,
      tweet_text,
      comment_reward,
      retweet_reward,
      like_reward,
      quote_reward,
      campaign_budget: campaign_budget_value,
      card_status: campaignstatus.ApprovalPending,
      amount_spent: 0,
      amount_claimed: 0,
      media: mediaKeys, // Use extracted keys array
      approve: false,
      contract_id,
      type,
      user_user: { connect: { id: userId } },
      ...(type === 'FUNGIBLE' && {
        fungible_token_id: fungible_token_id?.toString(),
        decimals: tokenData?.decimals || 0,
      }),
    };

    // Create a new campaign in the database
    const newCampaign = await prisma.campaign_twittercard.create({
      data: campaignData,
    });
    const sanitizedData = rmKeyFrmData(newCampaign, [
      'last_reply_checkedAt',
      'last_thread_tweet_id',
      'contract_id',
    ]); // Remove sensitive keys from the data

    publishEvent(CampaignEvents.CAMPAIGN_DRAFT_SUCCESS, {
      userId,
      campaignId: newCampaign.id,
      createdAt: new Date(),
      budget: newCampaign.campaign_budget || 0,
      type: newCampaign.type as CampaignTypes,
    }); // Publish the campaign created event

    return safeParsedData(sanitizedData); // Return the sanitized campaign data
  } catch (err) {
    logger.err('Error:: Error while creating campaign'); // Log the error
    throw err; // Rethrow the error
  }
};
