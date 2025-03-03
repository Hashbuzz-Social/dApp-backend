import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import JSONBigInt from "json-bigint";

const { OK, CREATED, ACCEPTED, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, INTERNAL_SERVER_ERROR } = StatusCodes;

// Extend the Response interface to include custom methods
declare module "express-serve-static-core" {
  interface Response {
    success(data: any, message?: string): void;
    created<T>(data: T, message?: string): void;
    accepted(data: any, message?: string): void;
    error(message: string, code?: number, errors?: any): void;
    unauthorized(message?: string): void;
    forbidden(message?: string): void;
    notFound(message?: string): void;
    internalServerError(message?: string): void;
  }
}

const responseFormatter = (req: Request, res: Response, next: NextFunction) => {
  res.success = (data: any, message: string = "Success") => {
    const response: any = {
      status: "success",
      message,
    };
    if (data !== undefined || data !== null) {
      response.data = typeof data === 'object' ? JSONBigInt.parse(JSONBigInt.stringify(data)) : { data };
    }
    res.status(OK).json(response);
  };

  res.created = <T>(data: T, message: string = "Created Successfully.") => {
    res.status(CREATED).json({
      status: "success",
      message,
      data: typeof data === 'object' ? JSONBigInt.parse(JSONBigInt.stringify(data)) : { data },
    });
  };

  res.accepted = (data: any, message: string = "Request accepted wait for status update") => {
    res.status(ACCEPTED).json({
      status: "success",
      message,
      data: typeof data === 'object' ? JSONBigInt.parse(JSONBigInt.stringify(data)) : { data },
    });
  };

  res.error = (message: string, code: number = 400, errors: any = null) => {
    res.status(code).json({
      status: "error",
      message,
      errors,
    });
  };

  res.unauthorized = (message: string = "Unauthorized") => {
    res.status(UNAUTHORIZED).json({
      status: "error",
      message,
    });
  };

  res.forbidden = (message: string = "Forbidden") => {
    res.status(FORBIDDEN).json({
      status: "error",
      message,
    });
  };

  res.notFound = (message: string = "Not Found") => {
    res.status(NOT_FOUND).json({
      status: "error",
      message,
    });
  };

  res.internalServerError = (message: string = "Internal Server Error") => {
    res.status(INTERNAL_SERVER_ERROR).json({
      status: "error",
      message,
    });
  };

  next();
};

export default responseFormatter;
