import WorkerManager from './SchedulesWorkerManager';
import { CampaignSheduledEvents } from './AppEvents';
import { Job } from 'bullmq';
import { TaskSchedulerJobType } from './schedulerQueue';
import { completeCampaignOperation } from '@services/campaign-service';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';

// Define the processor function
const processCloseCampaignJob = async (
  job: Job<
    TaskSchedulerJobType<CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION>
  >
) => {
  try {
    logger.info(`Processing campaign close job: ${JSON.stringify(job.data)}`);
    const jobData = job.data.data;

    if (jobData?.cardId) {
      // Get the campaign card from database
      const prisma = await createPrismaClient();
      const card = await prisma.campaign_twittercard.findUnique({
        where: { id: Number(jobData.cardId) },
        include: {
          user_user: true, // Include campaign owner
        },
      });

      if (!card) {
        throw new Error(`Campaign card ${jobData.cardId} not found`);
      }

      // Use existing campaign closing service
      await completeCampaignOperation(card);

      logger.info(`Campaign ${jobData.cardId} closed successfully`);
    } else {
      throw new Error(
        'Invalid job data for campaign closing - cardId is required'
      );
    }
  } catch (error) {
    logger.err(
      `Error processing campaign close job: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error; // Re-throw to mark job as failed
  }
};

// Register worker for campaign close operations
const registerScheduleJobWorkers = async () => {
  await WorkerManager.initializeWorker(
    CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION,
    processCloseCampaignJob
  );
};

registerScheduleJobWorkers();
