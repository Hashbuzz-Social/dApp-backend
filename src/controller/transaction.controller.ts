import { Request, Response } from "express";
import StatusCodes from "http-status-codes";

const { OK } = StatusCodes;

export const topUpHandler = (_: Request, res: Response) => {
  return res.status(OK).json({ validate: "success" });
};


