import { consumeFromQueue } from '../../../redisQueue';
import XApiEngagementTracker from './xEngagementTracker';
import logger from 'jet-logger';

interface EngagementCollectionJob {
  campaignId: string;
  tweetId: string;
  userId: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  collectionType: 'periodic' | 'final';
  scheduledFor: string;
  jobId: string;
}

/**
 * Worker service to process engagement collection jobs from Redis queue
 */
class EngagementCollectionWorker {
  private tracker: XApiEngagementTracker;
  private isRunning = false;

  constructor() {
    this.tracker = new XApiEngagementTracker();
  }

  /**
   * Start the worker to process engagement collection jobs
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Engagement collection worker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting engagement collection worker');

    // Process engagement collection queue
    await consumeFromQueue(
      'engagement_collection',
      this.processJob.bind(this),
      { signal: this.createAbortSignal() }
    );
  }

  /**
   * Stop the worker
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Stopping engagement collection worker');
  }

  /**
   * Process an individual engagement collection job
   */
  private async processJob(jobData: any): Promise<void> {
    try {
      const job: EngagementCollectionJob = typeof jobData === 'string'
        ? JSON.parse(jobData)
        : jobData;

      logger.info(`Processing engagement collection job ${job.jobId} for campaign ${job.campaignId}`);

      // Check if job should be processed now
      const scheduledTime = new Date(job.scheduledFor);
      const currentTime = new Date();

      if (currentTime < scheduledTime) {
        // Job is scheduled for future - put it back in queue with delay
        logger.info(`Job ${job.jobId} scheduled for future, delaying`);
        setTimeout(() => {
          this.processJob(jobData);
        }, scheduledTime.getTime() - currentTime.getTime());
        return;
      }

      // Process the job
      await this.tracker.processEngagementCollection({
        campaignId: job.campaignId,
        tweetId: job.tweetId,
        userId: job.userId,
        startTime: job.startTime,
        endTime: job.endTime,
        isActive: job.isActive,
        collectionType: job.collectionType,
      });

      logger.info(`Completed engagement collection job ${job.jobId}`);

    } catch (error) {
      logger.err(`Error processing engagement collection job: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create abort signal for graceful shutdown
   */
  private createAbortSignal(): AbortSignal {
    const controller = new AbortController();

    // Stop worker when process terminates
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, stopping engagement worker');
      controller.abort();
      this.stop();
    });

    process.on('SIGINT', () => {
      logger.info('Received SIGINT, stopping engagement worker');
      controller.abort();
      this.stop();
    });

    return controller.signal;
  }

  /**
   * Get worker status
   */
  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}

// Singleton instance
let workerInstance: EngagementCollectionWorker | null = null;

/**
 * Get singleton instance of engagement collection worker
 */
export const getEngagementWorker = (): EngagementCollectionWorker => {
  if (!workerInstance) {
    workerInstance = new EngagementCollectionWorker();
  }
  return workerInstance;
};

/**
 * Start the engagement collection worker
 */
export const startEngagementWorker = async (): Promise<void> => {
  const worker = getEngagementWorker();
  await worker.start();
};

/**
 * Stop the engagement collection worker
 */
export const stopEngagementWorker = (): void => {
  const worker = getEngagementWorker();
  worker.stop();
};

export default EngagementCollectionWorker;
