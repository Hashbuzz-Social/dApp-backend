import WorkerManager from './SchedulesWorkerManager';
import { CampaignScheduledEvents } from './AppEvents';
import { Job } from 'bullmq';
import { TaskSchedulerJobType } from './schedulerQueue';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import { V201CampaignClosingService } from './Modules/campaigns/services/V201CampaignClosingService';
import { V201CampaignExpiryService } from './Modules/campaigns/services/V201CampaignExpiryService';
import V201EngagementDataCollectionService from './Modules/campaigns/services/V201EngagementDataCollectionService';

// Define the processor function for V201 campaign closing
const processCloseCampaignJob = async (
  job: Job<
    TaskSchedulerJobType<CampaignScheduledEvents.CAMPAIGN_CLOSE_OPERATION>
  >
) => {
  try {
    logger.info(
      `[V201] Processing campaign close job: ${JSON.stringify(job.data)}`
    );
    const jobData = job.data.data;

    if (jobData?.cardId) {
      // Get the campaign card from database
      const prisma = await createPrismaClient();
      const campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: Number(jobData.cardId) },
      });

      if (!campaign) {
        throw new Error(`Campaign card ${jobData.cardId} not found`);
      }

      // Use V201-specific campaign closing service (NO legacy dependencies!)
      const v201ClosingService = new V201CampaignClosingService();
      const result = await v201ClosingService.closeCampaign(campaign);

      if (result.success) {
        logger.info(
          `[V201] Campaign ${jobData.cardId} closed successfully using V201 service`
        );
      } else {
        logger.err(
          `[V201] Campaign ${jobData.cardId} closing failed: ${result.message}`
        );
      }
    } else {
      throw new Error(
        'Invalid job data for campaign closing - cardId is required'
      );
    }
  } catch (error) {
    logger.err(
      `[V201] Error processing campaign close job: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error; // Re-throw to mark job as failed
  }
};

// Define the processor function for V201 campaign expiry
const processExpiryCampaignJob = async (
  job: Job<
    TaskSchedulerJobType<CampaignScheduledEvents.CAMPAIGN_EXPIRATION_OPERATION>
  >
) => {
  try {
    logger.info(
      `[V201] Processing campaign expiry job: ${JSON.stringify(job.data)}`
    );
    const jobData = job.data.data;

    if (jobData?.cardId) {
      // Get the campaign card from database
      const prisma = await createPrismaClient();
      const campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: Number(jobData.cardId) },
      });

      if (!campaign) {
        throw new Error(`Campaign card ${String(jobData.cardId)} not found`);
      }

      // Use V201-specific campaign expiry service (NO legacy dependencies!)
      const v201ExpiryService = new V201CampaignExpiryService();
      const result = await v201ExpiryService.expireCampaign(campaign);

      if (result.success) {
        logger.info(
          `[V201] Campaign ${String(
            jobData.cardId
          )} expired successfully using V201 service`
        );
      } else {
        logger.err(
          `[V201] Campaign ${String(jobData.cardId)} expiry failed: ${
            result.message
          }`
        );
      }
    } else {
      throw new Error(
        'Invalid job data for campaign expiry - cardId is required'
      );
    }
  } catch (error) {
    logger.err(
      `[V201] Error processing campaign expiry job: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error; // Re-throw to mark job as failed
  }
};

// Define the processor function for V201 engagement data collection
const processEngagementDataCollectionJob = async (
  job: Job<
    TaskSchedulerJobType<CampaignScheduledEvents.V201_ENGAGEMENT_DATA_COLLECTION>
  >
) => {
  try {
    logger.info(
      `[V201] Processing engagement data collection job: ${JSON.stringify(
        job.data
      )}`
    );
    const jobData = job.data.data;

    if (jobData?.cardId && jobData?.userId) {
      // Use V201EngagementDataCollectionService to process the job
      const engagementService = new V201EngagementDataCollectionService();
      await engagementService.processEngagementDataCollection({
        userId: jobData.userId,
        cardId: jobData.cardId,
        type: jobData.type,
        createdAt: jobData.createdAt,
        expiryAt: new Date(), // Not used in this payload type
        collectionAttempts: jobData.collectionAttempts,
        maxAttempts: jobData.maxAttempts,
      });

      logger.info(
        `[V201] Engagement data collection completed for campaign ${jobData.cardId}`
      );
    } else {
      throw new Error(
        'Invalid job data for engagement data collection - cardId and userId are required'
      );
    }
  } catch (error) {
    logger.err(
      `[V201] Error processing engagement data collection job: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error; // Re-throw to mark job as failed
  }
};

// Register worker for campaign close, expiry, and engagement data collection operations
const registerScheduleJobWorkers = async () => {
  await WorkerManager.initializeWorker(
    CampaignScheduledEvents.CAMPAIGN_CLOSE_OPERATION,
    processCloseCampaignJob
  );

  await WorkerManager.initializeWorker(
    CampaignScheduledEvents.CAMPAIGN_EXPIRATION_OPERATION,
    processExpiryCampaignJob
  );

  await WorkerManager.initializeWorker(
    CampaignScheduledEvents.V201_ENGAGEMENT_DATA_COLLECTION,
    processEngagementDataCollectionJob
  );

  logger.info(
    '[V201] Campaign closing, expiry, and engagement data collection workers registered with V201 services (node-schedule free!)'
  );
};

registerScheduleJobWorkers();
