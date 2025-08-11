import { authLogin, twitterAuthUrl } from "@services/auth-service";
import { encrypt } from "@shared/encryption";
import { ErrorWithCode } from "@shared/errors";
import createPrismaClient from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import HttpStatusCodes from "http-status-codes";
import { getConfig } from "@appConfig";

const { OK, INTERNAL_SERVER_ERROR, TEMPORARY_REDIRECT } = HttpStatusCodes;

export const handlePersonalTwitterHandle = async (req: Request, res: Response, next: NextFunction) => {
  const user_id = req.currentUser?.id;
  try {
    if (user_id) {
      const config = await getConfig();
      // Use frontend callback URL for stateful handling
      const callbackUrl = `${config.app.appURL}/auth/twitter-callback`;
      const url = await twitterAuthUrl({ callbackUrl, user_id });
      return res.status(OK).json({ url });
    }
  } catch (err) {
    console.log(err);
    next(new ErrorWithCode("Error while create twitter auth link", INTERNAL_SERVER_ERROR));
  }
};

export const handleBizTwitterHandle = async (req: Request, res: Response, next: NextFunction) => {
  const user_id = req.currentUser?.id;
  const config = await getConfig();

  if (user_id) {
    twitterAuthUrl({
      callbackUrl: `${config.app.xCallBackHost}/auth/business-twitter-return/`,
      isBrand: true,
      user_id,
    })
      .then((url) => {
        return res.status(OK).json({ url });
      })
      .catch((err) => {
        console.log(err);
        next(new ErrorWithCode("Error while create twittwe auth link", INTERNAL_SERVER_ERROR));
      });
  }
};

export const handleTwitterReturnUrl = async (req: Request, res: Response) => {
  const config = await getConfig()
  const appURl = config.app.appURL;
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
    const prisma = await createPrismaClient();


    const user = await prisma.user_user.update({
      where: { id: user_id },
      data: {
        personal_twitter_handle: username,
        personal_twitter_id: id,
        twitter_access_token: encrypt(accessToken, config.encryptions.encryptionKey),
        twitter_access_token_secret: encrypt(accessSecret, config.encryptions.encryptionKey),
        profile_image_url: profile_image_url ?? "",
        name,
      },
    });


    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${appURl}?user_id=${user.id}&username=${username}`,
    });
    res.end();
  } catch (error) {
    // logger.err(error.message);
    console.log(error);
    const message: string = error.message as string;
    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${appURl}?authStatus=fail&message=${message}`,
    });
    res.end();
  }
};

export const handleTwitterBizRegister = async (req: Request, res: Response) => {
  const config = await getConfig()
  const appURl = config.app.appURL;
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
    const prisma = await createPrismaClient();
    await prisma.user_user.update({
      where: {
        id: user_id,
      },
      data: {
        business_twitter_handle: username,
        business_twitter_access_token: encrypt(accessToken, config.encryptions.encryptionKey),
        business_twitter_access_token_secret: encrypt(accessSecret, config.encryptions.encryptionKey),
        is_active: true,
      },
    });
    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${appURl}?brandConnection=success&handle=${username}`,
    });
    res.end();
  } catch (error) {
    // logger.err(error.message);
    const message: string = error.message as string;
    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${appURl}?brandConnection=fail&message=${message}`,
    });
    res.end();
  }
};

// New API endpoint for handling Twitter callback via API instead of redirect
export const handleTwitterCallbackAPI = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { oauth_token, oauth_verifier, variant } = req.body;
    const user_id = req.currentUser?.id;
    
    if (!oauth_token || !oauth_verifier) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing OAuth parameters" 
      });
    }

    if (!variant || !["personal", "business"].includes(variant)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid or missing variant parameter. Must be 'personal' or 'business'" 
      });
    }

    // Process the OAuth callback
    const { loginResult, user_id: authUserId } = await authLogin({ oauth_token, oauth_verifier });
    const { client: loggedClient, accessToken, accessSecret } = loginResult;
    const meUser = await loggedClient.v2.me();
    const { username, id, name, profile_image_url } = meUser.data;
    
    const config = await getConfig();
    const prisma = await createPrismaClient();

    // Prepare update data based on variant
    let updateData: any = {};
    let successMessage = "";

    if (variant === "personal") {
      updateData = {
        personal_twitter_handle: username,
        personal_twitter_id: id,
        twitter_access_token: encrypt(accessToken, config.encryptions.encryptionKey),
        twitter_access_token_secret: encrypt(accessSecret, config.encryptions.encryptionKey),
        profile_image_url: profile_image_url ?? "",
        name,
      };
      successMessage = "Personal X account connected successfully";
    } else if (variant === "business") {
      updateData = {
        business_twitter_handle: username,
        business_twitter_id: id,
        business_twitter_access_token: encrypt(accessToken, config.encryptions.encryptionKey),
        business_twitter_access_token_secret: encrypt(accessSecret, config.encryptions.encryptionKey),
        business_profile_image_url: profile_image_url ?? "",
        business_name: name,
        is_active: true, // Activate user when business account is connected
      };
      successMessage = "Business X account connected successfully";
    }

    // Update user with Twitter information
    const user = await prisma.user_user.update({
      where: { id: authUserId },
      data: updateData,
    });

    return res.status(OK).json({
      success: true,
      username,
      variant,
      message: successMessage
    });

  } catch (error) {
    console.log(error);
    return res.status(INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "Failed to connect X account"
    });
  }
};

// New endpoint to check X account connection status
export const handleCheckXAccountStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user_id = req.currentUser?.id;
    if (!user_id) {
      return res.status(401).json({ 
        isConnected: false, 
        message: "User not authenticated" 
      });
    }

    const prisma = await createPrismaClient();
    const user = await prisma.user_user.findUnique({
      where: { id: user_id },
      select: { 
        personal_twitter_handle: true,
        personal_twitter_id: true,
      }
    });

    return res.status(OK).json({
      isConnected: !!(user?.personal_twitter_handle && user?.personal_twitter_id),
      handle: user?.personal_twitter_handle || undefined
    });

  } catch (error) {
    console.log(error);
    next(new ErrorWithCode("Error checking X account status", INTERNAL_SERVER_ERROR));
  }
};
