import { Request, Response, NextFunction } from "express";
import statusCodes from "http-status-codes";
import { NOT_SUFFICIENT_PERMISSION } from "@shared/messages";

const { UNAUTHORIZED } = statusCodes;

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  const currentUser = req.currentUser?.user_user.is_staff;
  if (currentUser) next();
  else return res.status(UNAUTHORIZED).json({ error: true, message: NOT_SUFFICIENT_PERMISSION });
};
