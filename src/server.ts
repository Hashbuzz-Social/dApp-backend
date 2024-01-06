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

// Constants
const app = express();

const options: cors.CorsOptions = {
  origin: "*",
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
app.use("/auth", authRouter)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (isHttpError(err)) {
    return res.status(err.status).send({ error: err });
  }

  res
    .status(500)
    .send({
      error: { message: "Internal Server Error", description: err.message },
    });

  logger.err(err, true);
  next(err);
});

// Error handling
// app.use((err: Error | CustomError, _: Request, res: Response, __: NextFunction) => {
//   logger.err(err, true);
//   const status = err instanceof CustomError ? err.HttpStatus : StatusCodes.BAD_REQUEST;
//   return res.status(status).json({
//     error: err.message,
//   });
// });

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
