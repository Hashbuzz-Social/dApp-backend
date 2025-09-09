import {
  handleAdminLogin,
  handleAuthPing,
  handleCreateChallenge,
  handleGenerateAuthAst,
  handleLogout,
  handleRefreshToken,
} from '@controller/Auth';
import {
  handleTwitterBizRegister,
  handleTwitterReturnUrl,
} from '@controller/Integrations';
import auth from '@middleware/auth';
import userInfo from '@middleware/userInfo';
import { asyncHandler } from '@shared/asyncHandler';
import {
  checkErrResponse,
  validateGenerateAstPayload,
} from '@validator/userRoutes.validator';
import { Router } from 'express';
import { IsStrongPasswordOptions } from 'express-validator/src/options';

import { body } from 'express-validator';

const passwordCheck: IsStrongPasswordOptions = {
  minLength: 8,
  minNumbers: 1,
  minLowercase: 1,
  minUppercase: 1,
  minSymbols: 1,
};

const router = Router();

router.post(
  '/logout',
  asyncHandler(auth.isHavingValidAst),
  checkErrResponse,
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(handleLogout)
);

router.post(
  '/refresh-token',
  asyncHandler(auth.isHavingValidAst),
  body('refreshToken').isString(),
  checkErrResponse,
  asyncHandler(handleRefreshToken)
);

router.get('/twitter-return', asyncHandler(handleTwitterReturnUrl));

router.get('/business-twitter-return', asyncHandler(handleTwitterBizRegister));

router.post(
  '/admin-login',
  asyncHandler(auth.isHavingValidAst),
  asyncHandler(auth.isAdminRequesting),
  asyncHandler(userInfo.getCurrentUserInfo),
  body('password').isStrongPassword(passwordCheck),
  asyncHandler(handleAdminLogin)
);

router.get(
  '/ping',
  asyncHandler(auth.isHavingValidAst),
  asyncHandler(handleAuthPing)
);
router.get('/challenge', asyncHandler(handleCreateChallenge));
router.post(
  '/generate',
  asyncHandler(auth.havingValidPayloadToken),
  body().custom(validateGenerateAstPayload),
  checkErrResponse,
  asyncHandler(handleGenerateAuthAst)
);

export default router;
