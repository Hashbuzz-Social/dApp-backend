import { campaign_twittercard } from '@prisma/client';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import {
  RewardCalculationResult,
  RewardCalculationPayload,
  EngagementSummary,
  CampaignExpiryOperationError
} from '../types';

// =============================================================================
// REWARD CALCULATION SERVICE
// =============================================================================

/**
 * Functional service to calculate and prepare reward distribution
 * Self-dependent: fetches required data from database as needed
 */
export class CampaignRewardCalculator {
  /**
   * Main reward calculation function
   * Calculates individual rewards and prepares distribution data
   */
  static async calculateRewards(payload: RewardCalculationPayload): Promise<RewardCalculationResult> {
    const { context, campaign, engagementSummary } = payload;
    const { campaignId, requestId } = context;

    try {
      logger.info(`[${requestId}] Starting reward calculation for campaign ${String(campaignId)}`);

      // Validate budget constraints
      const budgetCheck = await this.validateBudgetConstraints(campaign, engagementSummary, requestId);
      if (!budgetCheck.isValid) {
        throw new CampaignExpiryOperationError(
          `Budget validation failed: ${budgetCheck.reason}`,
          'BUDGET_VALIDATION_FAILED',
          campaignId,
          requestId,
          'reward-calculation'
        );
      }

      // Fetch eligible engagements with user details
      const eligibleEngagements = await this.fetchEligibleEngagements(campaign, requestId);
      
      // Calculate individual rewards
      const rewardBreakdown = await this.calculateIndividualRewards(
        eligibleEngagements, 
        campaign, 
        engagementSummary, 
        requestId
      );

      // Calculate totals and remaining balance
      const totalDistributed = rewardBreakdown.reduce((sum, reward) => sum + reward.amount, 0);
      const campaignBudget = campaign.campaign_budget || 0;
      const remainingBalance = campaignBudget - totalDistributed;

      // Prepare final result
      const result: RewardCalculationResult = {
        totalDistributedAmount: totalDistributed,
        remainingBalance,
        usersRewarded: rewardBreakdown.length,
        rewardBreakdown,
        success: true,
        errors: [],
        calculationTimestamp: new Date()
      };

      logger.info(`[${requestId}] Reward calculation completed - Total: ${totalDistributed}, Users: ${rewardBreakdown.length}`);
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`[${requestId}] Reward calculation failed for campaign ${String(campaignId)}: ${errorMsg}`);
      
      return {
        totalDistributedAmount: 0,
        remainingBalance: campaign.campaign_budget || 0,
        usersRewarded: 0,
        rewardBreakdown: [],
        success: false,
        errors: [errorMsg],
        calculationTimestamp: new Date()
      };
    }
  }

  /**
   * Validate budget constraints before calculating rewards
   */
  private static async validateBudgetConstraints(
    campaign: campaign_twittercard,
    engagementSummary: EngagementSummary,
    requestId: string
  ): Promise<{ isValid: boolean; reason?: string }> {
    try {
      const campaignBudget = campaign.campaign_budget || 0;
      const estimatedRewards = engagementSummary.totalRewardAmount;

      if (campaignBudget <= 0) {
        return {
          isValid: false,
          reason: 'Campaign has no budget allocated'
        };
      }

      if (estimatedRewards > campaignBudget) {
        return {
          isValid: false,
          reason: `Estimated rewards (${estimatedRewards}) exceed budget (${campaignBudget})`
        };
      }

      // Check if campaign has sufficient balance (not already spent)
      const amountSpent = campaign.amount_spent || 0;
      const availableBalance = campaignBudget - amountSpent;

      if (estimatedRewards > availableBalance) {
        return {
          isValid: false,
          reason: `Estimated rewards (${estimatedRewards}) exceed available balance (${availableBalance})`
        };
      }

      logger.info(`[${requestId}] Budget validation passed - Available: ${availableBalance}, Required: ${estimatedRewards}`);
      return { isValid: true };

    } catch (error) {
      logger.err(`[${requestId}] Budget validation failed: ${String(error)}`);
      return {
        isValid: false,
        reason: `Budget validation error: ${String(error)}`
      };
    }
  }

  /**
   * Fetch eligible engagements with user details
   */
  private static async fetchEligibleEngagements(
    campaign: campaign_twittercard,
    requestId: string
  ): Promise<any[]> {
    try {
      const prisma = await createPrismaClient();
      
      const engagements = await prisma.campaign_tweetengagements.findMany({
        where: {
          tweet_id: campaign.id,
          is_valid_timing: true
        }
      });

      logger.info(`[${requestId}] Fetched ${engagements.length} eligible engagements`);
      return engagements;

    } catch (error) {
      logger.err(`[${requestId}] Failed to fetch eligible engagements: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Calculate individual rewards for each eligible engagement
   */
  private static async calculateIndividualRewards(
    engagements: any[],
    campaign: campaign_twittercard,
    engagementSummary: EngagementSummary,
    requestId: string
  ): Promise<Array<{
    userId: bigint;
    amount: number;
    engagementType: string;
    transactionId?: string;
  }>> {
    try {
      const rewardBreakdown: Array<{
        userId: bigint;
        amount: number;
        engagementType: string;
        transactionId?: string;
      }> = [];

      // Group engagements by user to handle multiple engagements per user
      const userEngagements = new Map<string, any[]>();
      
      engagements.forEach(engagement => {
        const userId = engagement.user_id;
        if (!userEngagements.has(userId)) {
          userEngagements.set(userId, []);
        }
        userEngagements.get(userId)?.push(engagement);
      });

      // Calculate rewards for each user
      for (const [userId, userEngagementList] of userEngagements) {
        // For simplicity, take the highest value engagement per user
        let bestEngagement = userEngagementList[0];
        let maxReward = this.getRewardForEngagementType(bestEngagement.engagement_type, campaign);

        for (const engagement of userEngagementList) {
          const rewardAmount = this.getRewardForEngagementType(engagement.engagement_type, campaign);
          if (rewardAmount > maxReward) {
            bestEngagement = engagement;
            maxReward = rewardAmount;
          }
        }

        if (maxReward > 0) {
          rewardBreakdown.push({
            userId: BigInt(userId),
            amount: maxReward,
            engagementType: bestEngagement.engagement_type,
            transactionId: undefined // Will be set during actual distribution
          });
        }
      }

      logger.info(`[${requestId}] Calculated ${rewardBreakdown.length} individual rewards`);
      return rewardBreakdown;

    } catch (error) {
      logger.err(`[${requestId}] Individual reward calculation failed: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Get reward amount for specific engagement type
   */
  private static getRewardForEngagementType(engagementType: string, campaign: campaign_twittercard): number {
    switch (engagementType) {
      case 'like':
        return campaign.like_reward || 0;
      case 'retweet':
        return campaign.retweet_reward || 0;
      case 'quote':
        return campaign.quote_reward || 0;
      case 'reply':
        return campaign.comment_reward || 0;
      default:
        return 0;
    }
  }

  /**
   * Recalculate rewards with updated parameters
   */
  static async recalculateRewards(
    campaignId: bigint,
    requestId: string,
    newRewardRates?: {
      likeReward?: number;
      retweetReward?: number;
      quoteReward?: number;
      replyReward?: number;
    }
  ): Promise<RewardCalculationResult> {
    try {
      logger.info(`[${requestId}] Recalculating rewards for campaign ${String(campaignId)}`);

      const prisma = await createPrismaClient();
      
      // Fetch campaign
      let campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: campaignId }
      });

      if (!campaign) {
        throw new CampaignExpiryOperationError(
          'Campaign not found for recalculation',
          'CAMPAIGN_NOT_FOUND',
          campaignId,
          requestId,
          'reward-calculation'
        );
      }

      // Update reward rates if provided
      if (newRewardRates) {
        campaign = await prisma.campaign_twittercard.update({
          where: { id: campaignId },
          data: {
            like_reward: newRewardRates.likeReward ?? campaign.like_reward,
            retweet_reward: newRewardRates.retweetReward ?? campaign.retweet_reward,
            quote_reward: newRewardRates.quoteReward ?? campaign.quote_reward,
            comment_reward: newRewardRates.replyReward ?? campaign.comment_reward
          }
        });
      }

      // Recalculate with updated rates
      const mockEngagementSummary: EngagementSummary = {
        totalEngagements: 0,
        validEngagements: 0,
        totalRewardAmount: 0,
        eligibleUsers: 0,
        engagementBreakdown: { likes: 0, retweets: 0, quotes: 0, replies: 0 },
        dataCollectionTimestamp: new Date()
      };

      const payload: RewardCalculationPayload = {
        context: {
          campaignId,
          requestId,
          startTime: new Date(),
          metadata: { recalculation: true }
        },
        campaign,
        engagementSummary: mockEngagementSummary
      };

      return await this.calculateRewards(payload);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`[${requestId}] Recalculation failed: ${errorMsg}`);
      
      return {
        totalDistributedAmount: 0,
        remainingBalance: 0,
        usersRewarded: 0,
        rewardBreakdown: [],
        success: false,
        errors: [errorMsg],
        calculationTimestamp: new Date()
      };
    }
  }

  /**
   * Get reward distribution preview without executing
   */
  static async getRewardPreview(
    campaignId: bigint,
    requestId: string
  ): Promise<{
    estimatedTotal: number;
    estimatedUsers: number;
    breakdown: Array<{
      engagementType: string;
      count: number;
      totalReward: number;
    }>;
  }> {
    try {
      const prisma = await createPrismaClient();
      
      const campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: campaignId }
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const engagements = await prisma.campaign_tweetengagements.findMany({
        where: {
          tweet_id: campaign.id,
          is_valid_timing: true
        }
      });

      const breakdown: Array<{
        engagementType: string;
        count: number;
        totalReward: number;
      }> = [];

      const typeCount = new Map<string, number>();
      engagements.forEach(eng => {
        const type = eng.engagement_type;
        typeCount.set(type, (typeCount.get(type) || 0) + 1);
      });

      let estimatedTotal = 0;
      for (const [type, count] of typeCount) {
        const rewardPerEngagement = this.getRewardForEngagementType(type, campaign);
        const totalForType = count * rewardPerEngagement;
        
        breakdown.push({
          engagementType: type,
          count,
          totalReward: totalForType
        });
        
        estimatedTotal += totalForType;
      }

      const uniqueUsers = new Set(engagements.map(e => e.user_id)).size;

      return {
        estimatedTotal,
        estimatedUsers: uniqueUsers,
        breakdown
      };

    } catch (error) {
      logger.err(`[${requestId}] Preview calculation failed: ${String(error)}`);
      throw error;
    }
  }
}