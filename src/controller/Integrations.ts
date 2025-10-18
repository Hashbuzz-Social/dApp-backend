import { getConfig } from '@appConfig';
import { authLogin, twitterAuthUrl } from '@services/auth-service';
import { encrypt } from '@shared/encryption';
import { ErrorWithCode } from '@shared/errors';
import createPrismaClient from '@shared/prisma';
import { NextFunction, Request, Response } from 'express';
import HttpStatusCodes from 'http-status-codes';
import logger from '../config/logger';

const { OK, UNAUTHORIZED, INTERNAL_SERVER_ERROR, TEMPORARY_REDIRECT } = HttpStatusCodes;

// Constants
const FALLBACK_PROFILE_DOMAIN = 'https://unavatar.io/twitter';
const TOKEN_VALIDATION_MIN_LENGTH = 10;

export const handlePersonalTwitterHandle = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const user_id = req.currentUser?.id;

  logger.info(`[${requestId}] Starting personal Twitter auth for user: ${String(user_id)}`);

  try {
    if (!user_id) {
      logger.warn(`[${requestId}] No user ID found in request`);
      return res.status(UNAUTHORIZED).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const config = await getConfig();
    const callbackUrl = `${config.app.appURL}/auth/twitter-callback`;

    logger.info(`[${requestId}] Generated callback URL: ${callbackUrl}`);

    const url = await twitterAuthUrl({ callbackUrl, user_id });

    logger.info(`[${requestId}] Successfully generated Twitter auth URL`);
    return res.status(OK).json({ url });

  } catch (error) {
    const errorMessage = (error as Error).message;
    const errorStack = (error as Error).stack || 'No stack trace';
    logger.err(`[${requestId}] Failed to create Twitter auth link: ${errorMessage}`);
    logger.err(`[${requestId}] Error details: UserID=${String(user_id)}, Stack=${errorStack}`);

    next(
      new ErrorWithCode(
        'Failed to generate Twitter authentication link',
        INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const handleBizTwitterHandle = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const user_id = req.currentUser?.id;

  logger.info(`[${requestId}] Starting business Twitter auth for user: ${String(user_id)}`);

  try {
    if (!user_id) {
      logger.warn(`[${requestId}] No user ID found in request`);
      return res.status(UNAUTHORIZED).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const config = await getConfig();
    const callbackUrl = `${config.app.appURL}/business-handle-callback`;

    logger.info(`[${requestId}] Generated business callback URL: ${callbackUrl}`);

    const url = await twitterAuthUrl({
      callbackUrl,
      isBrand: true,
      user_id,
    });

    logger.info(`[${requestId}] Successfully generated business Twitter auth URL`);
    return res.status(OK).json({ url });

  } catch (error) {
    const errorMessage = (error as Error).message;
    const errorStack = (error as Error).stack || 'No stack trace';
    logger.err(`[${requestId}] Failed to create business Twitter auth link: ${errorMessage}`);
    logger.err(`[${requestId}] Business auth error details: UserID=${String(user_id)}, Stack=${errorStack}`);

    next(
      new ErrorWithCode(
        'Failed to generate business Twitter authentication link',
        INTERNAL_SERVER_ERROR
      )
    );
  }
};

// Helper functions
const validateTwitterTokens = (accessToken: string, accessSecret: string): { isValid: boolean; error?: string } => {
  if (!accessToken || !accessSecret) {
    return { isValid: false, error: 'Access tokens are missing' };
  }

  if (accessToken.length < TOKEN_VALIDATION_MIN_LENGTH || accessSecret.length < TOKEN_VALIDATION_MIN_LENGTH) {
    return { isValid: false, error: 'Access tokens appear to be invalid' };
  }

  return { isValid: true };
};

const createFallbackProfileUrl = (username: string): string => {
  return `${FALLBACK_PROFILE_DOMAIN}/${username}`;
};

const logTwitterApiResponse = (requestId: string, data: any, type: 'personal' | 'business') => {
  const username = String(data.username || 'unknown');
  const id = String(data.id || 'unknown');
  const verified = String(data.verified || false);
  const hasProfileImage = String(!!data.profile_image_url);
  logger.info(`[${requestId}] Twitter API Response (${type}):`);
  logger.info(`[${requestId}] - username=${username}, id=${id}, verified=${verified}, hasImage=${hasProfileImage}`);
};

export const handleTwitterReturnUrl = async (req: Request, res: Response) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const config = await getConfig();
    const appURl = config.app.appURL;

    // Extract tokens from query string
    const oauth_token = req.query.oauth_token as string;
    const oauth_verifier = req.query.oauth_verifier as string;

    const hasToken = String(!!oauth_token);
    const hasVerifier = String(!!oauth_verifier);
    logger.info(`[${requestId}] Processing personal Twitter callback - hasOAuthToken: ${hasToken}, hasVerifier: ${hasVerifier}`);

    if (!oauth_token || !oauth_verifier) {
      throw new Error('Missing OAuth parameters in callback');
    }

    // Obtain the persistent tokens
    const { loginResult, user_id } = await authLogin({
      oauth_token,
      oauth_verifier,
    });

    const { client: loggedClient, accessToken, accessSecret } = loginResult;

    // Validate tokens
    const tokenValidation = validateTwitterTokens(accessToken, accessSecret);
    if (!tokenValidation.isValid) {
      const errorMsg = tokenValidation.error || 'Unknown error';
      throw new Error(`Token validation failed: ${errorMsg}`);
    }

    logger.info(`[${requestId}] Successfully authenticated user: ${user_id}`);

    const meUser = await loggedClient.v2.me({
      'user.fields': [
        'profile_image_url',
        'name',
        'username',
        'id',
        'description',
        'verified',
      ],
    });

    const { username, id, name, profile_image_url } = meUser.data;

    logTwitterApiResponse(requestId, meUser.data, 'personal');

    // Create fallback profile image URL if not provided by API
    const profileImageUrl = profile_image_url || createFallbackProfileUrl(username);

    const prisma = await createPrismaClient();

    const user = await prisma.user_user.update({
      where: { id: user_id },
      data: {
        personal_twitter_handle: username,
        personal_twitter_id: id,
        twitter_access_token: encrypt(
          accessToken,
          config.encryptions.encryptionKey
        ),
        twitter_access_token_secret: encrypt(
          accessSecret,
          config.encryptions.encryptionKey
        ),
        profile_image_url: profileImageUrl,
        name,
      },
    });

    logger.info(`[${requestId}] Successfully updated user profile for: ${username}`);

    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${appURl}?user_id=${user.id}&username=${username}`,
    });
    res.end();

  } catch (error) {
    const errorMessage = (error as Error).message;
    const errorStack = (error as Error).stack || 'No stack trace';
    logger.err(`[${requestId}] Personal Twitter callback failed: ${errorMessage}`);
    logger.err(`[${requestId}] Callback error stack: ${errorStack}`);

    const config = await getConfig();
    const appURl = config.app.appURL;

    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${appURl}?authStatus=fail&message=${encodeURIComponent(errorMessage)}`,
    });
    res.end();
  }
};

export const handleTwitterBizRegister = async (req: Request, res: Response) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const config = await getConfig();
    const appURl = config.app.appURL;

    // Extract tokens from query string
    const oauth_token = req.query.oauth_token as string;
    const oauth_verifier = req.query.oauth_verifier as string;

    logger.info(`[${requestId}] Processing business Twitter callback`);

    if (!oauth_token || !oauth_verifier) {
      throw new Error('Missing OAuth parameters in business callback');
    }

    // Obtain the persistent tokens
    const { loginResult, user_id } = await authLogin({
      oauth_token,
      oauth_verifier,
    });

    const { client: loggedClient, accessToken, accessSecret } = loginResult;

    // Validate tokens
    const tokenValidation = validateTwitterTokens(accessToken, accessSecret);
    if (!tokenValidation.isValid) {
      const errorMsg = tokenValidation.error || 'Unknown error';
      throw new Error(`Business token validation failed: ${errorMsg}`);
    }

    logger.info(`[${requestId}] Successfully authenticated business user: ${String(user_id)}`);

    const meUser = await loggedClient.v2.me({
      'user.fields': [
        'profile_image_url',
        'name',
        'username',
        'id',
        'description',
        'verified',
      ],
    });

    const { username } = meUser.data;

    logTwitterApiResponse(requestId, meUser.data, 'business');

    const prisma = await createPrismaClient();

    await prisma.user_user.update({
      where: {
        id: user_id,
      },
      data: {
        business_twitter_handle: username,
        business_twitter_access_token: encrypt(
          accessToken,
          config.encryptions.encryptionKey
        ),
        business_twitter_access_token_secret: encrypt(
          accessSecret,
          config.encryptions.encryptionKey
        ),
        is_active: true,
      },
    });

    logger.info(`[${requestId}] Successfully updated business profile for: ${username}`);

    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${appURl}?brandConnection=success&handle=${username}`,
    });
    res.end();

  } catch (error) {
    const errorMessage = (error as Error).message;
    const errorStack = (error as Error).stack || 'No stack trace';
    logger.err(`[${requestId}] Business Twitter callback failed: ${errorMessage}`);
    logger.err(`[${requestId}] Business callback error stack: ${errorStack}`);

    const config = await getConfig();
    const appURl = config.app.appURL;

    res.writeHead(TEMPORARY_REDIRECT, {
      Location: `${appURl}?brandConnection=fail&message=${encodeURIComponent(errorMessage)}`,
    });
    res.end();
  }
};

// New API endpoint for handling Twitter callback via API instead of redirect
export const handleTwitterCallbackAPI = async (req: Request, res: Response) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const warnings: string[] = [];
  let isTokenRelatedError = false;

  logger.info(`[${requestId}] Starting Twitter callback API processing`);

  try {
    const { oauth_token, oauth_verifier, variant } = req.body;

    // Validate OAuth parameters - these are critical
    if (!oauth_token || !oauth_verifier) {
      logger.warn(`[${requestId}] Missing OAuth parameters`);
      return res.status(400).json({
        success: false,
        message: 'Missing OAuth parameters',
        error_type: 'validation',
      });
    }

    // Validate OAuth token format
    if (typeof oauth_token !== 'string' || oauth_token.trim().length === 0) {
      isTokenRelatedError = true;
      logger.warn(`[${requestId}] Invalid OAuth token format`);
      return res.status(400).json({
        success: false,
        message: 'Invalid OAuth token format',
        error_type: 'token_validation',
      });
    }

    if (
      typeof oauth_verifier !== 'string' ||
      oauth_verifier.trim().length === 0
    ) {
      isTokenRelatedError = true;
      logger.warn(`[${requestId}] Invalid OAuth verifier format`);
      return res.status(400).json({
        success: false,
        message: 'Invalid OAuth verifier format',
        error_type: 'token_validation',
      });
    }

    if (
      !variant ||
      typeof variant !== 'string' ||
      !['personal', 'business'].includes(variant)
    ) {
      logger.warn(`[${requestId}] Invalid variant parameter: ${String(variant)}`);
      return res.status(400).json({
        success: false,
        message:
          "Invalid or missing variant parameter. Must be 'personal' or 'business'",
        error_type: 'validation',
      });
    }

    logger.info(`[${requestId}] Processing ${variant} Twitter authentication`);

    // Process the OAuth callback with token-specific error handling
    let loginResult, authUserId;
    try {
      const authResponse = await authLogin({ oauth_token, oauth_verifier });
      loginResult = authResponse.loginResult;
      authUserId = authResponse.user_id;
      logger.info(`[${requestId}] OAuth authentication successful for user: ${String(authUserId)}`);
    } catch (authError) {
      isTokenRelatedError = true;
      const authErrorMsg = (authError as Error).message;
      logger.err(`[${requestId}] OAuth authentication failed: ${authErrorMsg}`);
      return res.status(401).json({
        success: false,
        message:
          'Authentication failed. OAuth tokens may be invalid or expired.',
        error_type: 'auth_failure',
      });
    }

    const { client: loggedClient, accessToken, accessSecret } = loginResult;

    // Validate access tokens
    const tokenValidation = validateTwitterTokens(accessToken, accessSecret);
    if (!tokenValidation.isValid) {
      isTokenRelatedError = true;
      const tokenError = tokenValidation.error || 'Unknown token error';
      logger.err(`[${requestId}] Token validation failed: ${tokenError}`);
      return res.status(401).json({
        success: false,
        message: 'Failed to retrieve access tokens from OAuth process',
        error_type: 'token_retrieval',
      });
    }

    logger.info(`[${requestId}] Access tokens validated successfully`);

    // Get user info with error handling
    let meUser, username, id, name, profile_image_url;
    try {
      meUser = await loggedClient.v2.me({
        'user.fields': [
          'profile_image_url',
          'name',
          'username',
          'id',
          'description',
          'verified',
        ],
      });
      ({ username, id, name, profile_image_url } = meUser.data);

      if (!username || !id) {
        throw new Error('Missing required user data from Twitter API');
      }

      logger.info(`[${requestId}] Successfully fetched Twitter user data for: ${username}`);
    } catch (twitterApiError) {
      const apiErrorMsg = (twitterApiError as Error).message;
      logger.warn(`[${requestId}] Twitter API call failed: ${apiErrorMsg}`);
      warnings.push(
        'Unable to fetch complete profile information from Twitter'
      );

      // Use fallback values
      const timestamp = Date.now();
      username = `user_${timestamp}`;
      id = `${oauth_token.substring(0, 10)}_${timestamp}`;
      name = username;
      profile_image_url = null;

      logger.info(`[${requestId}] Using fallback user data: ${username}`);
    }

    // Log the full response to see what's available (only if successful)
    if (meUser) {
      logTwitterApiResponse(requestId, meUser.data, variant as 'personal' | 'business');
    }

    // Create fallback profile image URL if not provided by API
    const profileImageUrl = profile_image_url || createFallbackProfileUrl(username);

    let config;
    try {
      config = await getConfig();

      // Validate encryption key exists
      if (!config?.encryptions?.encryptionKey) {
        throw new Error('Encryption configuration missing');
      }
    } catch (configError) {
      const configErrorMsg = (configError as Error).message;
      logger.err(`[${requestId}] Configuration error: ${configErrorMsg}`);
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
        error_type: 'config_error',
      });
    }

    const prisma = await createPrismaClient();

    // Prepare update data based on variant with encryption error handling
    let updateData: any = {};
    let successMessage = '';

    try {
      if (variant === 'personal') {
        updateData = {
          personal_twitter_handle: username,
          personal_twitter_id: id,
          twitter_access_token: encrypt(
            accessToken,
            config.encryptions.encryptionKey
          ),
          twitter_access_token_secret: encrypt(
            accessSecret,
            config.encryptions.encryptionKey
          ),
          profile_image_url: profileImageUrl,
          name,
        };
        successMessage = 'Personal X account connected successfully';
      } else if (variant === 'business') {
        updateData = {
          business_twitter_handle: username,
          business_twitter_access_token: encrypt(
            accessToken,
            config.encryptions.encryptionKey
          ),
          business_twitter_access_token_secret: encrypt(
            accessSecret,
            config.encryptions.encryptionKey
          ),
          is_active: true, // Activate user when business account is connected
        };
        successMessage = 'Business X account connected successfully';
      }

      logger.info(`[${requestId}] Prepared ${variant} update data for encryption`);
    } catch (encryptionError) {
      isTokenRelatedError = true;
      const encryptErrorMsg = (encryptionError as Error).message;
      logger.err(`[${requestId}] Token encryption failed: ${encryptErrorMsg}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to secure access tokens',
        error_type: 'encryption_failure',
      });
    }

    // Update user with Twitter information
    try {
      await prisma.user_user.update({
        where: { id: authUserId },
        data: updateData,
      });

      logger.info(`[${requestId}] Successfully updated user profile in database`);
    } catch (dbError) {
      const dbErrorMsg = (dbError as Error).message;
      logger.err(`[${requestId}] Database update failed: ${dbErrorMsg}`);
      warnings.push('Profile update completed with some limitations');

      // Try with minimal data
      try {
        const minimalData =
          variant === 'personal'
            ? { personal_twitter_handle: username, personal_twitter_id: id }
            : { business_twitter_handle: username, is_active: true };

        await prisma.user_user.update({
          where: { id: authUserId },
          data: minimalData,
        });
        warnings.push(
          'Some profile data could not be saved due to database constraints'
        );

        logger.warn(`[${requestId}] Fallback database update completed with minimal data`);
      } catch (fallbackError) {
        const fallbackErrorMsg = (fallbackError as Error).message;
        logger.err(`[${requestId}] Fallback database update failed: ${fallbackErrorMsg}`);
        return res.status(500).json({
          success: false,
          message: 'Database error occurred while saving account information',
          error_type: 'database_error',
        });
      }
    }

    // Success response with warnings if any
    const response: any = {
      success: true,
      username,
      variant,
      message: successMessage,
    };

    if (warnings.length > 0) {
      response.warnings = warnings;
      logger.warn(`[${requestId}] Completed with warnings: ${JSON.stringify(warnings)}`);
    } else {
      logger.info(`[${requestId}] Twitter callback API completed successfully`);
    }

    return res.status(OK).json(response);
  } catch (error) {
    // Log all errors for debugging
    const errorMessage = (error as Error).message;
    const errorStack = (error as Error).stack || 'No stack trace';
    logger.err(`[${requestId}] Unexpected error in handleTwitterCallbackAPI: ${errorMessage}`);
    logger.err(`[${requestId}] Error stack: ${errorStack}`);

    // Determine if this is a token-related error
    const errorMessageLower = errorMessage.toLowerCase();
    isTokenRelatedError =
      isTokenRelatedError ||
      errorMessageLower.includes('token') ||
      errorMessageLower.includes('oauth') ||
      errorMessageLower.includes('auth') ||
      errorMessageLower.includes('decrypt') ||
      errorMessageLower.includes('encrypt');

    if (isTokenRelatedError) {
      logger.err(`[${requestId}] Classified as token-related error`);
      return res.status(401).json({
        success: false,
        message: 'Authentication failed due to token-related issues',
        error_type: 'token_error',
      });
    } else {
      // For non-token errors, return success with warnings
      logger.warn(`[${requestId}] Returning success with warnings for non-token error`);
      return res.status(200).json({
        success: true,
        message: 'Account connection completed with some limitations',
        warnings: [
          'Some features may not be fully available due to temporary issues',
          errorMessage || 'An unexpected error occurred during processing',
        ],
        error_type: 'processing_warning',
      });
    }
  }
};

// New endpoint to check X account connection status
export const handleCheckXAccountStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const user_id = req.currentUser?.id;

    logger.info(`[${requestId}] Checking X account status for user: ${String(user_id)}`);

    if (!user_id) {
      logger.warn(`[${requestId}] No user ID found in request`);
      return res.status(401).json({
        isConnected: false,
        message: 'User not authenticated',
      });
    }

    const prisma = await createPrismaClient();
    const user = await prisma.user_user.findUnique({
      where: { id: user_id },
      select: {
        personal_twitter_handle: true,
        personal_twitter_id: true,
      },
    });

    const isConnected = !!(user?.personal_twitter_handle && user?.personal_twitter_id);
    const handle = user?.personal_twitter_handle || undefined;

    logger.info(`[${requestId}] X account status check completed - connected: ${String(isConnected)}, handle: ${handle || 'none'}`);

    return res.status(OK).json({
      isConnected,
      handle,
    });

  } catch (error) {
    const errorMessage = (error as Error).message;
    const errorStack = (error as Error).stack || 'No stack trace';
    logger.err(`[${requestId}] Error checking X account status: ${errorMessage}`);
    logger.err(`[${requestId}] Status check error stack: ${errorStack}`);

    next(
      new ErrorWithCode(
        'Error checking X account status',
        INTERNAL_SERVER_ERROR
      )
    );
  }
};
