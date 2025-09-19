import createPrismaClient from '@shared/prisma';
import { CampaignEvents } from 'src/V201/AppEvents';
import logger from 'jet-logger';
import { publishEvent } from 'src/V201/eventPublisher';
import AutoRewardDistributor from './autoRewardDistributor';

interface RewardRecalculationResult {
  originalRate: number;
  newRate: number;
  budgetUsed: number;
  refundAmount: number;
  rateChanged: boolean;
}

interface CampaignClosingData {
  campaignId: number;
  actualEngagers: number;
  totalEngagements: number;
  engagementBreakdown: {
    comments: number;
    retweets: number;
    likes: number;
    quotes: number;
  };
}

/**
 * Recalculate reward rates based on actual vs expected engagers
 * Implements the equal reward distribution mechanism at campaign closing
 */
const recalculateRewardRates = (
  originalBudget: number,
  expectedEngagers: number,
  actualEngagers: number
): RewardRecalculationResult => {
  // Original rate calculation: (Budget ÷ Expected Users) ÷ 4
  const originalRate = originalBudget / expectedEngagers / 4;

  logger.info(`Campaign Closing - Reward Recalculation:
    Original Budget: ${originalBudget}
    Expected Engagers: ${expectedEngagers}
    Actual Engagers: ${actualEngagers}
    Original Rate per Activity: ${originalRate}`);

  if (actualEngagers <= expectedEngagers) {
    // Case 1: Fewer or equal engagers than expected
    // Each engager receives the maximum rate per activity
    // Unused budget is refunded

    const budgetUsed = actualEngagers * originalRate * 4; // 4 activities per engager
    const refundAmount = originalBudget - budgetUsed;

    logger.info(`Case 1 - Fewer/Equal Engagers:
      Rate Maintained: ${originalRate}
      Budget Used: ${budgetUsed}
      Refund Amount: ${refundAmount}`);

    return {
      originalRate,
      newRate: originalRate,
      budgetUsed,
      refundAmount,
      rateChanged: false,
    };
  } else {
    // Case 2: More engagers than expected
    // Recalculate the rate: (Budget ÷ Actual Engagers) ÷ 4

    const newRate = originalBudget / actualEngagers / 4;
    const budgetUsed = originalBudget; // Full budget is used
    const refundAmount = 0;

    logger.info(`Case 2 - More Engagers:
      New Rate per Activity: ${newRate}
      Budget Used: ${budgetUsed} (Full Budget)
      Refund Amount: ${refundAmount}`);

    return {
      originalRate,
      newRate,
      budgetUsed,
      refundAmount,
      rateChanged: true,
    };
  }
};

/**
 * Process campaign closing with reward recalculation
 * Handles both cases: fewer and more engagers than expected
 */
export const processCampaignClosing = async (
  closingData: CampaignClosingData,
  userId: bigint
): Promise<RewardRecalculationResult> => {
  const { campaignId, actualEngagers, totalEngagements } = closingData;

  const prisma = await createPrismaClient();

  try {
    // Fetch campaign data
    const campaign = await prisma.campaign_twittercard.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new Error(`Campaign with ID ${campaignId} not found`);
    }

    if (!campaign.campaign_budget) {
      throw new Error('Campaign missing required budget data');
    }

    // For now, we'll use a calculated expected engagers based on budget and current reward structure
    // This should be replaced with actual expected_engaged_users field from database
    const expectedEngagers = Math.ceil(Number(campaign.campaign_budget) / ((campaign.comment_reward || 0) * 4)) || 1;

    // Calculate reward recalculation
    const recalculationResult = recalculateRewardRates(
      Number(campaign.campaign_budget),
      expectedEngagers,
      actualEngagers
    );

    // Update campaign with actual engagement data and new rates
    await prisma.campaign_twittercard.update({
      where: { id: campaignId },
      data: {
        // Store actual engagement data
        amount_spent: recalculationResult.budgetUsed,

        // Update reward rates if recalculated
        ...(recalculationResult.rateChanged && {
          comment_reward: recalculationResult.newRate,
          retweet_reward: recalculationResult.newRate,
          like_reward: recalculationResult.newRate,
          quote_reward: recalculationResult.newRate,
        }),

        // Mark campaign as closed
        card_status: 'Completed' as any,
      },
    });

    // Publish campaign closing event
    publishEvent(CampaignEvents.CAMPAIGN_CLOSED, {
      campaignId,
      userId,
      actualEngagers,
      expectedEngagers,
      closedAt: new Date(),
    });

    // If there's a refund, publish refund event
    if (recalculationResult.refundAmount > 0) {
      publishEvent(CampaignEvents.CAMPAIGN_BUDGET_REFUND, {
        campaignId,
        userId,
        refundAmount: recalculationResult.refundAmount,
        reason: 'Fewer engagers than expected',
      });
    }

    // If rates were recalculated, publish rate update event
    if (recalculationResult.rateChanged) {
      publishEvent(CampaignEvents.CAMPAIGN_RATE_UPDATED, {
        campaignId,
        userId,
        oldRate: recalculationResult.originalRate,
        newRate: recalculationResult.newRate,
        reason: 'Campaign closing recalculation',
      });
    }

    // Auto-distribute rewards based on collected engagement data
    try {
      const rewardDistributor = new AutoRewardDistributor();
      const rewardSummary = await rewardDistributor.processRewardDistribution(BigInt(campaignId));

      logger.info(`Auto reward distribution completed for campaign ${campaignId}:
        - Total Rewards Distributed: ${rewardSummary.totalRewardsDistributed}
        - Unique Recipients: ${rewardSummary.totalUniqueRecipients}`);
    } catch (rewardError) {
      const errorMsg = rewardError instanceof Error ? rewardError.message : String(rewardError);
      logger.err(`Error during auto reward distribution for campaign ${campaignId}: ${errorMsg}`);
      // Continue execution - don't let reward distribution failure stop campaign closing
    }

    logger.info(`Campaign closing completed for campaign ${campaignId}:
      - Actual Engagers: ${actualEngagers}
      - Total Engagements: ${totalEngagements}
      - Rate Changed: ${String(recalculationResult.rateChanged)}
      - Refund Amount: ${recalculationResult.refundAmount}`);

    return recalculationResult;

  } catch (error) {
    logger.err(`Error processing campaign closing for campaign ${campaignId}: ${error instanceof Error ? error.message : String(error)}`);

    // Publish error event
    publishEvent(CampaignEvents.CAMPAIGN_CLOSING_ERROR, {
      campaignId,
      userId,
      error: error instanceof Error ? error.message : String(error),
      stage: 'campaign_closing',
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

export default {
  processCampaignClosing,
  recalculateRewardRates,
};
