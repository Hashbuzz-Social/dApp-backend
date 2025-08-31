import { getConfig } from '@appConfig';
import {
  generateAdminToken,
  generateSigningToken,
} from '@services/authToken-service';
import passwordService from '@services/password-service';
import SessionManager from '@services/SessionManager';
import signingService from '@services/signing-service';
import userService from '@services/user-service';
import { ErrorWithCode } from '@shared/errors';
import { sensitizeUserData } from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import { NextFunction, Request, Response } from 'express';
import HttpStatusCodes from 'http-status-codes';
import JSONBigInt from 'json-bigint';

const { OK, BAD_REQUEST, INTERNAL_SERVER_ERROR } = HttpStatusCodes;

/**
 * @description Update last login status for exiting user.
 * If no record in DB for this user then create a DB record for this user;
 */
export const handleAuthPing = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sessionManager = await SessionManager.create();
  return sessionManager.checkSessionForPing(req, res, next);
};

export const handleCreateChallenge = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const params = req.query;
  const config = await getConfig();
  const payload = {
    url: params.url ?? 'hashbuzz.social',
    data: {
      token: generateSigningToken(config.encryptions.jwtSecretForAccessToken),
    },
  };
  const { signature, serverSigningAccount } = await signingService.signData(
    payload
  );
  const isExistingUser = await userService.findUserByWalletId(
    params?.walletId as string
  );
  return res
    .status(OK)
    .json({
      payload,
      server: {
        signature: Buffer.from(signature).toString('base64'),
        account: serverSigningAccount,
      },
      isExistingUser: !!isExistingUser,
      connectedXAccount: isExistingUser?.personal_twitter_handle,
    });
};

export const handleGenerateAuthAst = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sessionManager = await SessionManager.create();
  return sessionManager.handleGenerateAuthAst(req, res, next);
};

export const handleGenerateAuthAstv2 = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sessionManager = await SessionManager.create();
  return sessionManager.handleGenerateAuthAstv2(req, res, next);
};

export const handleLogout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sessionManager = await SessionManager.create();
  return sessionManager.handleLogout(req, res, next);
};

export const handleRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sessionManager = await SessionManager.create();
  return sessionManager.handleRefreshToken(req, res, next);
};

export const handleAdminLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const prisma = await createPrismaClient();
    const config = await getConfig();
    const { password }: { password: string } = req.body;

    const user = await prisma.user_user.findUnique({
      where: {
        id: req.currentUser?.id,
      },
    });

    if (user && user.salt && user.hash) {
      const validatePassword = passwordService.validPassword(
        password,
        user.salt,
        user.hash
      );
      if (validatePassword) {
        return res.status(OK).json({
          message: 'Logged in successfully.',
          user: JSONBigInt.parse(
            JSONBigInt.stringify(await sensitizeUserData(user))
          ),
          adminToken: generateAdminToken(
            user,
            config.encryptions.encryptionKey
          ),
        });
      } else next(new ErrorWithCode('Invalid Password', BAD_REQUEST));
    } else next(new ErrorWithCode('User not found as admin.', BAD_REQUEST));
  } catch (err) {
    next(
      new ErrorWithCode(
        'Error while admin login processing',
        INTERNAL_SERVER_ERROR
      )
    );
  }
};
