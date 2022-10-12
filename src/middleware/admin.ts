import { Request, Response, NextFunction } from "express";
import statusCodes from "http-status-codes";
import messages from "@shared/messages";

const { UNAUTHORIZED } = statusCodes;

const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  const currentUser = req.currentUser?.is_superuser;
  if (currentUser) next();
  else return res.status(UNAUTHORIZED).json({ error: true, message: messages.NOT_SUFFICIENT_PERMISSION });
};

export default {
  isAdmin,
} as const;
