import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import StatusCodes from "http-status-codes";
import jwt from "jsonwebtoken";
// Constants
const { UNAUTHORIZED } = StatusCodes;
const authTokenNotPresentErr = "Authentication token not found.";
const authTokenInvalidError = "Authentication token is invalid.";

const isHavingValidAuthToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get header token
    const accessSecret = process.env.J_ACCESS_TOKEN_SECRET;
    const bearerHeader = req.headers["authorization"];

    if (!bearerHeader) {
      throw Error(authTokenNotPresentErr);
    }

    const bearer = bearerHeader.split(" ");
    const bearerToken = bearer[1];

    jwt.verify(bearerToken, accessSecret!, (err, payload) => {
      (async () => {
        if (err) throw Error(authTokenInvalidError);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const username: string = payload.username;
        // get data in reference of auth token
        const clientData = await prisma.user_user.findUnique({
          where: { username },
          select: {
            id: true,
            hedera_wallet_id: true,
            available_budget: true,
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
            is_superuser: true,
          },
        });

        if (clientData) {
          req.currentUser = clientData;
          next();
        } else {
          throw Error(authTokenInvalidError);
        }
      })();
    });
  } catch (err) {
    return res.status(UNAUTHORIZED).json({
      error: err.message,
    });
  }
};

const isAdminRequesting = (req: Request, res: Response, next: NextFunction) => {
  if (req.currentUser?.username && ["Ashh20x", "omprakashMahua"].includes(req.currentUser?.username)) next();
  else
    return res.status(UNAUTHORIZED).json({
      error: Error("You are not authorize to accesses."),
    });
};

export default {
  isHavingValidAuthToken,
  isAdminRequesting,
} as const;
