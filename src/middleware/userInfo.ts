import createPrismaClient from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import logger from "jet-logger";

const getCurrentUserInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accountAddress = req.accountAddress;

    if (accountAddress) {
      const prisma = await createPrismaClient();
      const currentUser = await prisma.user_user.findUnique({
        where: { accountAddress },
        include: {
          user_sessions: {
            where: {
              device_id: req.deviceId
            },
          },
        },
      });
      if (currentUser) {
        req.currentUser = currentUser;
        next();
      } else {
        logger.err("Error: Invalid address !! User not found in record");
        throw new Error("Invalid user.");
      }
    } else {
      logger.err("Error: User not found");
      throw new Error("Inavlid current user.");
    }
  } catch (err) {
    next(err);
  }
};

export default { getCurrentUserInfo } as const;
