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
    logger.info(
      `🔹 Processing campaign close job: ${JSON.stringify(job.data)}`
    );
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
        throw new Error(`Campaign card not found for ID: ${jobData.cardId}`);
      }

      logger.info(
        `📊 Found campaign: ${card.name || 'Unnamed'} (ID: ${
          card.id
        }) - Status: ${card.card_status}`
      );

      // Use existing completeCampaignOperation service to close the campaign
      await completeCampaignOperation(card);

      logger.info(
        `✅ Campaign ${jobData.cardId} closed successfully via BullMQ`
      );
    } else {
      throw new Error('Invalid job data: cardId is missing');
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.err(
      `❌ Failed to process campaign close job for card ${job.data.data?.cardId}: ${errorMsg}`
    );

    // Re-throw error to trigger BullMQ retry mechanism
    throw error;
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
