import cookieParser from "cookie-parser";
import morgan from "morgan";
import path from "path";
import helmet from "helmet";
import cors from "cors";

import express, { NextFunction, Request, Response } from "express";
import StatusCodes from "http-status-codes";
import "express-async-errors";

import apiRouter from "./routes";
import authRouter from "@routes/auth-router";
import logger from "jet-logger";
import { CustomError } from "@shared/errors";

// Constants
const app = express();

const options: cors.CorsOptions = {
  origin: process.env.FRONTEND_URL??"*",
  // methods:"GET, OPTIONS, POST, PUT, PATCH"npm r u
};

// Then pass these options to cors:
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
app.use(cors(options));


// **** Middlewares **** //

// Common middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Show routes called in console during development
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Security (helmet recommended in express docs)
if (process.env.NODE_ENV === "production") {
  app.use(helmet());
}

// **** API routes and error handling **** //


// Add api router
app.use("/api", apiRouter);
app.use("/auth" , authRouter)
// Error handling
app.use((err: Error | CustomError, _: Request, res: Response, __: NextFunction) => {
  logger.err(err, true);
  const status = err instanceof CustomError ? err.HttpStatus : StatusCodes.BAD_REQUEST;
  return res.status(status).json({
    error: err.message,
  });
});

// **** Front-end content **** //

// Set views dir
const viewsDir = path.join(__dirname, "views");
app.set("views", viewsDir);

// Set static dir
const staticDir = path.join(__dirname, "public");
app.use(express.static(staticDir));

// Serve index.html file
app.get("*", (_: Request, res: Response) => {
  res.sendFile("index.html", { root: viewsDir });
});

// Export here and start in a diff file (for testing).
export default app;
