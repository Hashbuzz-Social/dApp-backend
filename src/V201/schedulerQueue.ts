import { parseRedisURL, safeParsedData } from '@V201/modules/common';
import { SheduleJobPayloadMap } from '@V201/types';
import { JobScheduler, JobsOptions, Queue } from 'bullmq';
import { ScheduledEvent } from './AppEvents';
import { getConfig } from '@appConfig';
import { AppConfig } from 'src/@types/AppConfig';

/**
 * Defines the structure of a task scheduler job.
 */
export interface TaskSchedulerJobType<T extends ScheduledEvent> {
  eventName: T;
  data: SheduleJobPayloadMap[T];
  executeAt: Date;
}

/**
 * Manages scheduling and queuing jobs using BullMQ.
 */
class SchedulerQueue {
  private static instance: SchedulerQueue;
  private configs: AppConfig | null = null;
  private queues: Map<string, Queue> = new Map();
  private queueSchedulers: Map<string, JobScheduler> = new Map();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Gets a singleton instance of the scheduler queue.
   */
  public static async getInstance(): Promise<SchedulerQueue> {
    if (!SchedulerQueue.instance) {
      SchedulerQueue.instance = new SchedulerQueue();
      await SchedulerQueue.instance.initializeConfigs();
    }
    return SchedulerQueue.instance;
  }

  /**
   * Initializes configuration settings.
   */
  private async initializeConfigs() {
    this.configs = await getConfig();
  }

  /**
   * Retrieves or creates a job queue.
   * @param jobType The job type name.
   */
  private async getQueue(jobType: string): Promise<Queue> {
    if (!this.queues.has(jobType)) {
      if (!this.configs) await this.initializeConfigs();

      const redisConfig = parseRedisURL(
        String(this.configs?.db?.redisServerURI || '')
      );

      const queue = new Queue(jobType, {
        connection: {
          host: String(redisConfig?.host || 'localhost'),
          port: Number(redisConfig?.port || 6379),
        },
      });

      const scheduler = new JobScheduler(jobType, {
        connection: {
          host: String(redisConfig?.host || 'localhost'),
          port: Number(redisConfig?.port || 6379),
        },
      });

      this.queues.set(jobType, queue);
      this.queueSchedulers.set(jobType, scheduler);
    }
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${jobType}`);
    }
    return queue;
  }

  /**
   * Adds a job to the queue for execution.
   * @param jobType The job type.
   * @param jobData The job payload.
   * @param options (Optional) Job execution options.
   */
  public async addJob<T extends ScheduledEvent>(
    jobType: T,
    jobData: TaskSchedulerJobType<T>,
    options?: JobsOptions
  ): Promise<void> {
    const queue = await this.getQueue(jobType);
    const delay = jobData.executeAt.getTime() - Date.now();
    await queue.add(jobData.eventName, safeParsedData(jobData), {
      delay,
      // Prevent infinite retries at the job level
      attempts: 3, // Maximum 3 attempts
      backoff: {
        type: 'exponential' as const,
        delay: 5000, // Start with 5 second delay
      },
      removeOnComplete: 50, // Keep 50 successful jobs
      removeOnFail: 100, // Keep 100 failed jobs for debugging
      ...options,
    });
    // Job added successfully - could add logging here with proper logger if needed
  }
}

export default SchedulerQueue;
