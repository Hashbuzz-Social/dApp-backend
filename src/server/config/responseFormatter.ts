import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import JSONBigInt from "json-bigint";

const {
  OK,
  CREATED,
  ACCEPTED,
  BAD_REQUEST,
  UNAUTHORIZED,
  FORBIDDEN,
  NOT_FOUND,
  CONFLICT,
  UNPROCESSABLE_ENTITY,
  INTERNAL_SERVER_ERROR,
} = StatusCodes;

// Extend the Response interface to include custom methods
declare module 'express-serve-static-core' {
  interface Response {
    success(data?: any, message?: string, metadata?: any): void;
    created(data?: any, message?: string, metadata?: any): void;
    accepted(data?: any, message?: string, metadata?: any): void;
    error(message: string, code?: number, errors?: any, metadata?: any): void;
    badRequest(message?: string, errors?: any): void;
    unauthorized(message?: string): void;
    forbidden(message?: string): void;
    notFound(message?: string, resource?: string): void;
    conflict(message?: string, details?: any): void;
    validationError(message?: string, errors?: any): void;
    internalServerError(message?: string, error?: Error | any): void;
  }
}

/**
 * Serialize data handling BigInt values
 */
const serializeData = (data: any): any => {
  if (data === undefined || data === null) {
    return undefined;
  }

  if (typeof data === 'object') {
    return JSONBigInt.parse(JSONBigInt.stringify(data));
  }

  return data;
};

/**
 * Response formatter middleware
 * Adds standardized response methods to Express Response object
 */
const responseFormatter = (req: Request, res: Response, next: NextFunction) => {
  // Success response (200 OK)
  res.success = (data?: any, message = 'Success', metadata?: any) => {
    const response: any = {
      status: 'success',
      message,
    };

    const serializedData = serializeData(data);
    if (serializedData !== undefined) {
      response.data = serializedData;
    }

    if (metadata) {
      response.metadata = metadata;
    }

    res.status(OK).json(response);
  };

  // Created response (201 Created)
  res.created = (
    data?: any,
    message = 'Resource created successfully',
    metadata?: any
  ) => {
    const response: any = {
      status: 'success',
      message,
    };

    const serializedData = serializeData(data);
    if (serializedData !== undefined) {
      response.data = serializedData;
    }

    if (metadata) {
      response.metadata = metadata;
    }

    res.status(CREATED).json(response);
  };

  // Accepted response (202 Accepted)
  res.accepted = (
    data?: any,
    message = 'Request accepted, processing in progress',
    metadata?: any
  ) => {
    const response: any = {
      status: 'success',
      message,
    };

    const serializedData = serializeData(data);
    if (serializedData !== undefined) {
      response.data = serializedData;
    }

    if (metadata) {
      response.metadata = metadata;
    }

    res.status(ACCEPTED).json(response);
  };

  // Generic error response
  res.error = (
    message: string,
    code = 400,
    errors: any = null,
    metadata?: any
  ) => {
    const response: any = {
      status: 'error',
      message,
    };

    if (errors) {
      response.errors = errors;
    }

    if (metadata) {
      response.metadata = metadata;
    }

    res.status(code).json(response);
  };

  // Bad Request (400)
  res.badRequest = (message = 'Bad Request', errors?: any) => {
    const response: any = {
      status: 'error',
      message,
    };

    if (errors) {
      response.errors = errors;
    }

    res.status(BAD_REQUEST).json(response);
  };

  // Unauthorized (401)
  res.unauthorized = (message = 'Unauthorized - Authentication required') => {
    res.status(UNAUTHORIZED).json({
      status: 'error',
      message,
    });
  };

  // Forbidden (403)
  res.forbidden = (message = 'Forbidden - Insufficient permissions') => {
    res.status(FORBIDDEN).json({
      status: 'error',
      message,
    });
  };

  // Not Found (404)
  res.notFound = (message = 'Resource not found', resource?: string) => {
    const response: any = {
      status: 'error',
      message,
    };

    if (resource) {
      response.resource = resource;
    }

    res.status(NOT_FOUND).json(response);
  };

  // Conflict (409)
  res.conflict = (message = 'Resource conflict', details?: any) => {
    const response: any = {
      status: 'error',
      message,
    };

    if (details) {
      response.details = details;
    }

    res.status(CONFLICT).json(response);
  };

  // Validation Error (422)
  res.validationError = (message = 'Validation failed', errors?: any) => {
    const response: any = {
      status: 'error',
      message,
    };

    if (errors) {
      response.errors = errors;
    }

    res.status(UNPROCESSABLE_ENTITY).json(response);
  };

  // Internal Server Error (500)
  res.internalServerError = (
    message = 'Internal server error',
    error?: any
  ) => {
    const response: any = {
      status: 'error',
      message,
    };

    // Only include error details in development
    if (error && process.env.NODE_ENV === 'development') {
      response.error = {
        message: error.message,
        stack: error.stack,
      };
    }

    res.status(INTERNAL_SERVER_ERROR).json(response);
  };

  next();
};

export default responseFormatter;
