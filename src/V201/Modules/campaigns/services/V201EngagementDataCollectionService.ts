import { PrismaClient, campaign_twittercard, campaignstatus } from '@prisma/client';
import logger from 'jet-logger';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import XEngagementTracker from './xEngagementTracker';
// import { updateCampaignInMemoryStatus } from './campaignStatusInMemoryUpdater';
import { CampaignScheduledEvents } from '../../../AppEvents';
import SchedulerQueue from '../../../schedulerQueue';
import { updateCampaignInMemoryStatus } from '@V201/modules/common';

/**
 * V201 Engagement Data Collection Service
 *
 * Handles recurring engagement data collection for closed campaigns.
 * Collects Twitter engagement data and determines when campaigns are ready for expiry/reward distribution.
 */
class V201EngagementDataCollectionService {
  private prismaClient: PrismaClient | null = null;

  /**
   * Initialize Prisma client
   */
  private async initializePrisma(): Promise<PrismaClient> {
    if (!this.prismaClient) {
      this.prismaClient = new PrismaClient();
    }
    return this.prismaClient;
  }

  /**
   * Process engagement data collection for a campaign
   */
  async processEngagementDataCollection(payload: {
    userId: number | bigint;
    cardId: number | bigint;
    type: string;
    createdAt: Date;
    expiryAt: Date;
    collectionAttempts?: number;
    maxAttempts?: number;
  }): Promise<void> {
    const { cardId, collectionAttempts = 0, maxAttempts = 10 } = payload;
    const currentAttempts = collectionAttempts + 1;

    try {
      logger.info(
        `[V201EngagementCollection] Processing data collection for campaign ${cardId}, attempt ${currentAttempts}/${maxAttempts}`
      );

      // Get campaign details
      const campaign = await this.getCampaignById(Number(cardId));
      if (!campaign) {
        logger.err(`[V201EngagementCollection] Campaign ${cardId} not found`);
        return;
      }

      // Check if campaign is in correct status for data collection
      if (!this.isCampaignEligibleForDataCollection(campaign)) {
        logger.info(
          `[V201EngagementCollection] Campaign ${cardId} not eligible for data collection (status: ${campaign.card_status})`
        );
        return;
      }

      // Collect engagement data
      const success = await this.collectEngagementData(campaign);

      if (success) {
        // Check if we should proceed to expiry or continue collecting
        const shouldProceedToExpiry = await this.shouldProceedToExpiry(
          campaign,
          currentAttempts
        );

        if (shouldProceedToExpiry) {
          logger.info(
            `[V201EngagementCollection] Campaign ${cardId} ready for expiry/reward distribution`
          );
          await this.scheduleExpiryAndReward(campaign);
        } else if (currentAttempts < maxAttempts) {
          logger.info(
            `[V201EngagementCollection] Scheduling next data collection for campaign ${cardId}`
          );
          await this.scheduleNextCollection(
            campaign,
            currentAttempts,
            maxAttempts
          );
        } else {
          logger.warn(
            `[V201EngagementCollection] Max attempts reached for campaign ${cardId}, proceeding to expiry anyway`
          );
          await this.scheduleExpiryAndReward(campaign);
        }
      } else {
        // Data collection failed
        if (currentAttempts < maxAttempts) {
          logger.warn(
            `[V201EngagementCollection] Data collection failed for campaign ${cardId}, retrying...`
          );
          await this.scheduleNextCollection(
            campaign,
            currentAttempts,
            maxAttempts
          );
        } else {
          logger.err(
            `[V201EngagementCollection] Data collection failed for campaign ${cardId} after ${maxAttempts} attempts, proceeding to expiry with existing data`
          );
          await this.scheduleExpiryAndReward(campaign);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201EngagementCollection] Error processing data collection for campaign ${cardId}: ${errorMsg}`
      );

      // On error, retry if we haven't reached max attempts
      if (currentAttempts < maxAttempts) {
        await this.scheduleNextCollection(
          await this.getCampaignById(Number(cardId)),
          currentAttempts,
          maxAttempts
        );
      } else {
        logger.err(
          `[V201EngagementCollection] Max attempts reached after error for campaign ${cardId}, proceeding to expiry`
        );
        const campaign = await this.getCampaignById(Number(cardId));
        if (campaign) {
          await this.scheduleExpiryAndReward(campaign);
        }
      }
    }
  }

  /**
   * Get campaign by ID
   */
  private async getCampaignById(
    campaignId: number
  ): Promise<campaign_twittercard | null> {
    const prisma = await this.initializePrisma();

    try {
      return await prisma.campaign_twittercard.findUnique({
        where: { id: BigInt(campaignId) },
      });
    } catch (error) {
      logger.err(
        `[V201EngagementCollection] Error fetching campaign ${campaignId}: ${error}`
      );
      return null;
    }
  }

  /**
   * Check if campaign is eligible for data collection
   */
  private isCampaignEligibleForDataCollection(
    campaign: campaign_twittercard
  ): boolean {
    // Campaign should still be in running state during data collection phase
    return campaign.card_status === campaignstatus.CampaignRunning;
  }

  /**
   * Collect engagement data from X API with timestamp validation
   */
  private async collectEngagementData(
    campaign: campaign_twittercard
  ): Promise<boolean> {
    try {
      logger.info(
        `[V201EngagementCollection] Starting engagement data collection for campaign ${campaign.id}`
      );

      const engagementTracker = new XEngagementTracker();

      // Collect raw engagement data
      const result = await engagementTracker.collectEngagementData(
        campaign.id,
        campaign.tweet_id || ''
      );

      if (result) {
        logger.info(
          `[V201EngagementCollection] Raw engagement data collected for campaign ${campaign.id}`
        );

        // CRITICAL: Apply timestamp validation to filter out post-close engagements
        await this.validateAndCleanEngagementData(campaign);

        return true;
      } else {
        logger.warn(
          `[V201EngagementCollection] No engagement metrics returned for campaign ${campaign.id}`
        );
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201EngagementCollection] Failed to collect engagement data for campaign ${campaign.id}: ${errorMsg}`
      );
      return false;
    }
  }

  /**
   * Validate engagement timing and mark suspicious engagements
   * This is critical to ensure only pre-close engagements are rewarded
   */
  private async validateAndCleanEngagementData(
    campaign: campaign_twittercard
  ): Promise<void> {
    if (!campaign.campaign_close_time) {
      logger.warn(
        `[V201EngagementCollection] Campaign ${campaign.id} has no close time, cannot validate engagement timing`
      );
      return;
    }

    const prisma = await this.initializePrisma();
    const closeTime = new Date(campaign.campaign_close_time);
    const currentTime = new Date();
    const suspiciousThresholdMs = 30 * 60 * 1000; // 30 minutes after close

    try {
      // Get all engagements for this campaign
      const engagements = await prisma.campaign_tweetengagements.findMany({
        where: { tweet_id: campaign.id },
      });

      let suspiciousCount = 0;
      let validatedCount = 0;

      for (const engagement of engagements) {
        let isSuspicious = false;
        let reason = '';

        // Strategy 1: If engagement has actual timestamp from X (for quotes), validate it
        if (engagement.engagement_timestamp) {
          if (engagement.engagement_timestamp > closeTime) {
            isSuspicious = true;
            reason = `Engagement timestamp (${engagement.engagement_timestamp.toISOString()}) after campaign close (${closeTime.toISOString()})`;
          }
        } else {
          // Strategy 2: Fallback validation for likes/retweets without timestamps
          // If engagement was recorded significantly after campaign close, mark as suspicious
          if (engagement.updated_at) {
            const timeSinceClose =
              engagement.updated_at.getTime() - closeTime.getTime();
            if (timeSinceClose > suspiciousThresholdMs) {
              isSuspicious = true;
              reason = `Engagement recorded ${Math.round(
                timeSinceClose / (60 * 1000)
              )} minutes after campaign close`;
            }
          }
        }

        // Update engagement validity
        await prisma.campaign_tweetengagements.update({
          where: { id: engagement.id },
          data: {
            is_valid_timing: !isSuspicious,
            payment_status: isSuspicious
              ? ('SUSPENDED' as const)
              : engagement.payment_status,
          },
        });

        if (isSuspicious) {
          suspiciousCount++;
          logger.warn(
            `[V201EngagementCollection] Marked engagement ${engagement.id} as suspicious: ${reason}`
          );
        } else {
          validatedCount++;
        }
      }

      logger.info(
        `[V201EngagementCollection] Campaign ${campaign.id} validation complete: ${validatedCount} valid, ${suspiciousCount} suspicious engagements`
      );
    } catch (error) {
      logger.err(
        `[V201EngagementCollection] Error validating engagement data for campaign ${campaign.id}: ${error}`
      );
    }
  }

  /**
   * Determine if campaign should proceed to expiry/reward distribution
   * Uses actual engagement data to make intelligent decisions
   */
  private async shouldProceedToExpiry(
    campaign: campaign_twittercard,
    attempts: number
  ): Promise<boolean> {
    try {
      // Get current engagement metrics from the tracker
      const engagementTracker = new XEngagementTracker();
      const metrics = await engagementTracker.getCampaignMetrics(campaign.id);

      if (!metrics) {
        logger.warn(
          `[V201EngagementCollection] No metrics available for campaign ${campaign.id}, proceeding after ${attempts} attempts`
        );
        return attempts >= 3; // Fallback to attempt-based decision
      }

      // Intelligent decision based on engagement data quality
      const minCollections = 3;
      const maxWaitHours = 2;
      const significantEngagementThreshold = 10; // At least 10 total engagements
      const stableEngagementThreshold = 5; // If engagement is low, wait less time

      // Always proceed after minimum collections if we have significant engagement
      if (
        attempts >= minCollections &&
        metrics.totalEngagements >= significantEngagementThreshold
      ) {
        logger.info(
          `[V201EngagementCollection] Campaign ${campaign.id} has sufficient data: ${metrics.totalEngagements} total engagements after ${attempts} collections`
        );
        return true;
      }

      // For low engagement campaigns, don't wait as long
      if (
        metrics.totalEngagements <= stableEngagementThreshold &&
        attempts >= 2
      ) {
        logger.info(
          `[V201EngagementCollection] Campaign ${campaign.id} has low engagement (${metrics.totalEngagements}), proceeding early`
        );
        return true;
      }

      // Check if we've been collecting data for too long
      if (campaign.campaign_close_time) {
        const hoursSinceClosed =
          (Date.now() - new Date(campaign.campaign_close_time).getTime()) /
          (1000 * 60 * 60);
        if (hoursSinceClosed >= maxWaitHours) {
          logger.info(
            `[V201EngagementCollection] Campaign ${
              campaign.id
            } has been collecting data for ${hoursSinceClosed.toFixed(
              1
            )} hours, proceeding to expiry`
          );
          return true;
        }
      }

      // Continue collecting if none of the above conditions are met
      logger.info(
        `[V201EngagementCollection] Campaign ${campaign.id} continuing data collection: attempts=${attempts}, engagements=${metrics.totalEngagements}`
      );
      return false;
    } catch (error) {
      logger.err(
        `[V201EngagementCollection] Error checking expiry readiness for campaign ${campaign.id}: ${error}`
      );
      // Fallback to simple attempt-based decision on error
      return attempts >= 5;
    }
  }

  /**
   * Schedule the next data collection attempt
   */
  private async scheduleNextCollection(
    campaign: campaign_twittercard | null,
    currentAttempts: number,
    maxAttempts: number
  ): Promise<void> {
    if (!campaign) return;

    try {
      const scheduler = await SchedulerQueue.getInstance();
      const nextExecuteAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

      await scheduler.addJob(
        CampaignScheduledEvents.V201_ENGAGEMENT_DATA_COLLECTION,
        {
          eventName: CampaignScheduledEvents.V201_ENGAGEMENT_DATA_COLLECTION,
          executeAt: nextExecuteAt,
          data: {
            userId: campaign.owner_id,
            cardId: campaign.id,
            type: (campaign.type as any) || 'HBAR',
            createdAt: new Date(),
            collectionAttempts: currentAttempts,
            maxAttempts: maxAttempts,
          },
        }
      );

      logger.info(
        `[V201EngagementCollection] Scheduled next data collection for campaign ${
          campaign.id
        } at ${nextExecuteAt.toISOString()}`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201EngagementCollection] Failed to schedule next collection for campaign ${campaign.id}: ${errorMsg}`
      );
    }
  }

  /**
   * Schedule campaign expiry and reward distribution
   * This is called AFTER comprehensive engagement data collection is complete
   */
  private async scheduleExpiryAndReward(
    campaign: campaign_twittercard
  ): Promise<void> {
    try {
      const prisma = await this.initializePrisma();

      logger.info(
        `[V201EngagementCollection] Processing auto-reward distribution for campaign ${campaign.id} AFTER comprehensive data collection`
      );

      // Step 1: Process auto-reward distribution using the comprehensive engagement data
      try {
        const { performAutoRewardingForEligibleUser } = await import(
          '@services/reward-service/on-card'
        );
        await performAutoRewardingForEligibleUser(campaign.id);
        logger.info(
          `[V201EngagementCollection] Auto-reward distribution completed for campaign ${campaign.id}`
        );
      } catch (rewardError) {
        logger.err(
          `[V201EngagementCollection] Auto-reward distribution failed for campaign ${campaign.id}: ${rewardError}`
        );
        // Don't fail the entire process if reward distribution fails
      }

      // Step 2: Update campaign status to indicate it's ready for expiry
      await new CampaignTwitterCardModel(prisma).updateCampaign(campaign.id, {
        card_status: campaignstatus.RewardDistributionInProgress,
      });

      // Step 3: Update in-memory status
      if (campaign.contract_id) {
        await updateCampaignInMemoryStatus(
          campaign.contract_id,
          'readyForRewardDistribution',
          true
        );
      }

      // Step 4: Schedule actual expiry operation
      const scheduler = await SchedulerQueue.getInstance();
      const executeAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

      await scheduler.addJob(
        CampaignScheduledEvents.CAMPAIGN_EXPIRATION_OPERATION,
        {
          eventName: CampaignScheduledEvents.CAMPAIGN_EXPIRATION_OPERATION,
          executeAt: executeAt,
          data: {
            userId: campaign.owner_id,
            cardId: campaign.id,
            type: (campaign.type || 'HBAR') as 'HBAR' | 'FUNGIBLE',
            createdAt: new Date(),
            expiryAt: executeAt,
          },
        }
      );

      logger.info(
        `[V201EngagementCollection] Scheduled expiry/reward for campaign ${
          campaign.id
        } at ${executeAt.toISOString()}`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201EngagementCollection] Failed to schedule expiry for campaign ${campaign.id}: ${errorMsg}`
      );
    }
  }
}

export default V201EngagementDataCollectionService;
