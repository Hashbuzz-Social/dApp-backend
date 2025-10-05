import { campaign_twittercard } from '@prisma/client';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import {
  EngagementSummary,
  EngagementCollectionPayload,
  EngagementCollectionResult,
  CampaignExpiryOperationError
} from '../types';

// =============================================================================
// ENGAGEMENT DATA COLLECTION SERVICE
// =============================================================================

/**
 * Functional service to collect and validate engagement data for campaign expiry
 * Self-dependent: fetches required data from database as needed
 */
export class CampaignEngagementCollector {
  /**
   * Main engagement collection function
   * Gathers all engagement data and calculates summary statistics
   */
  static async collectEngagements(payload: EngagementCollectionPayload): Promise<EngagementCollectionResult> {
    const { context, campaign } = payload;
    const { campaignId, requestId } = context;

    try {
      logger.info(`[${requestId}] Starting engagement collection for campaign ${String(campaignId)}`);

      // Fetch all engagements for this campaign
      const engagements = await this.fetchCampaignEngagements(campaign, requestId);
      
      // Validate and process engagements
      const validEngagements = await this.validateEngagements(engagements, campaign, requestId);
      
      // Calculate engagement summary
      const summary = await this.calculateEngagementSummary(validEngagements, campaign, requestId);
      
      // Update engagement validation status
      await this.updateEngagementValidationStatus(validEngagements, requestId);

      logger.info(`[${requestId}] Engagement collection completed - Valid: ${summary.validEngagements}/${summary.totalEngagements}`);
      
      return {
        success: true,
        summary,
        errors: [],
        timestamp: new Date()
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`[${requestId}] Engagement collection failed for campaign ${String(campaignId)}: ${errorMsg}`);
      
      return {
        success: false,
        errors: [errorMsg],
        timestamp: new Date()
      };
    }
  }

  /**
   * Fetch all engagements from database for the campaign
   */
  private static async fetchCampaignEngagements(
    campaign: campaign_twittercard,
    requestId: string
  ): Promise<any[]> {
    try {
      const prisma = await createPrismaClient();
      
      const engagements = await prisma.campaign_tweetengagements.findMany({
        where: {
          twitter_card_id: campaign.id
        },
        include: {
          user_user: {
            select: {
              id: true,
              username: true,
              wallet_address: true,
              twitter_user_id: true
            }
          }
        },
        orderBy: {
          engagement_time: 'desc'
        }
      });

      logger.info(`[${requestId}] Fetched ${engagements.length} engagements for campaign ${String(campaign.id)}`);
      return engagements;

    } catch (error) {
      logger.err(`[${requestId}] Failed to fetch engagements: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Validate engagements for eligibility and authenticity
   */
  private static async validateEngagements(
    engagements: any[],
    campaign: campaign_twittercard,
    requestId: string
  ): Promise<any[]> {
    try {
      const validEngagements: any[] = [];
      const userEngagementCounts = new Map<bigint, number>();

      for (const engagement of engagements) {
        let isValid = true;
        const validationErrors: string[] = [];

        // Check if engagement is within campaign period
        if (campaign.campaign_start_time && engagement.engagement_time < campaign.campaign_start_time) {
          isValid = false;
          validationErrors.push('Engagement before campaign start');
        }

        if (campaign.campaign_expiry && engagement.engagement_time > campaign.campaign_expiry) {
          isValid = false;
          validationErrors.push('Engagement after campaign end');
        }

        // Check for duplicate engagements from same user
        const userId = engagement.user_id;
        const userCount = userEngagementCounts.get(userId) || 0;
        
        // Allow only one engagement per user per campaign
        if (userCount >= 1) {
          isValid = false;
          validationErrors.push('Multiple engagements from same user');
        } else {
          userEngagementCounts.set(userId, userCount + 1);
        }

        // Check if user has valid wallet address for rewards
        if (!engagement.user_user?.wallet_address) {
          isValid = false;
          validationErrors.push('User has no wallet address');
        }

        // Check engagement type is valid
        const validTypes = ['like', 'retweet', 'quote', 'reply'];
        if (!validTypes.includes(engagement.engagement_type)) {
          isValid = false;
          validationErrors.push('Invalid engagement type');
        }

        // Mark engagement as valid or invalid
        engagement.isValid = isValid;
        engagement.validationErrors = validationErrors;

        if (isValid) {
          validEngagements.push(engagement);
        }
      }

      logger.info(`[${requestId}] Validated ${validEngagements.length}/${engagements.length} engagements`);
      return validEngagements;

    } catch (error) {
      logger.err(`[${requestId}] Engagement validation failed: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Calculate comprehensive engagement summary
   */
  private static async calculateEngagementSummary(
    validEngagements: any[],
    campaign: campaign_twittercard,
    requestId: string
  ): Promise<EngagementSummary> {
    try {
      const summary: EngagementSummary = {
        totalEngagements: 0,
        validEngagements: validEngagements.length,
        totalRewardAmount: 0,
        eligibleUsers: 0,
        engagementBreakdown: {
          likes: 0,
          retweets: 0,
          quotes: 0,
          replies: 0
        },
        dataCollectionTimestamp: new Date()
      };

      const eligibleUserIds = new Set<bigint>();

      // Calculate rewards and breakdown
      for (const engagement of validEngagements) {
        const engagementType = engagement.engagement_type;
        let rewardAmount = 0;

        // Calculate reward based on engagement type
        switch (engagementType) {
          case 'like':
            rewardAmount = campaign.like_reward || 0;
            summary.engagementBreakdown.likes++;
            break;
          case 'retweet':
            rewardAmount = campaign.retweet_reward || 0;
            summary.engagementBreakdown.retweets++;
            break;
          case 'quote':
            rewardAmount = campaign.quote_reward || 0;
            summary.engagementBreakdown.quotes++;
            break;
          case 'reply':
            rewardAmount = campaign.comment_reward || 0;
            summary.engagementBreakdown.replies++;
            break;
        }

        summary.totalRewardAmount += rewardAmount;
        eligibleUserIds.add(engagement.user_id);
      }

      summary.eligibleUsers = eligibleUserIds.size;

      // Get total engagement count (including invalid ones)
      const prisma = await createPrismaClient();
      summary.totalEngagements = await prisma.campaign_tweetengagements.count({
        where: {
          twitter_card_id: campaign.id
        }
      });

      logger.info(`[${requestId}] Calculated engagement summary - Total rewards: ${summary.totalRewardAmount}, Users: ${summary.eligibleUsers}`);
      return summary;

    } catch (error) {
      logger.err(`[${requestId}] Summary calculation failed: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Update engagement validation status in database
   */
  private static async updateEngagementValidationStatus(
    validEngagements: any[],
    requestId: string
  ): Promise<void> {
    try {
      const prisma = await createPrismaClient();

      // Update valid engagements
      for (const engagement of validEngagements) {
        await prisma.campaign_tweetengagements.update({
          where: { id: engagement.id },
          data: {
            is_verified: true,
            verification_time: new Date()
          }
        });
      }

      logger.info(`[${requestId}] Updated validation status for ${validEngagements.length} engagements`);

    } catch (error) {
      logger.err(`[${requestId}] Failed to update engagement status: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Get engagement statistics for a campaign
   */
  static async getEngagementStats(campaignId: bigint, requestId: string): Promise<{
    total: number;
    verified: number;
    pending: number;
    byType: Record<string, number>;
  }> {
    try {
      const prisma = await createPrismaClient();

      const [total, verified, byTypeResults] = await Promise.all([
        prisma.campaign_tweetengagements.count({
          where: { twitter_card_id: campaignId }
        }),
        prisma.campaign_tweetengagements.count({
          where: { 
            twitter_card_id: campaignId,
            is_verified: true
          }
        }),
        prisma.campaign_tweetengagements.groupBy({
          by: ['engagement_type'],
          where: { twitter_card_id: campaignId },
          _count: true
        })
      ]);

      const byType: Record<string, number> = {};
      byTypeResults.forEach(result => {
        byType[result.engagement_type || 'unknown'] = result._count;
      });

      return {
        total,
        verified,
        pending: total - verified,
        byType
      };

    } catch (error) {
      logger.err(`[${requestId}] Failed to get engagement stats: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Re-validate engagements with updated criteria
   */
  static async revalidateEngagements(
    campaignId: bigint,
    requestId: string,
    newCriteria?: {
      maxEngagementsPerUser?: number;
      allowedEngagementTypes?: string[];
      timeWindowStart?: Date;
      timeWindowEnd?: Date;
    }
  ): Promise<EngagementCollectionResult> {
    try {
      logger.info(`[${requestId}] Re-validating engagements for campaign ${String(campaignId)}`);

      const prisma = await createPrismaClient();
      
      // Fetch campaign
      const campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: campaignId }
      });

      if (!campaign) {
        throw new CampaignExpiryOperationError(
          'Campaign not found for re-validation',
          'CAMPAIGN_NOT_FOUND',
          campaignId,
          requestId,
          'engagement-collection'
        );
      }

      // Reset validation status
      await prisma.campaign_tweetengagements.updateMany({
        where: { twitter_card_id: campaignId },
        data: {
          is_verified: false,
          verification_time: null
        }
      });

      // Re-run collection with new criteria
      const payload: EngagementCollectionPayload = {
        context: {
          campaignId,
          requestId,
          startTime: new Date(),
          metadata: { revalidation: true, newCriteria }
        },
        campaign,
        eligibilityResult: { isEligible: true } // Bypass eligibility for re-validation
      };

      return await this.collectEngagements(payload);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`[${requestId}] Re-validation failed: ${errorMsg}`);
      
      return {
        success: false,
        errors: [errorMsg],
        timestamp: new Date()
      };
    }
  }
}