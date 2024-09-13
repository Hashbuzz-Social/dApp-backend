import { handleAdminLogin, handleAuthPing, handleCreateChallenge, handleGenerateAuthAst, handleLogout, handleRefreshToken } from "@controller/Auth";
import { handleTwitterBizRegister, handleTwitterReturnUrl } from "@controller/Integrations";
import auth from "@middleware/auth";
import userInfo from "@middleware/userInfo";
import { checkErrResponse, validateGenerateAstPayload } from "@validator/userRoutes.validator";
import { Router } from "express";
import { IsStrongPasswordOptions } from "express-validator/src/options";

import { body } from "express-validator";

const passwordCheck: IsStrongPasswordOptions = {
  minLength: 8,
  minNumbers: 1,
  minLowercase: 1,
  minUppercase: 1,
  minSymbols: 1,
};

const router = Router();

router.post("/logout", auth.isHavingValidAst, checkErrResponse, userInfo.getCurrentUserInfo, handleLogout);

router.post("/refresh-token", auth.isHavingValidAst, body("refreshToken").isString(), checkErrResponse, handleRefreshToken);

router.get("/twitter-return", handleTwitterReturnUrl);

router.get("/business-twitter-return", handleTwitterBizRegister);

router.post("/admin-login", auth.isHavingValidAst, auth.isAdminRequesting, userInfo.getCurrentUserInfo, body("password").isStrongPassword(passwordCheck), handleAdminLogin);

router.get("/ping", auth.isHavingValidAst, handleAuthPing);
router.get("/challenge", handleCreateChallenge);
router.post("/generate", auth.havingValidPayloadToken, body().custom(validateGenerateAstPayload), checkErrResponse, handleGenerateAuthAst);

export default router;
