import prisma from "@shared/prisma";
import { Request, Response, NextFunction } from "express";

const getCurrentUserInfo = (req: Request, res: Response, next: NextFunction) => {
  try {
    const accountAddress = req.accountAddress;
    (async () => {
      if (accountAddress) {
        const currentUser = await prisma.user_user.findUnique({
          where: { accountAddress },
        });
        if (currentUser) req.currentUser = currentUser;
        next();
      }
    })();
  } catch (err) {
    next(err);
  }
};

export default { getCurrentUserInfo } as const;
