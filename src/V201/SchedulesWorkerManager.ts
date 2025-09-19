import { Worker, Job } from 'bullmq';
import { ScheduledEvent } from './AppEvents';
import { TaskSchedulerJobType } from './schedulerQueue';
import { parseRedisURL } from './Modules/common';
import { getConfig } from '@appConfig';
import logger from 'jet-logger';

/**
 * WorkerManager handles the creation and shutdown of BullMQ workers for processing scheduled jobs.
 */
class WorkerManager {
  private static workers: Map<string, Worker> = new Map();

  /**
   * Initializes a new worker to process jobs of a specific type.
   * @param jobType The type of scheduled event.
   * @param processor The function to process the job.
   */
  public static async initializeWorker<T extends ScheduledEvent>(
    jobType: T,
    processor: (job: Job<TaskSchedulerJobType<T>>) => Promise<void>
  ): Promise<void> {
    const configs = await getConfig();

    const worker = new Worker<TaskSchedulerJobType<T>>(
      jobType,
      async (job: Job<TaskSchedulerJobType<T>>) => {
        try {
          logger.info(`🔹 Processing job: ${job.name}`);
          await processor(job);
          logger.info(`✅ Job completed: ${job.name}`);
        } catch (error: unknown) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          logger.err(`❌ Failed to process job: ${job.name} - ${errorMsg}`);
          // Re-throw error to trigger BullMQ retry mechanism
          throw error;
        }
      },
      {
        connection: {
          host: parseRedisURL(configs.db.redisServerURI).host,
          port: parseRedisURL(configs.db.redisServerURI).port,
          maxRetriesPerRequest: 3, // Redis connection retry
        },
        concurrency: 3, // Process up to 3 jobs concurrently
        // Graceful shutdown settings
        removeOnComplete: {
          age: 24 * 3600, // Remove completed jobs after 24 hours
          count: 100, // Keep max 100 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days for debugging
          count: 500, // Keep max 500 failed jobs
        },
      }
    );

    this.workers.set(jobType, worker);
    logger.info(`🚀 BullMQ worker initialized for job type: ${jobType}`);
  }

  /**
   * Gracefully shuts down all active workers.
   */
  public static async shutdownWorkers(): Promise<void> {
    logger.info('⚠️  Gracefully shutting down workers...');
    for (const [, worker] of this.workers.entries()) {
      await worker.close();
    }
    logger.info('✅ Workers shut down.');
  }
}

// Handle graceful shutdown on system signals
process.on('SIGINT', () => {
  void WorkerManager.shutdownWorkers().then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  void WorkerManager.shutdownWorkers().then(() => {
    process.exit(0);
  });
});

export default WorkerManager;
