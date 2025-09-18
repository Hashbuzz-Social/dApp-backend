import dotenv from "dotenv";
dotenv.config();

import RedisClient from "@services/redis-service";
import { logError, logInfo } from "@shared/helper";
import createPrismaClient from "@shared/prisma";
import afterStartJobs from "./after-start";
import { getConfig } from "./appConfig";
import preStartJobs from "./pre-start";
import server from "./server";

let redisClient: RedisClient;
/**
 * Test Prisma connection
 */
async function testPrismaConnection() {
  try {
    const prisma = await createPrismaClient();
    await prisma.$connect();
    const msg = "Connected to the database successfully.";
    logInfo(msg);
  } catch (error) {
    const errMsg = "Failed to connect to the database";
    logError(errMsg, error);
    process.exit(1);
  }
}

/**
 * Test Redis connection
 */
async function testRedisConnection(client: RedisClient) {
  try {
    await client.checkConnection();
    const msg = "Connected to Redis successfully.";
    logInfo(msg);
  } catch (error) {
    const errMsg = "Failed to connect to Redis";
    logError(errMsg, error);
    process.exit(1);
  }
}

/**
 * Gracefully shuts down the server
 */
async function gracefulShutdown() {
  logInfo("Shutting down gracefully...");
  if (redisClient) {
    const prisma = await createPrismaClient();
    await prisma.$disconnect();
    logInfo("Prisma disconnected.");
    await redisClient.client.quit();
    logInfo("Redis disconnected.");
  }
  process.exit(0);
}

process.on("SIGTERM", () => { void gracefulShutdown(); });
process.on("SIGINT", () => { void gracefulShutdown(); });

/**
 * Initialize the server
 */
async function init() {
  try {
    logInfo('Initializing server');
    const config = await getConfig();
    redisClient = new RedisClient(config.db.redisServerURI);

    // DEPRECATED: Pre-start jobs disabled for maintenance. These were used for:
    // - Setting up environment variables
    // - Checking token availability
    // - Scheduling cron jobs and expiry tasks
    // await preStartJobs();

    await testPrismaConnection();
    await testRedisConnection(redisClient);

    // DEPRECATED: After-start jobs disabled for maintenance. These were used for:
    // - Checking previous campaign close times
    // - Processing backlog campaigns
    // await afterStartJobs();

    const port = config.app.port || 4000;
    const httpServer = server.listen(port, () => {
      const msg = `Server is running on http://localhost:${port}`;
      logInfo(msg);
    });

    // Attach WebSocket server (if available)
    try {
      // Lazy import to avoid circular deps
      const websocket = await import('./V201/websocket');
      if (websocket && websocket.attach) {
        websocket.attach(httpServer);
      }
    } catch (err) {
      logInfo('WebSocket module not attached: ' + String(err));
    }
  } catch (error) {
    const errMsg = "Failed to initialize the server";
    logError(errMsg, error);
    process.exit(1);
  }
}

init().catch((error) => {
  const errMsg = "Failed to initialize the server";
  logError(errMsg, error);
  process.exit(1);
});
