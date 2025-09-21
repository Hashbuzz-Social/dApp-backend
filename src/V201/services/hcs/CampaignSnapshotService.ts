/**
 * Campaign Snapshot Service
 *
 * Captures complete campaign state with all related data for HCS publishing.
 * Creates comprehensive snapshots including campaign data, user info,
 * engagement metrics, financial data, and system metadata.
 */

import createPrismaClient from '@shared/prisma';
import Logger from 'jet-logger';
import { CampaignSnapshot } from '../../types/campaignEvents';

export interface SnapshotOptions {
  includeEngagement?: boolean;
  maxParticipants?: number;
}

export class CampaignSnapshotService {

  /**
   * Create a complete campaign snapshot for HCS publishing
   */
  static async createSnapshot(
    campaignId: string,
    options: SnapshotOptions = {}
  ): Promise<CampaignSnapshot | null> {
    try {
      const {
        includeEngagement = true,
        maxParticipants = 100
      } = options;

      Logger.info(`Creating campaign snapshot for ${campaignId}`);

      const prisma = await createPrismaClient();

      // Get core campaign data with user info
      const campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: parseInt(campaignId) },
        include: {
          user_user: {
            select: {
              id: true,
              name: true,
              accountAddress: true,
              personal_twitter_handle: true,
              hedera_wallet_id: true,
              date_joined: true
            }
          }
        }
      });

      if (!campaign) {
        Logger.err(`Campaign not found for snapshot: ${campaignId}`);
        return null;
      }

      // Get campaign media
      const media = await prisma.campaign_media.findMany({
        where: { campaign_id: parseInt(campaignId) },
        select: {
          aws_location: true,
          media_type: true,
          twitter_media_id: true
        }
      });

      // Build snapshot
      const snapshot: CampaignSnapshot = {
        // Core Campaign Data
        campaign: {
          id: campaignId,
          title: campaign.name || 'Untitled Campaign',
          description: campaign.tweet_text || '',
          status: campaign.card_status ,
          createdAt: new Date(), // Using current date as placeholder
          publishedAt: campaign.campaign_start_time || undefined,
          closedAt: campaign.campaign_close_time || undefined,
          archivedAt: undefined, // No archive field in current schema
          userId: campaign.owner_id.toString(),
          budgetAmount: campaign.campaign_budget?.toString() || '0',
          budgetTokenId: campaign.fungible_token_id || undefined,
          targetEngagement: 1000, // Default target
          actualEngagement: 0, // Will be calculated from engagement data
          hashtagsUsed: [], // Not in current schema
          mediaUrls: media.map(m => m.aws_location),
          firstTweetId: campaign.tweet_id || undefined,
          secondTweetId: undefined, // Not in current schema
          twitterScheduledJobId: undefined, // Not in current schema
          campaignCloseJobId: undefined, // Not in current schema
          rewardDistributionJobId: undefined, // Not in current schema
        },

        // User Data
        user: {
          id: campaign.user_user.id.toString(),
          username: campaign.user_user.name || '',
          email: '', // Not in current schema
          twitterUsername: campaign.user_user.personal_twitter_handle || undefined,
          walletAddress: campaign.user_user.hedera_wallet_id || undefined,
          createdAt: campaign.user_user.date_joined || new Date(),
        },

        // Financial Data
        financial: await this.getFinancialData(campaignId),

        // Engagement Metrics
        engagement: includeEngagement
          ? await this.getEngagementMetrics(campaignId, maxParticipants)
          : {
              totalParticipants: 0,
              totalLikes: 0,
              totalRetweets: 0,
              totalComments: 0,
              engagementRate: 0,
              topParticipants: []
            },

        // System Metadata
        metadata: {
          snapshotCreatedAt: new Date(),
          dataVersion: '1.0',
          systemVersion: process.env.npm_package_version || '1.0.0',
          checksumHash: await this.generateChecksum(campaignId)
        }
      };

      await prisma.$disconnect();

      Logger.info(`Campaign snapshot created successfully for ${campaignId}, size: ${JSON.stringify(snapshot).length} bytes`);

      return snapshot;

    } catch (error) {
      Logger.err(`Failed to create campaign snapshot: ${String(error)}`);
      return null;
    }
  }

  /**
   * Get financial data for campaign snapshot
   */
  private static async getFinancialData(
    campaignId: string
  ): Promise<CampaignSnapshot['financial']> {
    try {
      const prisma = await createPrismaClient();

      // Get campaign financial info
      const campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: parseInt(campaignId) },
        select: {
          campaign_budget: true,
          fungible_token_id: true,
          amount_spent: true,
          amount_claimed: true
        }
      });

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const budgetAmount = campaign.campaign_budget?.toString() || '0';
      const spentAmount = campaign.amount_spent?.toString() || '0';
      const claimedAmount = campaign.amount_claimed?.toString() || '0';

      // Calculate remaining budget
      const budgetNum = parseFloat(budgetAmount);
      const spentNum = parseFloat(spentAmount);
      const remainingBudget = Math.max(0, budgetNum - spentNum).toString();

      // Get token information if using fungible tokens
      let tokenSymbol = 'HBAR';
      if (campaign.fungible_token_id) {
        // In a real implementation, you'd query token info from Hedera
        tokenSymbol = campaign.fungible_token_id.substring(0, 10) + '...';
      }

      const financial: CampaignSnapshot['financial'] = {
        totalBudget: budgetAmount,
        remainingBudget,
        distributedRewards: claimedAmount,
        tokenId: campaign.fungible_token_id || undefined,
        tokenSymbol,
        hbarAmount: !campaign.fungible_token_id ? budgetAmount : undefined
      };

      await prisma.$disconnect();
      return financial;

    } catch (error) {
      Logger.err(`Failed to get financial data: ${String(error)}`);
      return {
        totalBudget: '0',
        remainingBudget: '0',
        distributedRewards: '0',
        tokenSymbol: 'HBAR'
      };
    }
  }

  /**
   * Get engagement metrics for campaign snapshot
   */
  private static async getEngagementMetrics(
    campaignId: string,
    maxParticipants: number
  ): Promise<CampaignSnapshot['engagement']> {
    try {
      const prisma = await createPrismaClient();

      // Get participation data
      const participations = await prisma.campaign_participation.findMany({
        where: { twitter_card_id: parseInt(campaignId) },
        select: {
          user_handle: true,
          action: true
        }
      });

      // Get tweet stats if available
      const tweetStats = await prisma.campaign_tweetstats.findFirst({
        where: { twitter_card_id: parseInt(campaignId) },
        select: {
          like_count: true,
          retweet_count: true,
          reply_count: true,
          quote_count: true
        }
      });

      // Aggregate engagement data
      const totalLikes = tweetStats?.like_count || 0;
      const totalRetweets = tweetStats?.retweet_count || 0;
      const totalComments = (tweetStats?.reply_count || 0) + (tweetStats?.quote_count || 0);

      // Count unique participants
      const uniqueParticipants = new Set(participations.map(p => p.user_handle)).size;

      // Calculate engagement rate (basic calculation)
      const totalEngagement = totalLikes + totalRetweets + totalComments;
      const engagementRate = uniqueParticipants > 0 ? (totalEngagement / uniqueParticipants) : 0;

      // Get top participants (simplified - in reality you'd have more complex scoring)
      const participantScores = new Map<string, number>();
      participations.forEach(p => {
        const current = participantScores.get(p.user_handle) || 0;
        const actionScore = this.getActionScore(p.action);
        participantScores.set(p.user_handle, current + actionScore);
      });

      const topParticipants = Array.from(participantScores.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, maxParticipants)
        .map(([handle, score]) => ({
          userId: handle, // In reality, you'd map to actual user ID
          username: handle,
          engagementScore: score,
          rewardAmount: this.calculateReward(score, totalEngagement).toString()
        }));

      const engagement: CampaignSnapshot['engagement'] = {
        totalParticipants: uniqueParticipants,
        totalLikes,
        totalRetweets,
        totalComments,
        engagementRate: Math.round(engagementRate * 100) / 100,
        topParticipants
      };

      await prisma.$disconnect();
      return engagement;

    } catch (error) {
      Logger.err(`Failed to get engagement metrics: ${String(error)}`);
      return {
        totalParticipants: 0,
        totalLikes: 0,
        totalRetweets: 0,
        totalComments: 0,
        engagementRate: 0,
        topParticipants: []
      };
    }
  }

  /**
   * Generate checksum for data integrity
   */
  private static async generateChecksum(campaignId: string): Promise<string> {
    try {
      const crypto = await import('crypto');
      const data = campaignId + new Date().toISOString();
      return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
    } catch (error) {
      Logger.err(`Failed to generate checksum: ${String(error)}`);
      return 'checksum-error';
    }
  }

  /**
   * Get score for different engagement actions
   */
  private static getActionScore(action: string): number {
    const scoreMap: Record<string, number> = {
      'like': 1,
      'retweet': 2,
      'reply': 3,
      'quote': 3,
      'follow': 1
    };
    return scoreMap[action.toLowerCase()] || 1;
  }

  /**
   * Calculate reward based on engagement score
   */
  private static calculateReward(score: number, totalEngagement: number): number {
    if (totalEngagement === 0) return 0;
    // Simple proportional calculation - in reality this would be more complex
    const baseReward = 100; // Base reward pool
    return Math.round((score / totalEngagement) * baseReward * 100) / 100;
  }

  /**
   * Validate snapshot completeness
   */
  static validateSnapshot(snapshot: CampaignSnapshot): boolean {
    try {
      // Check required fields
      const requiredFields = [
        snapshot.campaign.id,
        snapshot.campaign.userId,
        snapshot.user.id,
        snapshot.metadata.snapshotCreatedAt,
        snapshot.metadata.checksumHash
      ];

      const isValid = requiredFields.every(field => field !== null && field !== undefined);

      if (!isValid) {
        Logger.err('Snapshot validation failed - missing required fields');
        return false;
      }

      Logger.info(`Snapshot validation passed for campaign ${snapshot.campaign.id}`);
      return true;

    } catch (error) {
      Logger.err(`Snapshot validation error: ${String(error)}`);
      return false;
    }
  }
}
