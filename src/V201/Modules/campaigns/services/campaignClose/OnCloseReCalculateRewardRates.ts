import { Campaign, Engagement } from '../../models';
import { updateCampaignRewardRates } from '../../repositories/campaignRepository';

/**
 * @fileoverview This service handles the recalculation of reward rates for a campaign when it is closed.
 * It is triggered by the CAMPAIGN_CLOSING_RECALCULATE_REWARDS_RATES event.
 * The service fetches the latest engagement metrics and recalculates the reward rates accordingly.
 * Finally, it updates the campaign record in the database with the new reward rates.
 */

/**
 * Recalculates reward rates for a campaign based on the number of engagers.
 * @param campaignId - The ID of the campaign to recalculate rewards for.
 */
export async function recalculateRewardRatesOnClose(
  campaignId: string
): Promise<void> {
  // Fetch campaign and its engagements
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const engagements: Engagement[] = await Engagement.find({ campaignId });

  // Calculate number of unique engagers
  const uniqueEngagers = new Set(engagements.map((e) => e.userId));
  const engagerCount = uniqueEngagers.size;

  // Example logic: Distribute totalRewardPool equally among engagers
  const totalRewardPool = campaign.totalRewardPool || 0;
  const rewardRate = engagerCount > 0 ? totalRewardPool / engagerCount : 0;

  // Update campaign with new reward rate
  await updateCampaignRewardRates(campaignId, rewardRate);
}
