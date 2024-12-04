import { generateAdminToken, generateSigningToken } from "@services/authToken-service";
import passwordService from "@services/password-service";
import SessionManager from "@services/SessionManager";
import signingService from "@services/signing-service";
import { ErrorWithCode } from "@shared/errors";
import { sensitizeUserData } from "@shared/helper";
import createPrismaClient from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import HttpStatusCodes from "http-status-codes";
import JSONBigInt from "json-bigint";
import { getConfig } from "@appConfig";

const { OK, BAD_REQUEST, INTERNAL_SERVER_ERROR } = HttpStatusCodes;

/**
 * @description Update last login status for exiting user.
 * If no record in DB for this user then create a DB record for this user;
 */
export const handleAuthPing = async (req: Request, res: Response, next: NextFunction) => {
  return SessionManager.checkSessionForPing(req, res, next);
};

export const handleCreateChallenge = async (req: Request, res: Response, next: NextFunction) => {
  const params = req.query;
  const config = await getConfig();
  const payload = { url: params.url ?? "hashbuzz.social", data: { token: generateSigningToken(config.encryptions.jwtSecreatForAccessToken) } };
  const { signature, serverSigningAccount } = await signingService.signData(payload);
  return res.status(OK).json({ payload, server: { signature: Buffer.from(signature).toString("base64"), account: serverSigningAccount } });
};

export const handleGenerateAuthAst = async (req: Request, res: Response, next: NextFunction) => {
  return SessionManager.handleGenerateAuthAst(req, res, next);
};

export const handleLogout = (req: Request, res: Response, next: NextFunction) => {
  return SessionManager.handleLogout(req, res, next);
};

export const handleRefreshToken = (req: Request, res: Response, next: NextFunction) => {
  return SessionManager.handleRefreshToken(req, res, next);
};

export const handleAdminLogin = async (req: Request, res: Response, next: NextFunction) => {
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
      const validatePassword = passwordService.validPassword(password, user.salt, user.hash);
      if (validatePassword) {
        return res.status(OK).json({
          message: "Logged in successfully.",
          user: JSONBigInt.parse(JSONBigInt.stringify(await sensitizeUserData(user))),
          adminToken: generateAdminToken(user, config.encryptions.encryptionKey),
        });
      } else next(new ErrorWithCode("Invalid Password", BAD_REQUEST));
    } else next(new ErrorWithCode("User not found as admin.", BAD_REQUEST));
  } catch (err) {
    next(new ErrorWithCode("Error while admin login processing", INTERNAL_SERVER_ERROR));
  }
};
