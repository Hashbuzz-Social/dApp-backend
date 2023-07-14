import {
  handleAdminLogin,
  handleLogout,
  handleRefreshToken,
  handleTwitterBizRegister,
  handleTwitterBrand,
  handleTwitterLogin,
  handleTwitterReturnUrl,
} from "@controller/Auth";
import auth from "@middleware/auth";
import { checkErrResponse } from "@validator/userRoutes.validator";
import { Router } from "express";
import { body } from "express-validator";
import { IsStrongPasswordOptions } from "express-validator/src/options";


const authRouter = Router();
const passwordCheck: IsStrongPasswordOptions = {
  minLength: 8,
  minNumbers: 1,
  minLowercase: 1,
  minUppercase: 1,
  minSymbols: 1,
};

/**
 * Handle Twitter login.
 *
 * @api GET /api/auth/twitter-login
 * @handler handleTwitterLogin
 */
authRouter.get("/twitter-login", handleTwitterLogin);

/**
 * Handle Twitter brand.
 *
 * @api GET /api/auth/brand-handle
 * @middleware auth.isHavingValidAuthToken
 * @validator checkErrResponse
 * @handler handleTwitterBrand
 */
authRouter.get("/brand-handle", auth.isHavingValidAuthToken, checkErrResponse, handleTwitterBrand);

/**
 * Logout user.
 *
 * @api POST /api/auth/logout
 * @middleware auth.isHavingValidAuthToken
 * @validator checkErrResponse
 * @handler handleLogout
 */
authRouter.post("/logout", auth.isHavingValidAuthToken, checkErrResponse, handleLogout);

/**
 * Refresh authentication token.
 *
 * @api POST /api/auth/refreshToken
 * @param {string} req.body.refreshToken - The refresh token.
 * @validator body("refreshToken").isString()
 * @validator checkErrResponse
 * @handler handleRefreshToken
 */
authRouter.post("/refreshToken", body("refreshToken").isString(), checkErrResponse, handleRefreshToken);

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
  body("email").isEmail(),
  body("password").isStrongPassword(passwordCheck),
  handleAdminLogin
);

export default authRouter;
