import WorkerManager from './SchedulesWorkerManager';
import { CampaignSheduledEvents } from './AppEvents';
import { Job } from 'bullmq';
import { TaskSchedulerJobType } from './schedulerQueue';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import { V201CampaignClosingService } from './Modules/campaigns/services/V201CampaignClosingService';
import { V201CampaignExpiryService } from './Modules/campaigns/services/V201CampaignExpiryService';

// Define the processor function for V201 campaign closing
const processCloseCampaignJob = async (
  job: Job<
    TaskSchedulerJobType<CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION>
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
    TaskSchedulerJobType<CampaignSheduledEvents.CAMPAIGN_EXPIRATION_OPERATION>
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
          `[V201] Campaign ${String(jobData.cardId)} expired successfully using V201 service`
        );
      } else {
        logger.err(
          `[V201] Campaign ${String(jobData.cardId)} expiry failed: ${result.message}`
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

// Register worker for campaign close and expiry operations
const registerScheduleJobWorkers = async () => {
  await WorkerManager.initializeWorker(
    CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION,
    processCloseCampaignJob
  );

  await WorkerManager.initializeWorker(
    CampaignSheduledEvents.CAMPAIGN_EXPIRATION_OPERATION,
    processExpiryCampaignJob
  );

  logger.info(
    '[V201] Campaign closing and expiry workers registered with V201 services (node-schedule free!)'
  );
};

registerScheduleJobWorkers();
