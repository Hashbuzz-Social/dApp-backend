import { getConfig } from '@appConfig';
import { campaign_twittercard, campaignstatus, PrismaClient, user_user } from '@prisma/client';
import { formattedDateTime } from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import { performAutoRewardingForEligibleUser } from '@services/reward-service/on-card';
import twitterCardService from '@services/twitterCard-service';
import { closeFungibleAndNFTCampaign } from '@services/contract-service';
import { closeCampaignSMTransaction } from '@services/transaction-service';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import { updateCampaignInMemoryStatus } from '@V201/modules/common';
import SchedulerQueue from '../../../schedulerQueue';
import { CampaignSheduledEvents } from '../../../AppEvents';
import { CampaignTypes } from '../../../Types/campaign';
import XEngagementTracker from './xEngagementTracker';

/**
 * V201-specific campaign closing service
 * This service is completely independent of legacy CloseCampaign.ts and uses only BullMQ for scheduling
 * No node-schedule dependencies!
 */
export class V201CampaignClosingService {
  private prisma: PrismaClient | null = null;
  private engagementTracker: XEngagementTracker;

  constructor() {
    this.engagementTracker = new XEngagementTracker();
  }

  private async initializePrisma(): Promise<PrismaClient> {
    if (!this.prisma) {
      this.prisma = await createPrismaClient();
    }
    return this.prisma;
  }

  /**
   * Main entry point for closing a V201 campaign
   * This replaces the legacy completeCampaignOperation for V201 campaigns
   */
  async closeCampaign(campaign: campaign_twittercard): Promise<{
    success: boolean;
    message: string;
    campaignId: number | bigint;
  }> {
    try {
      await this.initializePrisma();

      logger.info(
        `[V201] Starting campaign closure for ID: ${campaign.id}, Name: ${
          campaign.name || ''
        }`
      );

      // Get campaign owner data
      const campaignOwner = await this.getCampaignOwner(
        campaign.owner_id.toString()
      );
      if (!campaignOwner) {
        throw new Error('Campaign owner not found');
      }

      // Validate access tokens
      if (!this.hasValidAccessTokens(campaignOwner)) {
        throw new Error('Campaign owner has invalid Twitter access tokens');
      }

      // Execute campaign closing steps based on type
      if (campaign.type === 'HBAR') {
        await this.closeHBARCampaign(campaign, campaignOwner);
      } else if (campaign.type === 'FUNGIBLE') {
        await this.closeFungibleCampaign(campaign, campaignOwner);
      } else {
        throw new Error(
          `Unsupported campaign type: ${campaign.type || 'unknown'}`
        );
      }

      logger.info(`[V201] Campaign ${campaign.id} closed successfully`);

      return {
        success: true,
        message: 'V201 campaign closed successfully',
        campaignId: campaign.id,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`[V201] Failed to close campaign ${campaign.id}: ${errorMsg}`);

      // Update campaign status to error
      await this.handleClosingError(campaign, errorMsg);

      return {
        success: false,
        message: `Campaign closure failed: ${errorMsg}`,
        campaignId: campaign.id,
      };
    }
  }

  /**
   * Close HBAR type campaign - NEW FLOW: No immediate auto-rewarding!
   */
  private async closeHBARCampaign(
    campaign: campaign_twittercard,
    owner: user_user
  ): Promise<void> {
    logger.info(
      `[V201] Closing HBAR campaign ${campaign.id} - NEW ENGAGEMENT-DEPENDENT FLOW`
    );

    // Step 1: Execute smart contract transaction
    await this.executeSmartContractClosing(campaign, 'HBAR');

    // Step 2: Update campaign status to closed but awaiting comprehensive engagement data collection
    await this.updateCampaignToClosedAwaitingData(campaign);

    // Step 3: Queue campaign for comprehensive engagement data collection (with buffer time)
    await this.queueForEngagementDataCollection(campaign);

    // Step 4: Publish reward announcement tweet (rewards will be distributed AFTER data collection)
    await this.publishRewardAnnouncementTweet(campaign, owner, 'HBAR');

    // NOTE: Auto-reward distribution is now handled by the engagement data collection service
    // after comprehensive data collection is complete

    logger.info(
      `[V201] HBAR campaign ${campaign.id} closed and queued for comprehensive engagement data collection`
    );
  }

  /**
   * Close Fungible token campaign - NEW FLOW: Comprehensive engagement collection before rewards
   */
  private async closeFungibleCampaign(
    campaign: campaign_twittercard,
    owner: user_user
  ): Promise<void> {
    logger.info(
      `[V201] Closing FUNGIBLE campaign ${campaign.id} - NEW ENGAGEMENT-DEPENDENT FLOW`
    );

    // Step 1: Execute smart contract transaction
    await this.executeSmartContractClosing(campaign, 'FUNGIBLE');

    // Step 2: Update campaign status to closed but awaiting comprehensive engagement data collection
    await this.updateCampaignToClosedAwaitingData(campaign);

    // Step 3: Queue campaign for comprehensive engagement data collection (with buffer time)
    await this.queueForEngagementDataCollection(campaign);

    // Step 4: Publish reward announcement tweet (rewards will be distributed AFTER data collection)
    await this.publishRewardAnnouncementTweet(campaign, owner, 'FUNGIBLE');

    // NOTE: Auto-reward distribution and expiry scheduling now handled by engagement data collection service
    // after comprehensive data collection is complete

    logger.info(
      `[V201] FUNGIBLE campaign ${campaign.id} closed and queued for comprehensive engagement data collection`
    );
  }

  /**
   * Execute smart contract transaction for campaign closing
   */
  private async executeSmartContractClosing(
    campaign: campaign_twittercard,
    type: 'HBAR' | 'FUNGIBLE'
  ): Promise<void> {
    try {
      logger.info(
        `[V201] Starting smart contract transaction for ${type} campaign ${campaign.id}`
      );

      if (type === 'HBAR') {
        const contractId = campaign.contract_id;
        if (!contractId) {
          throw new Error('Campaign contract ID is missing');
        }
        await closeCampaignSMTransaction(contractId);
      } else {
        const contractId = campaign.contract_id;
        if (!contractId) {
          throw new Error('Campaign contract ID is missing');
        }
        await closeFungibleAndNFTCampaign(contractId);
      }

      // Update in-memory status
      if (campaign.contract_id) {
        await updateCampaignInMemoryStatus(
          campaign.contract_id,
          `${type.toLowerCase()}SMTransaction`,
          true
        );
      }

      logger.info(
        `[V201] Smart contract transaction completed for ${type} campaign ${campaign.id}`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201] Smart contract transaction failed for campaign ${campaign.id}: ${errorMsg}`
      );
      throw new Error(`Smart contract transaction failed: ${errorMsg}`);
    }
  }

  /**
   * Update campaign engagement data using V201 engagement tracker
   */
  private async updateCampaignEngagements(
    campaign: campaign_twittercard
  ): Promise<void> {
    try {
      logger.info(
        `[V201] Updating engagement data for campaign ${campaign.id}`
      );

      if (!campaign.tweet_id) {
        throw new Error('Campaign tweet ID not found');
      }

      // Use V201 engagement tracker to collect latest engagement data
      const engagementData = await this.engagementTracker.collectEngagementData(
        campaign.id,
        campaign.tweet_id
      );

      // Update campaign_tweetengagements table for reward calculation
      // Based on Prisma schema: campaign_tweetengagements uses tweet_id (BigInt) to reference campaign.id
      if (this.prisma) {
        await this.prisma.campaign_tweetstats.upsert({
          where: {
            twitter_card_id: campaign.id,
          },
          update: {
            like_count: engagementData.likes || 0,
            retweet_count: engagementData.retweets || 0,
            reply_count: engagementData.comments || 0,
            quote_count: engagementData.quotes || 0,
            last_update: new Date(),
          },
          create: {
            twitter_card_id: campaign.id,
            like_count: engagementData.likes || 0,
            retweet_count: engagementData.retweets || 0,
            reply_count: engagementData.comments || 0,
            quote_count: engagementData.quotes || 0,
            last_update: new Date(),
          },
        });
      }

      // Update in-memory status
      if (campaign.contract_id) {
        await updateCampaignInMemoryStatus(
          campaign.contract_id,
          'engagementsStatsUpdate',
          true
        );
      }

      logger.info(`[V201] Engagement data updated for campaign ${campaign.id}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201] Failed to update engagement data for campaign ${campaign.id}: ${errorMsg}`
      );
      throw new Error(`Engagement update failed: ${errorMsg}`);
    }
  }

  /**
   * Publish reward announcement tweet
   */
  private async publishRewardAnnouncementTweet(
    campaign: campaign_twittercard,
    owner: user_user,
    type: 'HBAR' | 'FUNGIBLE'
  ): Promise<void> {
    try {
      logger.info(
        `[V201] Publishing reward announcement tweet for ${type} campaign ${campaign.id}`
      );

      const tweetText = await this.generateRewardAnnouncementText(
        campaign,
        type
      );

      // Safely handle parent tweet ID
      const parentTweetId = campaign.last_thread_tweet_id;
      if (!parentTweetId) {
        throw new Error(
          'Parent tweet ID is required for publishing reward announcement'
        );
      }

      await twitterCardService.publishTweetORThread({
        cardOwner: owner,
        isThread: true,
        tweetText,
        parentTweetId,
      });

      // Ensure prisma is initialized
      const prisma = await this.initializePrisma();

      // Update campaign status in database
      await new CampaignTwitterCardModel(prisma).updateCampaign(campaign.id, {
        card_status: campaignstatus.RewardDistributionInProgress,
      }); // Update in-memory status
      if (campaign.contract_id) {
        await updateCampaignInMemoryStatus(
          campaign.contract_id,
          'publishedTweetThread',
          true
        );
      }

      logger.info(
        `[V201] Reward announcement tweet published for campaign ${campaign.id}`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201] Failed to publish reward announcement for campaign ${campaign.id}: ${errorMsg}`
      );
      throw new Error(`Reward announcement failed: ${errorMsg}`);
    }
  }

  /**
   * Process automatic reward distribution
   */
  private async processAutoRewardDistribution(
    campaign: campaign_twittercard
  ): Promise<void> {
    try {
      logger.info(
        `[V201] Starting auto-reward distribution for campaign ${campaign.id}`
      );

      // Use existing reward service that handles campaign_tweetengagements
      await performAutoRewardingForEligibleUser(campaign.id);

      // Update in-memory status
      if (campaign.contract_id) {
        await updateCampaignInMemoryStatus(
          campaign.contract_id,
          'autoRewardDistribution',
          true
        );
      }

      logger.info(
        `[V201] Auto-reward distribution completed for campaign ${campaign.id}`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(
        `[V201] Auto-reward distribution failed for campaign ${campaign.id}: ${errorMsg}`
      );
      // Don't fail the whole campaign closing if reward distribution fails
    }
  }

  /**
   * Schedule reward expiry using BullMQ (V201 way - NO node-schedule!)
   */
  private async scheduleRewardExpiry(
    campaign: campaign_twittercard,
    expiryTime: string
  ): Promise<void> {
    try {
      logger.info(
        `[V201] Scheduling reward expiry for campaign ${campaign.id} at ${expiryTime}`
      );

      const scheduler = await SchedulerQueue.getInstance();

      // Schedule reward expiry job using BullMQ
      await scheduler.addJob(
        CampaignSheduledEvents.CAMPAIGN_EXPIRATION_OPERATION,
        {
          eventName: CampaignSheduledEvents.CAMPAIGN_EXPIRATION_OPERATION,
          data: {
            cardId: campaign.id,
            userId: campaign.owner_id,
            type: campaign.type as CampaignTypes,
            createdAt: new Date(),
            expiryAt: new Date(expiryTime),
          },
          executeAt: new Date(expiryTime),
        }
      );

      logger.info(
        `[V201] Reward expiry scheduled for campaign ${campaign.id} using BullMQ`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201] Failed to schedule reward expiry for campaign ${campaign.id}: ${errorMsg}`
      );
      // Don't fail campaign closing if scheduling fails
    }
  }

  /**
   * Generate reward announcement tweet text
   */
  private async generateRewardAnnouncementText(
    campaign: campaign_twittercard,
    type: 'HBAR' | 'FUNGIBLE'
  ): Promise<string> {
    const config = await getConfig();
    const currentTime = new Date().toISOString();
    const claimDuration = config.app.defaultRewardClaimDuration;

    if (type === 'HBAR') {
      return (
        `Promo ended on ${formattedDateTime(currentTime)}. ` +
        `Rewards allocation for the next ${claimDuration} minutes. ` +
        `New users: log into ${config.app.appURL}, ` +
        `then link your Personal X account to receive your rewards.`
      );
    } else {
      return (
        `Promo ended on ${formattedDateTime(currentTime)}. ` +
        `Rewards allocation for the next ${claimDuration} minutes. ` +
        `New users: log into ${config.app.appURL}, ` +
        `link Personal X account and associate token with ID ` +
        `${campaign.fungible_token_id ?? ''} to your wallet.`
      );
    }
  }

  /**
   * Get campaign owner data
   */
  private async getCampaignOwner(userId: string): Promise<user_user | null> {
    logger.info(`[V201] Fetching campaign owner ${userId}`);

    // Ensure prisma is initialized
    const prisma = await this.initializePrisma();

    return await prisma.user_user.findUnique({
      where: { id: Number(userId) },
      include: {
        user_balances: true,
      },
    });
  }

  /**
   * Validate if campaign owner has valid Twitter access tokens
   */
  private hasValidAccessTokens(owner: user_user): boolean {
    return !!(
      owner &&
      owner.business_twitter_access_token &&
      owner.business_twitter_access_token_secret
    );
  }

  /**
   * Handle campaign closing errors
   */
  private async handleClosingError(
    campaign: campaign_twittercard,
    errorMsg: string
  ): Promise<void> {
    try {
      // Ensure prisma is initialized
      const prisma = await this.initializePrisma();

      // Update campaign status to error
      await new CampaignTwitterCardModel(prisma).updateCampaign(campaign.id, {
        card_status: campaignstatus.InternalError,
      });

      // Update in-memory status
      if (campaign.contract_id) {
        await updateCampaignInMemoryStatus(
          campaign.contract_id,
          'closingError',
          true
        );
      }

      logger.err(`[V201] Campaign ${campaign.id} marked as error: ${errorMsg}`);
    } catch (error) {
      logger.err(
        `[V201] Failed to update campaign error status for ${
          campaign.id
        }: ${String(error)}`
      );
    }
  }

  /**
   * Update campaign status to closed and awaiting engagement data collection
   */
  private async updateCampaignToClosedAwaitingData(
    campaign: campaign_twittercard
  ): Promise<void> {
    try {
      // Ensure prisma is initialized
      const prisma = await this.initializePrisma();

      // Update campaign status to indicate it's closed but awaiting data collection
      await new CampaignTwitterCardModel(prisma).updateCampaign(campaign.id, {
        card_status: campaignstatus.CampaignRunning, // Keep running until data collection is complete
      });

      // Update in-memory status
      if (campaign.contract_id) {
        await updateCampaignInMemoryStatus(
          campaign.contract_id,
          'closedAwaitingData',
          true
        );
      }

      logger.info(
        `[V201] Campaign ${campaign.id} marked as closed, awaiting engagement data collection`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201] Failed to update campaign to closed-awaiting-data status for ${campaign.id}: ${errorMsg}`
      );
      throw error;
    }
  }

  /**
   * Queue campaign for comprehensive engagement data collection with buffer time
   */
  private async queueForEngagementDataCollection(
    campaign: campaign_twittercard
  ): Promise<void> {
    try {
      const scheduler = await SchedulerQueue.getInstance();

      // Schedule engagement data collection with 5-minute buffer for late engagers
      const executeAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

      await scheduler.addJob(
        CampaignSheduledEvents.V201_ENGAGEMENT_DATA_COLLECTION,
        {
          eventName: CampaignSheduledEvents.V201_ENGAGEMENT_DATA_COLLECTION,
          executeAt: executeAt,
          data: {
            userId: campaign.owner_id,
            cardId: campaign.id,
            type: (campaign.type as any) || 'HBAR',
            createdAt: new Date(),
            collectionAttempts: 0,
            maxAttempts: 10, // Multiple attempts for comprehensive data collection
          },
        }
      );

      logger.info(
        `[V201] Queued campaign ${
          campaign.id
        } for comprehensive engagement data collection with 5-minute buffer at ${executeAt.toISOString()}`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201] Failed to queue campaign ${campaign.id} for engagement data collection: ${errorMsg}`
      );
      throw error;
    }
  }
}

export default V201CampaignClosingService;
