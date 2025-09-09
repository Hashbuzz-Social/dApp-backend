import {
  handleAdminLogin,
  handleAuthPing,
  handleCreateChallenge,
  handleGenerateAuthAst,
  handleGenerateAuthAstv2,
  handleLogout,
  handleRefreshToken,
} from '@controller/Auth';
import {
  handleTwitterBizRegister,
  handleTwitterReturnUrl,
} from '@controller/Integrations';
import userInfo from '@middleware/userInfo';
import auth from '@middleware/auth';
import {
  checkErrResponse,
  validateGenerateAstPayload,
  validateGenerateAstPayloadV2,
} from '@validator/userRoutes.validator';
import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { IsStrongPasswordOptions } from 'express-validator/src/options';
import asyncHandler from '@shared/asyncHandler';

const authRouter = Router();

const passwordCheck: IsStrongPasswordOptions = {
  minLength: 8,
  minNumbers: 1,
  minLowercase: 1,
  minUppercase: 1,
  minSymbols: 1,
};
// authRouter.get("/personal", handleTwitterLogin);

// authRouter.get("/brand-handle", auth.isHavingValidAst, checkErrResponse, handleTwitterBrand);

/**
 * Logout user.
 *
 * @api POST /api/auth/logout
 * @middleware auth.isHavingValidAst
 * @validator checkErrResponse
 * @handler handleLogout
 */
authRouter.post(
  '/logout',
  asyncHandler(auth.isHavingValidAst),
  checkErrResponse,
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(handleLogout)
);

/**
 * Refresh authentication token.
 *
 * @api POST /api/auth/refreshToken
 * @param {string} req.body.refreshToken - The refresh token.
 * @validator body("refreshToken").isString()
 * @validator checkErrResponse
 * @handler handleRefreshToken
 */
authRouter.post(
  '/refresh-token',
  asyncHandler(auth.isHavingValidAst),
  body('refreshToken').isString(),
  checkErrResponse,
  asyncHandler(handleRefreshToken)
);

/**
 * Handle Twitter return URL.
 *
 * @api GET /api/auth/twitter-return
 * @handler handleTwitterReturnUrl
 */
authRouter.get('/twitter-return', asyncHandler(handleTwitterReturnUrl));

/**
 * Handle Twitter business registration return URL.
 *
 * @api GET /api/auth/business-twitter-return
 * @handler handleTwitterBizRegister
 */
authRouter.get('/business-twitter-return', asyncHandler(handleTwitterBizRegister));

/**
 * Handle admin login.
 *
 * @api POST /api/auth/admin-login
 * @param {string} req.body.email - The admin's email.
 * @param {string} req.body.password - The admin's password.
 * @validator body("email").isEmail()
 * @validator body("password").isStrongPassword(passwordCheck)
 * @handler handleAdminLogin
 */
authRouter.post(
  '/admin-login',
  asyncHandler(auth.isHavingValidAst),
  asyncHandler(auth.isAdminRequesting),
  asyncHandler(userInfo.getCurrentUserInfo),
  body('password').isStrongPassword(passwordCheck),
  asyncHandler(handleAdminLogin)
);

//dAppAccessRoutes
authRouter.get('/ping', asyncHandler(auth.isHavingValidAst), asyncHandler(handleAuthPing));
authRouter.get('/challenge', asyncHandler(handleCreateChallenge));
authRouter.post(
  '/generate',
  asyncHandler(auth.deviceIdIsRequired),
  asyncHandler(auth.havingValidPayloadToken),
  body().custom(validateGenerateAstPayload),
  checkErrResponse,
  asyncHandler(handleGenerateAuthAst)
);

authRouter.post(
  '/generate-v2',
  asyncHandler(auth.deviceIdIsRequired),
  asyncHandler(auth.havingValidPayloadToken),
  body().custom(validateGenerateAstPayloadV2),
  checkErrResponse,
  asyncHandler(handleGenerateAuthAstv2)
);

authRouter.get('/csrf-token', (req:Request, res:Response) => {
  const csrfToken = req.csrfToken ? req.csrfToken() : '';
  res.cookie('XSRF-TOKEN', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ csrfToken: req.csrfToken ? req.csrfToken() : '' });
});

export default authRouter;
