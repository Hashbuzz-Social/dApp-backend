import { Request, Response, NextFunction } from "express";
import { isHttpError } from "http-errors";
import logger from "jet-logger"; // Ensure you have a logger module

const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  // Check if the error is an HTTP error
  if (isHttpError(err)) {
    logger.err(`HTTP Error: ${err.message}`);
    return res.status(err.status).send({ error: { message: err.message, status: err.status } });
  }

  // Handle other types of errors
  logger.err(`Internal Server Error: ${err.message}`);
  res.status(500).send({
    error: { message: "Internal Server Error", description: err.message },
  });

  next(err);
};

export default errorHandler;
