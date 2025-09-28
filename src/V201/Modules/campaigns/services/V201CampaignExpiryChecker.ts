import { campaignstatus } from '@prisma/client';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import { V201CampaignExpiryService } from './V201CampaignExpiryService';
import SchedulerQueue from '../../../schedulerQueue';
import { CampaignScheduledEvents } from '../../../AppEvents';
import { CampaignTypes } from '../../../Types/campaign';

/**
 * V201 Campaign Expiry Checker
 * This service periodically checks for campaigns that need expiry and schedules them
 * No node-schedule dependencies!
 */
export class V201CampaignExpiryChecker {
  private expiryService: V201CampaignExpiryService;

  constructor() {
    this.expiryService = new V201CampaignExpiryService();
  }

  /**
   * Check for campaigns that have passed their expiry time and schedule expiry jobs
   */
  async checkAndScheduleExpiries(): Promise<void> {
    try {
      logger.info('[V201] Checking for campaigns that need expiry...');

      const campaigns = await this.expiryService.findCampaignsNeedingExpiry();

      if (campaigns.length === 0) {
        logger.info('[V201] No campaigns need expiry at this time');
        return;
      }

      logger.info(`[V201] Found ${campaigns.length} campaigns needing expiry`);

      // Schedule expiry jobs for each campaign
      const scheduler = await SchedulerQueue.getInstance();

      for (const campaign of campaigns) {
        try {
          logger.info(`[V201] Scheduling immediate expiry for campaign ${campaign.id}`);

          await scheduler.addJob(
            CampaignScheduledEvents.CAMPAIGN_EXPIRATION_OPERATION,
            {
              eventName: CampaignScheduledEvents.CAMPAIGN_EXPIRATION_OPERATION,
              data: {
                cardId: campaign.id,
                userId: campaign.owner_id,
                type: campaign.type as CampaignTypes,
                createdAt: new Date(),
                expiryAt: new Date(campaign.campaign_expiry || new Date()),
              },
              executeAt: new Date(), // Execute immediately since it's already expired
            }
          );

          logger.info(`[V201] Scheduled expiry job for campaign ${campaign.id}`);
        } catch (error) {
          logger.err(`[V201] Failed to schedule expiry for campaign ${campaign.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      logger.info(`[V201] Successfully scheduled ${campaigns.length} campaign expiry jobs`);
    } catch (error) {
      logger.err(`[V201] Error during expiry check: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a single campaign expiry immediately (for testing or manual triggers)
   */
  async expireCampaignById(campaignId: number | bigint): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const prisma = await createPrismaClient();
      const campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: Number(campaignId) }
      });

      if (!campaign) {
        return {
          success: false,
          message: `Campaign ${campaignId} not found`
        };
      }

      if (campaign.card_status !== campaignstatus.RewardDistributionInProgress) {
        return {
          success: false,
          message: `Campaign ${campaignId} is not in RewardDistributionInProgress status`
        };
      }

      const result = await this.expiryService.expireCampaign(campaign);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.err(`[V201] Error expiring campaign ${campaignId}: ${errorMsg}`);
      return {
        success: false,
        message: errorMsg
      };
    }
  }
}

export default V201CampaignExpiryChecker;
