import { UnauthorizeError } from "@shared/errors";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const authTokenNotPresentErr = "Authentication token not found.";
const authTokenInvalidError = "Authentication token is invalid.";

const isHavingValidAuthToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get header token
    const accessSecret = process.env.J_ACCESS_TOKEN_SECRET;
    const bearerHeader = req.headers["authorization"];

    if (!bearerHeader) {
      throw new UnauthorizeError(authTokenNotPresentErr);
    }

    const bearer = bearerHeader.split(" ");
    const bearerToken = bearer[1];

    jwt.verify(bearerToken, accessSecret!, (err, payload) => {
      if (err) {
        throw new UnauthorizeError(authTokenInvalidError);
      }
      (async () => {
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
            name: true,
            last_login: true,
            role: true,
            profile_image_url: true,
            twitter_access_token: true,
            twitter_access_token_secret: true,
            personal_twitter_handle: true,
            business_twitter_access_token: true,
            business_twitter_access_token_secret: true,
            business_twitter_handle: true,
            consent: true,
          },
        });
        req.currentUser = clientData!;
        next();
      })();
    });
  } catch (err) {
    next(err);
    // res.status(UNAUTHORIZED).json({
    //   error: err.message,
    // });
  }
};

const isAdminRequesting = (req: Request, res: Response, next: NextFunction) => {
  if (req.currentUser?.username && ["Ashh20x", "omprakashMahua"].includes(req.currentUser?.username)) next();
  next(new UnauthorizeError());
  // return res.status(UNAUTHORIZED).json({
  //   error: Error("You are not authorize to accesses."),
  // });
};

export default {
  isHavingValidAuthToken,
  isAdminRequesting,
} as const;

