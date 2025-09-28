import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import { publishEvent } from '../../../eventPublisher';
import { CampaignEvents } from '@V201/events/campaign';
import XApiEngagementTracker from './xEngagementTracker';
import { PrismaClient } from '@prisma/client';

interface EngagementMetrics {
  likes: number;
  retweets: number;
  quotes: number;
  comments: number;
  totalEngagements: number;
  uniqueEngagers: number;
}

interface RewardDistributionData {
  campaignId: bigint;
  userId: string;
  engagementType: 'like' | 'retweet' | 'quote' | 'comment';
  rewardAmount: number;
  walletAddress?: string;
}

interface CampaignRewardSummary {
  campaignId: bigint;
  totalRewardsDistributed: number;
  totalUniqueRecipients: number;
  distributionBreakdown: {
    likes: { count: number; totalReward: number };
    retweets: { count: number; totalReward: number };
    quotes: { count: number; totalReward: number };
    comments: { count: number; totalReward: number };
  };
}

/**
 * Service for automatic reward calculation and distribution based on engagement data
 */
export class AutoRewardDistributor {
  private prisma: PrismaClient | null = null;
  private tracker: XApiEngagementTracker;

  constructor() {
    this.initializePrisma();
    this.tracker = new XApiEngagementTracker();
  }

  private async initializePrisma() {
    this.prisma = await createPrismaClient();
  }

  /**
   * Calculate and distribute rewards for a completed campaign
   */
  async processRewardDistribution(
    campaignId: bigint
  ): Promise<CampaignRewardSummary> {
    try {
      logger.info(`Starting reward distribution for campaign ${campaignId}`);

      // Get campaign details
      const campaign = await this.prisma?.campaign_twittercard.findUnique({
        where: { id: campaignId },
        include: {
          user_user: true, // Campaign owner
        },
      });

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      // Get final engagement metrics
      const metrics = await this.tracker.getCampaignMetrics(campaignId);
      if (!metrics) {
        throw new Error(
          `No engagement metrics found for campaign ${campaignId}`
        );
      }

      // Calculate rewards based on the equal distribution mechanism
      const rewardRates = {
        like_reward: campaign.like_reward || 0,
        retweet_reward: campaign.retweet_reward || 0,
        quote_reward: campaign.quote_reward || 0,
        comment_reward: campaign.comment_reward || 0,
      };

      // Get eligible engagers (mock data - in production this would come from X API data)
      const eligibleEngagers = this.getEligibleEngagers(campaignId, metrics);

      // Distribute rewards
      const distributionSummary = await this.distributeRewards(
        campaignId,
        eligibleEngagers,
        rewardRates,
        metrics
      );

      // Update campaign status
      await this.updateCampaignRewardStatus(campaignId, distributionSummary);

      // Publish reward distribution complete event
      publishEvent(CampaignEvents.CAMPAIGN_CLOSED, {
        campaignId,
        userId: BigInt(campaign.owner_id),
        actualEngagers: metrics.uniqueEngagers,
        expectedEngagers: Math.ceil(
          Number(campaign.campaign_budget) /
            ((rewardRates.comment_reward || 1) * 4)
        ),
        closedAt: new Date(),
      });

      logger.info(
        `Completed reward distribution for campaign ${campaignId}: ${JSON.stringify(
          distributionSummary
        )}`
      );
      return distributionSummary;
    } catch (error) {
      logger.err(
        `Error processing reward distribution: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Publish error event
      publishEvent(CampaignEvents.CAMPAIGN_CLOSING_ERROR, {
        campaignId,
        userId: BigInt(0), // We'll need to get this from campaign data
        error: error instanceof Error ? error.message : String(error),
        stage: 'reward_distribution',
      });

      throw error;
    }
  }

  /**
   * Get eligible engagers based on engagement data
   * In production, this would fetch actual user data from X API responses
   */
  private getEligibleEngagers(
    campaignId: bigint,
    metrics: EngagementMetrics
  ): RewardDistributionData[] {
    const eligibleEngagers: RewardDistributionData[] = [];

    // Mock eligible engagers - in production this would be from actual X API data
    // For now, generate mock data based on metrics
    const mockUserIds = this.generateMockUserIds(metrics.uniqueEngagers);

    // Distribute engagers across different engagement types
    const engagementTypes: Array<'like' | 'retweet' | 'quote' | 'comment'> = [
      'like',
      'retweet',
      'quote',
      'comment',
    ];
    const engagementCounts = [
      metrics.likes,
      metrics.retweets,
      metrics.quotes,
      metrics.comments,
    ];

    engagementTypes.forEach((type, index) => {
      const count = engagementCounts[index];
      for (let i = 0; i < count; i++) {
        const userId = mockUserIds[i % mockUserIds.length];
        eligibleEngagers.push({
          campaignId,
          userId,
          engagementType: type,
          rewardAmount: 0, // Will be calculated based on campaign rates
        });
      }
    });

    return eligibleEngagers;
  }

  /**
   * Generate mock user IDs for testing
   */
  private generateMockUserIds(count: number): string[] {
    const userIds: string[] = [];
    for (let i = 0; i < count; i++) {
      userIds.push(`mock_user_${i}_${Date.now()}`);
    }
    return userIds;
  }

  /**
   * Distribute rewards to eligible engagers
   */
  private async distributeRewards(
    campaignId: bigint,
    eligibleEngagers: RewardDistributionData[],
    rewardRates: any,
    metrics: any
  ): Promise<CampaignRewardSummary> {
    const distributionSummary: CampaignRewardSummary = {
      campaignId,
      totalRewardsDistributed: 0,
      totalUniqueRecipients: 0,
      distributionBreakdown: {
        likes: { count: 0, totalReward: 0 },
        retweets: { count: 0, totalReward: 0 },
        quotes: { count: 0, totalReward: 0 },
        comments: { count: 0, totalReward: 0 },
      },
    };

    const uniqueRecipients = new Set<string>();
    const rewardTransactions: any[] = [];

    for (const engager of eligibleEngagers) {
      let rewardAmount = 0;

      // Calculate reward based on engagement type
      switch (engager.engagementType) {
        case 'like':
          rewardAmount = rewardRates.like_reward;
          distributionSummary.distributionBreakdown.likes.count++;
          distributionSummary.distributionBreakdown.likes.totalReward +=
            rewardAmount;
          break;
        case 'retweet':
          rewardAmount = rewardRates.retweet_reward;
          distributionSummary.distributionBreakdown.retweets.count++;
          distributionSummary.distributionBreakdown.retweets.totalReward +=
            rewardAmount;
          break;
        case 'quote':
          rewardAmount = rewardRates.quote_reward;
          distributionSummary.distributionBreakdown.quotes.count++;
          distributionSummary.distributionBreakdown.quotes.totalReward +=
            rewardAmount;
          break;
        case 'comment':
          rewardAmount = rewardRates.comment_reward;
          distributionSummary.distributionBreakdown.comments.count++;
          distributionSummary.distributionBreakdown.comments.totalReward +=
            rewardAmount;
          break;
      }

      if (rewardAmount > 0) {
        // Store reward transaction (in production, this would trigger actual token transfers)
        rewardTransactions.push({
          campaign_id: campaignId,
          user_id: engager.userId,
          engagement_type: engager.engagementType,
          reward_amount: rewardAmount,
          transaction_status: 'pending',
          created_at: new Date(),
        });

        distributionSummary.totalRewardsDistributed += rewardAmount;
        uniqueRecipients.add(engager.userId);
      }
    }

    distributionSummary.totalUniqueRecipients = uniqueRecipients.size;

    // Store reward transactions in database
    await this.storeRewardTransactions(rewardTransactions);

    // Process token transfers (mock implementation)
    await this.processTokenTransfers(rewardTransactions);

    logger.info(
      `Distributed rewards to ${distributionSummary.totalUniqueRecipients} unique users`
    );
    return distributionSummary;
  }

  /**
   * Store reward transactions in database
   */
  private async storeRewardTransactions(transactions: any[]): Promise<void> {
    try {
      // In production, this would use a proper reward_transactions table
      for (const transaction of transactions) {
        logger.info(
          `Storing reward transaction: ${JSON.stringify(transaction)}`
        );
        // await this.prisma.reward_transactions.create({ data: transaction });
      }

      logger.info(`Stored ${transactions.length} reward transactions`);
    } catch (error) {
      logger.err(
        `Error storing reward transactions: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Update campaign reward distribution status
   */
  private async updateCampaignRewardStatus(
    campaignId: bigint,
    summary: CampaignRewardSummary
  ): Promise<void> {
    try {
      await this.prisma?.campaign_twittercard.update({
        where: { id: campaignId },
        data: {
          card_status: 'RewardsDistributed',
          amount_spent: summary.totalRewardsDistributed,
          // In production, add reward distribution fields to schema
          // rewards_distributed: summary.totalRewardsDistributed,
          // unique_recipients: summary.totalUniqueRecipients,
        },
      });

      logger.info(`Updated campaign ${campaignId} reward status`);
    } catch (error) {
      logger.err(
        `Error updating campaign reward status: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

export default AutoRewardDistributor;
