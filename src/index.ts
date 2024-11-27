import dotenv from "dotenv";
dotenv.config();
import "./pre-start"; // Must be the first import

import crontabService from "@services/cronTasks-service";
import { PrismaClient } from "@prisma/client";
import server from "./server";
import RedisClient from "@services/redis-servie";
import logger from "jet-logger";
import { getConfig } from "./appConfig";

const prisma = new PrismaClient();
const redisClient = new RedisClient();

/**
 * Test Prisma connection
 */
async function testPrismaConnection() {
  try {
    await prisma.$connect();
    const msg = "Connected to the database successfully.";
    logger.info(msg);
    console.info(msg);
  } catch (error) {
    console.error("Failed to connect to the database", error);
    process.exit(1);
  }
}

/**
 * Test Redis connection
 */
async function testRedisConnection() {
  try {
    await redisClient.checkConnection();
    const msg = "Connected to Redis successfully.";
    logger.info(msg);
    console.info(msg);
  } catch (error) {
    console.error("Failed to connect to Redis", error);
    process.exit(1);
  }
}

/**
 * Gracefully shuts down the server
 */
function gracefulShutdown() {
  logger.info("Shutting down gracefully...");
  prisma.$disconnect().finally(() => {
    logger.info("Prisma disconnected.");
    redisClient.client.quit().finally(() => {
      logger.info("Redis disconnected.");
      process.exit(0);
    });
  });
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

/**
 * Initialize the server
 */
async function init() {
  await testPrismaConnection();
  await testRedisConnection();
  await crontabService.checkPreviousCampaignCloseTime();

  const config = await getConfig();

  const port = config.app.port || 4000;
  server.listen(port, () => {
    const msg = `Server is running on http://localhost:${port}`;
    logger.info(msg);
    console.info(msg);
  });
}

init().catch((error) => {
  const msg = "Failed to initialize the server";
  logger.err(msg);
  console.error(msg, error);
  process.exit(1);
});
