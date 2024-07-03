import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import "express-async-errors";
import helmet from "helmet";
import { isHttpError } from "http-errors";
import morgan from "morgan";
import path from "path";

import { PrismaClient } from "@prisma/client";
import authRouter from "@routes/auth-router";
import RedisClient from "@services/redis-servie";
import rateLimit from "express-rate-limit";
import logger from "jet-logger";
import apiRouter from "./routes";


// Constants
const app = express();
const prisma = new PrismaClient();
const redisClient = new RedisClient();

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: "GET, OPTIONS, POST, PUT, PATCH",
};

// Middleware setup
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(limiter);

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

if (process.env.NODE_ENV === "production") {
  app.use(helmet());
}

// Routes setup
app.use("/api", apiRouter);
app.use("/auth", authRouter);

/**
 * Error handling middleware
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (isHttpError(err)) {
    return res.status(err.status).send({ error: err });
  }

  res.status(500).send({
    error: { message: "Internal Server Error", description: err.message },
  });

  logger.err(err, true);
  next(err);
});

// Front-end content
const viewsDir = path.join(__dirname, "views");
app.set("views", viewsDir);

const staticDir = path.join(__dirname, "public");
app.use(express.static(staticDir));

app.get("*", (_: Request, res: Response) => {
  res.sendFile("index.html", { root: viewsDir });
});

/**
 * Test Prisma connection
 */
async function testPrismaConnection() {
  try {
    await prisma.$connect();
    logger.info("Connected to the database successfully.");
  } catch (error) {
    logger.err("Failed to connect to the database", error);
    process.exit(1);
  }
}

/**
 * Test Redis connection
 */
async function testRedisConnection() {
  try {
    await redisClient.create("test_key", "test_value");
    const value = await redisClient.read("test_key");
    if (value === "test_value") {
      logger.info("Connected to Redis successfully.");
      await redisClient.delete("test_key");
    } else {
      throw new Error("Failed to verify Redis connection");
    }
  } catch (error) {
    logger.err("Failed to connect to Redis", error);
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
}

init().catch((error) => {
  logger.err("Failed to initialize the server", error);
  process.exit(1);
});

// Export app for testing purposes
export default app;
