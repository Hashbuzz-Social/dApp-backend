import dotenv from "dotenv";
dotenv.config();

import RedisClient from "@services/redis-servie";
import { logError, logInfo } from "@shared/helper";
import createPrismaClient from "@shared/prisma";
import afterStartJobs from "./after-start";
import { getConfig } from "./appConfig";
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

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

/**
 * Initialize the server
 */
async function init() {
  try {
    const config = await getConfig();
    redisClient = new RedisClient(config.db.redisServerURI);

    await testPrismaConnection();
    await testRedisConnection(redisClient)
    await afterStartJobs();

    const port = config.app.port || 4000;
    server.listen(port, () => {
      const msg = `Server is running on http://localhost:${port}`;
      logInfo(msg);
    });
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
