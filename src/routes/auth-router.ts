import { Router, Response, Request } from "express";
import { authLogin, twitterAuthUrl } from "@services/auth-service";
import HttpStatusCodes from "http-status-codes";
import prisma from "@shared/prisma";
import { user_user } from "@prisma/client";
import twitterAPI from "@shared/twitterAPI";
import userService from "@services/user-service";
import moment from "moment";
import { generateAccessToken, generateRefreshToken } from "@services/authToken-service";
import auth from "@middleware/auth";
import logger from "jet-logger";

const authRouter = Router();
const { OK, TEMPORARY_REDIRECT } = HttpStatusCodes;

authRouter.get("/twitter-login", (req: Request, res: Response) => {
  (async () => {
    console.log("twitter-login:::");
    const url = await twitterAuthUrl({ callbackUrl: `${process.env.TWITTER_CALLBACK_HOST!}/auth/twitter-return/` });
    return res.status(OK).json({ url });
  })();
});

authRouter.get("/brand-handle", auth.isHavingValidAuthToken, (req: Request, res: Response) => {
  (async () => {
    console.log("twitter-login:::");
    const url = await twitterAuthUrl({
      callbackUrl: `${process.env.TWITTER_CALLBACK_HOST!}/auth/business-twitter-return/`,
      isBrand: true,
      business_owner_id: req.currentUser?.id,
    });
    return res.status(OK).json({ url });
  })();
});

authRouter.get("/twitter-return", (req: Request, res: Response) => {
  (async () => {
    try {
      // Extract tokens from query string
      const oauth_token = req.query.oauth_token as any as string;
      const oauth_verifier = req.query.oauth_verifier as any as string;

      // Obtain the persistent tokens
      // Create a client from temporary tokens
      const { loginResult } = await authLogin({ oauth_token, oauth_verifier });
      const { client: loggedClient, accessToken, accessSecret } = loginResult;
      const meUser = await loggedClient.v2.me();
      const { username, id } = meUser.data;
      let user: user_user;
      const existinguser = await userService.getUserByUserName(username);
      if (!existinguser) {
        user = await prisma.user_user.create({
          data: {
            personal_twitter_handle: username,
            username: username,
            personal_twitter_id: id,
            twitter_access_token: accessToken,
            twitter_access_token_secret: accessSecret,
            available_budget: 0,
            is_superuser: false,
            is_active: true,
            is_staff: false,
            first_name: "",
            last_name: "",
            email: "",
            password: "",
            date_joined: moment().toISOString(),
          },
        });
      } else {
        user = await prisma.user_user.update({
          where: {
            username,
          },
          data: {
            twitter_access_token: accessToken,
            twitter_access_token_secret: accessSecret,
          },
        });
      }
      // ?token={token.key}&user_id={user.id}
      const token = generateAccessToken(user);
      const refreshToken = await generateRefreshToken(user);
      res.writeHead(TEMPORARY_REDIRECT, {
        Location: `${process.env.FRONTEND_URL!}?token=${token}&user_id=${user.id}&refresh_token=${refreshToken}`,
      });
      res.end();
    } catch (error) {
      logger.err(error.message);
      const message:string = error.message  as string;
      res.writeHead(TEMPORARY_REDIRECT, {
        Location: `${process.env.FRONTEND_URL!}?brandConnection=fail&message=${message}`,
      });
      res.end();
    }
  })();
});

authRouter.get("/business-twitter-return", (req: Request, res: Response) => {
  (async () => {
    try {
      // Extract tokens from query string
      const oauth_token = req.query.oauth_token as any as string;
      const oauth_verifier = req.query.oauth_verifier as any as string;

      // Obtain the persistent tokens
      // Create a client from temporary tokens
      const { loginResult, business_owner_id } = await authLogin({ oauth_token, oauth_verifier });
      const { client: loggedClient, accessToken, accessSecret } = loginResult;
      const meUser = await loggedClient.v2.me();
      const { username, id } = meUser.data;
      const user = await prisma.user_user.update({
        where: {
          id: business_owner_id!,
        },
        data: {
          business_twitter_handle: username,
          business_twitter_access_token: accessToken,
          business_twitter_access_token_secret: accessSecret,
        },
      });
      res.writeHead(TEMPORARY_REDIRECT, {
        Location: `${process.env.FRONTEND_URL!}?brandConnection=success&handle=${username}`,
      });
      res.end();
    } catch (error) {
      logger.err(error.message);
      const message:string = error.message  as string;
      res.writeHead(TEMPORARY_REDIRECT, {
        Location: `${process.env.FRONTEND_URL!}?brandConnection=fail&message=${message}`,
      });
      res.end();
    }
  })();
});
export default authRouter;
