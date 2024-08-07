import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { isHttpError } from "http-errors";
import morgan from "morgan";
import path from "path";
import express, { NextFunction, Request, Response } from "express";
import "express-async-errors";

import authRouter from "@routes/auth-router";
import logger from "jet-logger";
import apiRouter from "./routes";
import rateLimit from "express-rate-limit";


// Constants
const app = express();

const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: "GET, OPTIONS, POST, PUT, PATCH"
};

// Middleware setup
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

if (process.env.NODE_ENV === "production") {
  app.use(helmet());
}

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
// app.use(limiter);

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
    error: { message: "Internal Server Error", description: err.message }
  });

  logger.err(err, true);
  console.error(err);
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

export default app;
