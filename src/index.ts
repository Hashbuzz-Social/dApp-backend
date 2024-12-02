import dotenv from "dotenv";
dotenv.config();

import preStartJobs from "./pre-start";
import RedisClient from "@services/redis-servie";
import createPrismaClient from "@shared/prisma";
import logger from "jet-logger";
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
    logger.info(msg);
  } catch (error) {
    const errMsg = "Failed to connect to the database";
    logger.err(errMsg, error);
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
    logger.info(msg);
  } catch (error) {
    const errMsg = "Failed to connect to Redis";
    logger.err(errMsg, error);
    process.exit(1);
  }
}

/**
 * Gracefully shuts down the server
 */
async function gracefulShutdown() {
  logger.info("Shutting down gracefully...");
  if (redisClient) {
    const prisma = await createPrismaClient();
    await prisma.$disconnect();
    logger.info("Prisma disconnected.");
    await redisClient.client.quit();
    logger.info("Redis disconnected.");
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

    await preStartJobs();
    await testPrismaConnection();
    await testRedisConnection(redisClient);

    const port = config.app.port || 4000;
    server.listen(port, () => {
      const msg = `Server is running on http://localhost:${port}`;
      logger.info(msg);
    });
  } catch (error) {
    const errMsg = "Failed to initialize the server";
    logger.err(errMsg, error);
    process.exit(1);
  }
}

init().catch((error) => {
  const errMsg = "Failed to initialize the server";
  logger.err(errMsg, error);
  process.exit(1);
});
