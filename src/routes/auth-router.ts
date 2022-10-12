import auth from "@middleware/auth";
import { authLogin, twitterAuthUrl } from "@services/auth-service";
import { generateAccessToken, generateRefreshToken } from "@services/authToken-service";
import prisma from "@shared/prisma";
import { checkErrResponse } from "@validator/userRoutes.validator";
import { Request, Response, Router } from "express";
import { body } from "express-validator";
import HttpStatusCodes from "http-status-codes";
import logger from "jet-logger";
import moment from "moment";
import JSONBigInt from "json-bigint";
import { sensitizeUserData } from "@shared/helper";
import { url } from "inspector";

const authRouter = Router();
const { OK, TEMPORARY_REDIRECT, UNAUTHORIZED } = HttpStatusCodes;

authRouter.get("/twitter-login", (req: Request, res: Response) => {
  (async () => {
    console.log("twitter-login:::");
    const url = await twitterAuthUrl({ callbackUrl: `${process.env.TWITTER_CALLBACK_HOST!}/auth/twitter-return/` });
    return res.status(OK).json({ url });
  })();
});

authRouter.get("/brand-handle", auth.isHavingValidAuthToken, checkErrResponse, (req: Request, res: Response) => {
  console.log("twitter-login:::");
  twitterAuthUrl({
    callbackUrl: `${process.env.TWITTER_CALLBACK_HOST!}/auth/business-twitter-return/`,
    isBrand: true,
    business_owner_id: req.currentUser?.id,
  })
    .then((url) => {
      return res.status(OK).json({ url });
    })
    .catch((err) => {
      console.log("brand-handle:::",err);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw Error(err.message);
    });
});

authRouter.post("/logout", auth.isHavingValidAuthToken, checkErrResponse, (req: Request, res: Response) => {
  prisma.authtoken_token.delete({ where: { user_id: req.currentUser?.id } }).then(() => {
    return res.status(OK).json({ success: true, message: "Logout successfully." });
  });
});

authRouter.post("/refreshToken", body("refreshToken").isString(), checkErrResponse, (req: Request, res: Response) => {
  (async () => {
    const refreshToken = req.body.refreshToken as string;
    const tokenDetails = await prisma.authtoken_token.findUnique({ where: { key: refreshToken }, include: { user_user: true } });
    if (!tokenDetails) {
      throw Error("Refresh token is invalid. Do login again");
    }
    const { user_user } = tokenDetails;
    const newRefreshToken = await generateRefreshToken(user_user);
    const accessToken = generateAccessToken(user_user);
    return res.status(OK).json({
      users: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(user_user))),
      token: accessToken,
      refreshToken: newRefreshToken,
    });
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
      const user = await prisma.user_user.upsert({
        where: { username: username },
        create: {
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
        update: {
          twitter_access_token: accessToken,
          twitter_access_token_secret: accessSecret,
          personal_twitter_id: id,
        },
      });
      // ?token={token.key}&user_id={user.id}
      const token = generateAccessToken(user);
      const refreshToken = await generateRefreshToken(user);
      res.writeHead(TEMPORARY_REDIRECT, {
        Location: `${process.env.FRONTEND_URL!}?token=${token}&refreshToken=${refreshToken}&user_id=${user.id}`,
      });
      res.end();
    } catch (error) {
      logger.err(error.message);
      console.log(error);
      const message: string = error.message as string;
      res.writeHead(TEMPORARY_REDIRECT, {
        Location: `${process.env.FRONTEND_URL!}?authStatus=fail&message=${message}`,
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
      const message: string = error.message as string;
      res.writeHead(TEMPORARY_REDIRECT, {
        Location: `${process.env.FRONTEND_URL!}?brandConnection=fail&message=${message}`,
      });
      res.end();
    }
  })();
});
export default authRouter;
