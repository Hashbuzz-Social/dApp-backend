import { Worker, Job } from "bullmq";
import appConfigManager from "./appConfigManager";

class WorkerManager {
    private static workers: Map<string, Worker> = new Map();

    public static async initializeWorker<T>(jobType: string, processor: (job: Job<T>) => Promise<void>): Promise<void> {
        const configs = await appConfigManager.getConfig();

        const worker = new Worker(
            jobType,
            async (job) => {
                try {
                    console.log(`🔹 Processing job: ${job.name}`, job.data);
                    await processor(job);
                } catch (error) {
                    console.error(`❌ Failed to process job: ${job.name}`, error);
                }
            },
            { connection: { host: configs.db.redisServerURI }, concurrency: 5 }
        );

        this.workers.set(jobType, worker);
    }

    public static async shutdownWorkers(): Promise<void> {
        console.log("⚠️  Gracefully shutting down workers...");
        for (const [jobType, worker] of this.workers.entries()) {
            await worker.close();
        }
        console.log("✅ Workers shut down.");
    }
}

// Handle Server Shutdown
process.on("SIGINT", async () => {
    await WorkerManager.shutdownWorkers();
    process.exit(0);
});

// Handle Server Restart
process.on("SIGTERM", async () => {
    await WorkerManager.shutdownWorkers();
    process.exit(0);
});



export default WorkerManager;
