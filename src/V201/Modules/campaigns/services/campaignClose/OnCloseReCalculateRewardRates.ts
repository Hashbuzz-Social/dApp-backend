import createPrismaClient from '@shared/prisma';
import { CampaignEvents } from '@V201/events/campaign';
import CampaignTweetEngagementsModel from '@V201/Modals/CampaignTweetEngagements';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import WhiteListedTokensModel from '@V201/Modals/WhiteListedTokens';
import { CampaignTypes, EventPayloadMap } from '@V201/types';
import {
  calculateMaxActivityReward,
  getRewardsValues,
} from '../draftingCampaign';
import { publishEvent } from 'src/V201/eventPublisher';

/**
 * Recalculates and updates reward rates for a campaign when it is closed.
 * Uses latest engagement metrics to distribute rewards among unique engagers.
 */
export async function onCloseReCalculateRewardsRates(
  params: EventPayloadMap[CampaignEvents.CAMPAIGN_CLOSING_RECALCULATE_REWARDS_RATES]
): Promise<void> {
  const { campaignId } = params;
  if (!campaignId) throw new Error('Invalid campaign ID');

  const prismaClient = await createPrismaClient();
  const campaignModal = new CampaignTwitterCardModel(prismaClient);

  // Fetch campaign and its engagements
  const campaign = await campaignModal.getCampaignsWithUserData(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const engagementsModal = new CampaignTweetEngagementsModel(prismaClient);
  const engagements = await engagementsModal.getEngagementsByCampaign(
    campaignId as bigint,
    {
      payment_status: 'UNPAID',
    }
  );

  // Calculate number of unique engagers
  const uniqueEngagers = new Set(engagements.map((e) => e.user_id));
  const engagerCount = uniqueEngagers.size;

  // Calculate reward rate based on unique engagers and campaign budget
  const rewardRate = calculateMaxActivityReward(
    engagerCount,
    Number(campaign.campaign_budget)
  );

  let tokenData;
  if (campaign.fungible_token_id) {
    tokenData = await new WhiteListedTokensModel(
      prismaClient
    ).getTokenDataByAddress(campaign.fungible_token_id.toString());
  }

  if (!campaign.type) {
    throw new Error('Campaign type is missing or invalid');
  }
  const campaignType = campaign.type as CampaignTypes;

  // Calculate individual reward values for each engagement type
  const rewardValues = await Promise.all([
    getRewardsValues(
      rewardRate,
      campaignType,
      campaign.fungible_token_id ?? undefined,
      tokenData?.decimals?.toNumber()
    ), // comment_reward
    getRewardsValues(
      rewardRate,
      campaignType,
      campaign.fungible_token_id ?? undefined,
      tokenData?.decimals?.toNumber()
    ), // retweet_reward
    getRewardsValues(
      rewardRate,
      campaignType,
      campaign.fungible_token_id ?? undefined,
      tokenData?.decimals?.toNumber()
    ), // like_reward
    getRewardsValues(
      rewardRate,
      campaignType,
      campaign.fungible_token_id ?? undefined,
      tokenData?.decimals?.toNumber()
    ), // quote_reward
  ]);

  const [comment_reward, retweet_reward, like_reward, quote_reward] =
    rewardValues;

  // Update campaign with recalculated reward rates
  await campaignModal.updateCampaign(campaignId as bigint, {
    comment_reward,
    retweet_reward,
    like_reward,
    quote_reward,
  });

  publishEvent(CampaignEvents.CAMPAIGN_CLOSING_DISTRIBUTE_AUTO_REWARDS, {
    campaignId,
  });
}
