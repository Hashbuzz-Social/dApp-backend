import { campaignstatus, Prisma } from '@prisma/client';
import { CampaignTypes } from '@services/CampaignLifeCycleBase';
import { convertToTinyHbar, rmKeyFrmData } from '@shared/helper';
import { CampaignEvents } from '@V201/events/campaign';

import WhiteListedTokensModel from '@V201/Modals/WhiteListedTokens';
import { generateRandomString, safeParsedData } from '@V201/modules/common';
import PrismaClientManager from '@V201/PrismaClient';
import { DraftCampaignBody } from '@V201/types';
import logger from 'jet-logger';
import { publishEvent } from 'src/V201/eventPublisher';

const calculateMaxActivityReward = (engagers: number, budget: number) =>
  budget / engagers / 4;

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
  const maxActivityReward = calculateMaxActivityReward(
    expected_engaged_users,
    Number(campaign_budget)
  ); // Calculate the maximum reward per activity

  const prisma = await PrismaClientManager.getInstance(); // Get an instance of Prisma client

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

    // Calculate reward values for different activities and the total campaign budget
    const rewardValues = await Promise.all([
      getRewardsValues(
        maxActivityReward,
        type,
        fungible_token_id,
        tokenData?.decimals?.toNumber()
      ),
      getRewardsValues(
        maxActivityReward,
        type,
        fungible_token_id,
        tokenData?.decimals?.toNumber()
      ),
      getRewardsValues(
        maxActivityReward,
        type,
        fungible_token_id,
        tokenData?.decimals?.toNumber()
      ),
      getRewardsValues(
        maxActivityReward,
        type,
        fungible_token_id,
        tokenData?.decimals?.toNumber()
      ),
      getRewardsValues(
        campaign_budget,
        type,
        fungible_token_id,
        tokenData?.decimals?.toNumber()
      ),
    ]);

    const [
      comment_reward,
      retweet_reward,
      like_reward,
      quote_reward,
      campaign_budget_value,
    ] = rewardValues;

    // Prepare the campaign data to be inserted into the database
    const campaignData: Prisma.campaign_twittercardCreateInput = {
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
      media,
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
      budget: newCampaign.campaign_budget!,
      type: newCampaign.type as CampaignTypes,
    }); // Publish the campaign created event

    return safeParsedData(sanitizedData); // Return the sanitized campaign data
  } catch (err) {
    logger.err('Error:: Error while creating campaign', err); // Log the error
    throw err; // Rethrow the error
  }
};
