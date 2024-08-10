/* eslint-disable @typescript-eslint/no-misused-promises */
import { handleAdminLogin, handleAuthPing, handleCreateChallenge, handleGenerateAuthAst, handleLogout } from "@controller/Auth";
import { handleTwitterBizRegister, handleTwitterReturnUrl } from "@controller/Integrations";
import userInfo from "@middleware/userInfo";
import auth from "@middleware/auth";
import { checkErrResponse, validateGenerateAstPayload } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body } from "express-validator";
import { IsStrongPasswordOptions } from "express-validator/src/options";
import SessionManager from "@services/SessionManager";

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
authRouter.post("/logout", auth.isHavingValidAst, checkErrResponse, userInfo.getCurrentUserInfo, handleLogout);

/**
 * Refresh authentication token.
 *
 * @api POST /api/auth/refreshToken
 * @param {string} req.body.refreshToken - The refresh token.
 * @validator body("refreshToken").isString()
 * @validator checkErrResponse
 * @handler handleRefreshToken
 */
authRouter.post("/refreshToken", body("refreshToken").isString(), checkErrResponse, SessionManager.handleRefreshToken);

/**
 * Handle Twitter return URL.
 *
 * @api GET /api/auth/twitter-return
 * @handler handleTwitterReturnUrl
 */
authRouter.get("/twitter-return", handleTwitterReturnUrl);

/**
 * Handle Twitter business registration return URL.
 *
 * @api GET /api/auth/business-twitter-return
 * @handler handleTwitterBizRegister
 */
authRouter.get("/business-twitter-return", handleTwitterBizRegister);

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
  "/admin-login",
  auth.isHavingValidAst,
  auth.isAdminRequesting,
  userInfo.getCurrentUserInfo,
  body("password").isStrongPassword(passwordCheck),
  handleAdminLogin
);

//dAppAccessRoutes
authRouter.get("/ping", auth.isHavingValidAst, handleAuthPing);
authRouter.get("/challenge", handleCreateChallenge);
authRouter.post("/generate", auth.havingValidPayloadToken, body().custom(validateGenerateAstPayload), checkErrResponse, handleGenerateAuthAst);
export default authRouter;
