import HttpStatusCodes from "http-status-codes";

export abstract class CustomError extends Error {
  public readonly HttpStatus = HttpStatusCodes.BAD_REQUEST;

  constructor(msg: string, httpStatus: number) {
    super(msg);
    this.HttpStatus = httpStatus;
  }
}

export class ErrorWithCode extends CustomError {
  constructor(message: string, httpStatus: number) {
    super(message, httpStatus);
  }
}

export class ParamMissingError extends CustomError {
  public static readonly Msg = "One or more of the required parameters was missing.";
  public static readonly HttpStatus = HttpStatusCodes.BAD_REQUEST;

  constructor(msg?: string) {
    super(msg ?? ParamMissingError.Msg, ParamMissingError.HttpStatus);
  }
}

export class UserNotFoundError extends CustomError {
  public static readonly Msg = "A user with the given id does not exists in the database.";
  public static readonly HttpStatus = HttpStatusCodes.NOT_FOUND;

  constructor() {
    super(UserNotFoundError.Msg, UserNotFoundError.HttpStatus);
  }
}

export class UnauthorizeError extends CustomError {
  public static readonly Msg = "Access token for the user is expired login again.";
  public static readonly HttpStatus = HttpStatusCodes.UNAUTHORIZED;

  constructor(msg?: string) {
    super(msg ?? UnauthorizeError.Msg, UnauthorizeError.HttpStatus);
  }
}
