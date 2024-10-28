import { authLogin, twitterAuthUrl } from "@services/auth-service";
import { encrypt } from "@shared/encryption";
import { ErrorWithCode } from "@shared/errors";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import HttpStatusCodes from "http-status-codes";

const { OK, INTERNAL_SERVER_ERROR, TEMPORARY_REDIRECT } = HttpStatusCodes;

const callbackUrlTwitter = process.env.TWITTER_CALLBACK_HOST;

export const handlePersonalTwitterHandle = async (req: Request, res: Response, next: NextFunction) => {
  const user_id = req.currentUser?.id;
  if (user_id) {
    const url = await twitterAuthUrl({ callbackUrl: `${callbackUrlTwitter!}/auth/twitter-return/`, user_id });
    return res.status(OK).json({ url });
  }
};

export const handleBizTwitterHandle = (req: Request, res: Response, next: NextFunction) => {
  const user_id = req.currentUser?.id;
  if (user_id) {
    twitterAuthUrl({
      callbackUrl: `${callbackUrlTwitter!}/auth/business-twitter-return/`,
      isBrand: true,
      user_id,
    })
      .then((url) => {
        return res.status(OK).json({ url });
      })
      .catch(() => {
        next(new ErrorWithCode("Error while create twittwe auth link", INTERNAL_SERVER_ERROR));
      });
  }
};

export const handleTwitterReturnUrl = async (req: Request, res: Response) => {
  try {
    // Extract tokens from query string
    const oauth_token = req.query.oauth_token as any as string;
    const oauth_verifier = req.query.oauth_verifier as any as string;

    // Obtain the persistent tokens
    // Create a client from temporary tokens
    const { loginResult, user_id } = await authLogin({ oauth_token, oauth_verifier });
    const { client: loggedClient, accessToken, accessSecret } = loginResult;
    const meUser = await loggedClient.v2.me();
    const { username, id, name, profile_image_url } = meUser.data;
    const user = await prisma.user_user.update({
      where: { id: user_id },
      data: {
        personal_twitter_handle: username,
        personal_twitter_id: id,
        twitter_access_token: encrypt(accessToken),
        twitter_access_token_secret: encrypt(accessSecret),
        profile_image_url: profile_image_url ?? "",
        name,
      },
    });

    // const getAstForUserById = await userService.getAstForUserByAccountAddress(user.id , req.deviceId!);

    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${process.env.FRONTEND_URL!}?user_id=${user.id}&username=${username}`,
    });
    res.end();
  } catch (error) {
    // logger.err(error.message);
    console.log(error);
    const message: string = error.message as string;
    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${process.env.FRONTEND_URL!}?authStatus=fail&message=${message}`,
    });
    res.end();
  }
};

export const handleTwitterBizRegister = async (req: Request, res: Response) => {
  try {
    // Extract tokens from query string
    const oauth_token = req.query.oauth_token as any as string;
    const oauth_verifier = req.query.oauth_verifier as any as string;

    // Obtain the persistent tokens
    // Create a client from temporary tokens
    const { loginResult, user_id } = await authLogin({ oauth_token, oauth_verifier });
    const { client: loggedClient, accessToken, accessSecret } = loginResult;
    const meUser = await loggedClient.v2.me();
    const { username } = meUser.data;
    await prisma.user_user.update({
      where: {
        id: user_id,
      },
      data: {
        business_twitter_handle: username,
        business_twitter_access_token: encrypt(accessToken),
        business_twitter_access_token_secret: encrypt(accessSecret),
        is_active: true,
      },
    });
    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${process.env.FRONTEND_URL!}?brandConnection=success&handle=${username}`,
    });
    res.end();
  } catch (error) {
    // logger.err(error.message);
    const message: string = error.message as string;
    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${process.env.FRONTEND_URL!}?brandConnection=fail&message=${message}`,
    });
    res.end();
  }
};
