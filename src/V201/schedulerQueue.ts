import { Queue, JobsOptions , JobScheduler } from "bullmq";

import appConfigManager from "./appConfigManager";

interface TaskSchedulerJobType<T> {
    eventName: string;
    data: T;
    executeAt: Date;
}

class SchedulerQueue {
    private static instance: SchedulerQueue;
    private configs: any;
    private queues: Map<string, Queue> = new Map();
    private queueSchedulers: Map<string, JobScheduler> = new Map();

    private constructor() {}

    public static async getInstance(): Promise<SchedulerQueue> {
        if (!SchedulerQueue.instance) {
            SchedulerQueue.instance = new SchedulerQueue();
            await SchedulerQueue.instance.initializeConfigs();
        }
        return SchedulerQueue.instance;
    }

    private async initializeConfigs() {
        this.configs = await appConfigManager.getConfig();
    }

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

    public async addJob<T>(jobType: string, jobData: TaskSchedulerJobType<T>, options?: JobsOptions): Promise<void> {
        const queue = await this.getQueue(jobType);
        await queue.add(jobData.eventName, jobData, options);
    }
}

export default SchedulerQueue;
