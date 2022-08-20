import { Request, Response, NextFunction } from "express";
import prisma from "@shared/prisma";
import StatusCodes from "http-status-codes";
// Constants
const { UNAUTHORIZED } = StatusCodes;
const authTokenNotPresentErr = "Authentication token not found.";
const authTokenInvalidError = "Authentication token is invalid.";

const isHavingValidAuthToken = (req: Request, res: Response, next: NextFunction) => {
  (async () => {
    try {
      // Get header token
      const bearerHeader = req.headers["authorization"];

      if (!bearerHeader) {
        throw Error(authTokenNotPresentErr);
      }

      const bearer = bearerHeader.split(" ");
      const bearerToken = bearer[1];

      // get data in reference of auth token
      const clientData = await prisma.authtoken_token.findUnique({
        where: { key: bearerToken },
        include: {
          user_user: {
            select: {
              id: true,
              hedera_wallet_id: true,
              username: true,
              first_name: true,
              last_login: true,
              last_name: true,
              twitter_access_token: true,
              twitter_access_token_secret: true,
              personal_twitter_handle: true,
              business_twitter_access_token: true,
              business_twitter_access_token_secret: true,
              business_twitter_handle: true,
              consent: true,
              is_staff: true,
              is_superuser:true
            },
          },
        },
      });
      if (clientData?.user_id) {
        req.currentUser = clientData;
        next();
      } else {
        throw Error(authTokenInvalidError);
      }
    } catch (err) {
      return res.status(UNAUTHORIZED).json({
        error: err.message,
      });
    }
  })();
};

export default {
  isHavingValidAuthToken,
} as const;
