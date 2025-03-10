import { safeParsedData } from "@V201/modules/common";
import { SheduleJobPayloadMap } from "@V201/types";
import { JobScheduler, JobsOptions, Queue } from "bullmq";
import appConfigManager from "./appConfigManager";
import { ScheduledEvent } from "./AppEvents";

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
    private configs: any;
    private queues: Map<string, Queue> = new Map();
    private queueSchedulers: Map<string, JobScheduler> = new Map();

    private constructor() {}

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
        this.configs = await appConfigManager.getConfig();
    }

    /**
     * Retrieves or creates a job queue.
     * @param jobType The job type name.
     */
    private async getQueue(jobType: string): Promise<Queue> {
        if (!this.queues.has(jobType)) {
            if (!this.configs) await this.initializeConfigs();

            const queue = new Queue(jobType, {
                connection: { host: this.configs.db.redisServerURI },
            });

            const scheduler = new JobScheduler(jobType, {
                connection: { host: this.configs.db.redisServerURI },
            });

            this.queues.set(jobType, queue);
            this.queueSchedulers.set(jobType, scheduler);
        }
        return this.queues.get(jobType)!;
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
        await queue.add(jobData.eventName, safeParsedData(jobData), { delay, ...options });
    }
}

export default SchedulerQueue;
