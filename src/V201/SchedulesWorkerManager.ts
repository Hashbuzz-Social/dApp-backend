import { Worker, Job } from "bullmq";
import appConfigManager from "./appConfigManager";
import { ScheduledEvent } from "./AppEvents";
import { TaskSchedulerJobType } from "./schedulerQueue";

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
        const configs = await appConfigManager.getConfig();

        const worker = new Worker<TaskSchedulerJobType<T>>(
            jobType,
            async (job: Job<TaskSchedulerJobType<T>>) => {
                try {
                    console.log(`🔹 Processing job: ${job.name}`, job.data);
                    await processor(job);
                } catch (error: unknown) {
                    console.error(`❌ Failed to process job: ${job.name}`, error);
                }
            },
            { 
                connection: { host: configs.db.redisServerURI }, 
                concurrency: 5 // Adjust concurrency based on load
            }
        );

        this.workers.set(jobType, worker);
    }

    /**
     * Gracefully shuts down all active workers.
     */
    public static async shutdownWorkers(): Promise<void> {
        console.log("⚠️  Gracefully shutting down workers...");
        for (const [jobType, worker] of this.workers.entries()) {
            await worker.close();
        }
        console.log("✅ Workers shut down.");
    }
}

// Handle graceful shutdown on system signals
process.on("SIGINT", async () => {
    await WorkerManager.shutdownWorkers();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await WorkerManager.shutdownWorkers();
    process.exit(0);
});

export default WorkerManager;
