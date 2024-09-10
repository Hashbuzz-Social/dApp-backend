import { NextFunction, Request, Response } from "express";
import { isHttpError } from "http-errors";
import logger from "jet-logger";

const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (isHttpError(err)) {
    return res.status(err.status).send({ error: err });
  }

  // console.error("Internal Server Error:", err.message); // Logging error details
  res.status(500).send({
    error: { message: "Internal Server Error", description: err.message },
  });

  logger.err(err, true);
  next(err);
};

export default errorHandler;