import { PrismaClient } from '@prisma/client';
import createPrismaClient from '@shared/prisma';
import { Job } from 'bullmq';
import logger from 'jet-logger';
import { CampaignScheduledEvents } from './AppEvents';
import { CampaignClosingService } from './Modules/campaigns/services/campaignClose/CampaignClosingService';
import { TaskSchedulerJobType } from './schedulerQueue';
import WorkerManager from './SchedulesWorkerManager';
import { processQuoteAndReplyCollection } from './Modules/campaigns/services/campaignClose/OnCloseEngagementService';

/**
 * Class to handle scheduled job operations for V201 campaigns
 */
export class V201SchedulesJobHandler {
  private prisma: PrismaClient | null = null;

  constructor() {
    this.initializeServices();
  }

  /**
   * Initialize required services
   */
  private async initializeServices(): Promise<void> {
    if (!this.prisma) {
      this.prisma = await createPrismaClient();
    }
  }

  /**
   * Private method for processing campaign close jobs
   */
  private async processCloseCampaignJob(
    job: Job<
      TaskSchedulerJobType<CampaignScheduledEvents.CAMPAIGN_CLOSE_OPERATION>
    >
  ): Promise<void> {
    const jobData = job.data.data;
    if (!jobData?.cardId) throw new Error('cardId required');
    await this.initializeServices();
    if (!this.prisma) throw new Error('Prisma client not initialized');
    const campaign = await this.prisma.campaign_twittercard.findUnique({
      where: { id: Number(jobData.cardId) },
    });
    if (!campaign) throw new Error(`Campaign card ${jobData.cardId} not found`);
    const v201ClosingService = new CampaignClosingService();
    const result = await v201ClosingService.closeCampaign(campaign);
    if (!result.success)
      throw new Error(result.message || 'Campaign closing failed');
  }

  /**
   * Private method for processing campaign expiry jobs
   */
  // private async processExpiryCampaignJob(
  //   job: Job<
  //     TaskSchedulerJobType<CampaignScheduledEvents.CAMPAIGN_EXPIRATION_OPERATION>
  //   >
  // ): Promise<void> {
  //   const jobData = job.data.data;
  //   if (!jobData?.cardId) throw new Error('cardId required');
  //   await this.initializeServices();
  //   if (!this.prisma) throw new Error('Prisma client not initialized');
  //   const campaign = await this.prisma.campaign_twittercard.findUnique({
  //     where: { id: Number(jobData.cardId) },
  //   });
  //   if (!campaign) throw new Error(`Campaign card ${jobData.cardId} not found`);
  //   const v201ExpiryService = new V201CampaignExpiryService();
  //   const result = await v201ExpiryService.expireCampaign(campaign);
  //   if (!result.success)
  //     throw new Error(result.message || 'Campaign expiry failed');
  // }

  private async processLikeAndRetweetCollectionJob(
    job: Job<
      TaskSchedulerJobType<CampaignScheduledEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY>
    >
  ): Promise<void> {
    const jobData = job.data.data;
    if (!jobData?.campaignId) throw new Error('campaignId required');
    await processQuoteAndReplyCollection(job.data);
  }

  /**
   * Register all job workers
   */
  async registerScheduleJobWorkers(): Promise<void> {
    await WorkerManager.initializeWorker(
      CampaignScheduledEvents.CAMPAIGN_CLOSE_OPERATION,
      async (job) => {
        try {
          await this.processCloseCampaignJob(job);
        } catch (error) {
          logger.err(
            `[V201] CAMPAIGN_CLOSE_OPERATION failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          throw error;
        }
      }
    );

    // await WorkerManager.initializeWorker(
    //   CampaignScheduledEvents.CAMPAIGN_EXPIRATION_OPERATION,
    //   async (job) => {
    //     try {
    //       await this.processExpiryCampaignJob(job);
    //     } catch (error) {
    //       logger.err(
    //         `[V201] CAMPAIGN_EXPIRATION_OPERATION failed: ${
    //           error instanceof Error ? error.message : String(error)
    //         }`
    //       );
    //       throw error;
    //     }
    //   }
    // );

    await WorkerManager.initializeWorker(
      CampaignScheduledEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY,
      async (job) => {
        try {
          await this.processLikeAndRetweetCollectionJob(job);
        } catch (error) {
          logger.err(
            `[V201] CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          throw error;
        }
      }
    );
    logger.info('[V201] Campaign workers registered');
  }
}

// Create instance and register workers
const v201JobHandler = new V201SchedulesJobHandler();
v201JobHandler.registerScheduleJobWorkers();

export default v201JobHandler;
