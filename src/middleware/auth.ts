import { getConfig } from '@appConfig';
import { AccountId } from '@hashgraph/sdk';
import initHederaService from '@services/hedera-service';
import signingService from '@services/signing-service';
import { d_encrypt } from '@shared/encryption';
import { UnauthorizeError } from '@shared/errors';
import { base64ToUint8Array } from '@shared/helper';
import { verifyAccessToken } from '@shared/Verify';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

enum AuthError {
  AUTH_TOKEN_NOT_PRESENT = 'AUTH_TOKEN_NOT_PRESENT',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  SIGNATURE_NOT_VERIFIED = 'SIGNATURE_NOT_VERIFIED',
  DEVICE_ID_REQUIRED = 'DEVICE_ID_REQUIRED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  INVALID_SIGNATURE_TOKEN = 'INVALID_SIGNATURE_TOKEN',
  SIGNING_MESSAGE_EXPIRED = 'SIGNING_MESSAGE_EXPIRED',
  ERROR_WHILE_FINDING_DEVICE_ID = 'ERROR_WHILE_FINDING_DEVICE_ID',
}

const getAuthToken = (req: Request): string => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    req.token = token;
    return token;
  }
  const cookieToken = req.cookies?.access_token;
  if (cookieToken) {
    req.token = cookieToken;
    return cookieToken;
  }
  
  throw new UnauthorizeError(AuthError.AUTH_TOKEN_NOT_PRESENT);
};

const getHeadersData = async (req: Request) => {
  const config = await getConfig();
  
  let deviceId =
    req.cookies.device_id ?? (req.headers['x-device-id'] as string);
  if (!deviceId)
    throw new UnauthorizeError(AuthError.ERROR_WHILE_FINDING_DEVICE_ID);
  deviceId = d_encrypt(deviceId, config.encryptions.encryptionKey);
  return {
    deviceId,
    ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
};

const deviceIdIsRequired = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { deviceId, ipAddress, userAgent } = await getHeadersData(req);
    req.deviceId = deviceId;
    req.ipAddress = ipAddress;
    req.userAgent = userAgent;
    next();
  } catch (error) {
    if (!(error instanceof UnauthorizeError)) {
      next(new UnauthorizeError(AuthError.ERROR_WHILE_FINDING_DEVICE_ID));
    } else {
      next(error);
    }
  }
};

const isHavingValidAst = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const bearerToken = getAuthToken(req);
    const hederaService = await initHederaService();
    const { payload } = await verifyAccessToken(bearerToken);
    const { id, ts, accountId, signature } = payload;

    const validSignature = signingService.verifyData(
      { ts, accountId },
      hederaService.operatorPublicKey!,
      base64ToUint8Array(signature)
    );
    if (!validSignature)
      return next(new UnauthorizeError(AuthError.SIGNATURE_NOT_VERIFIED));

    if (!req.deviceId) {
      const { deviceId, userAgent, ipAddress } = await getHeadersData(req);
      req.deviceId = deviceId;
      req.ipAddress = ipAddress;
      req.userAgent = userAgent;
    }

    req.accountAddress = AccountId.fromString(accountId).toSolidityAddress();
    req.userId = +id;
    next();
  } catch (err) {
    console.error(err);
    // Only call next with a generic error if one hasn't already been thrown
    if (!(err instanceof UnauthorizeError)) {
      next(new UnauthorizeError(AuthError.AUTH_TOKEN_INVALID));
    } else {
      next(err);
    }
  }
};

const isAdminRequesting = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (
      req.accountAddress &&
      globalThis.adminAddress.includes(req.accountAddress)
    ) {
      return next();
    }
    throw new UnauthorizeError(AuthError.ACCESS_DENIED);
  } catch (error) {
    console.error(error);
    if (!(error instanceof UnauthorizeError)) {
      return next(new UnauthorizeError(AuthError.AUTH_TOKEN_INVALID));
    }
    return next(error);
  }
};

const havingValidPayloadToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.body.payload?.data?.token as string;
    if (!token) throw new UnauthorizeError(AuthError.INVALID_SIGNATURE_TOKEN);

    const appConfig = await getConfig();
    jwt.verify(
      token,
      appConfig.encryptions.jwtSecretForAccessToken,
      (err, payload) => {
        if (err) {
          console.error('JWT verification error:', err);
          return next(new UnauthorizeError(AuthError.INVALID_SIGNATURE_TOKEN));
        }
        const ts = (payload as { ts: number }).ts;
        if (Date.now() - ts <= 30_000) return next();
        return next(new UnauthorizeError(AuthError.SIGNING_MESSAGE_EXPIRED));
      }
    );
  } catch (err) {
    console.error(err);
    if (!(err instanceof UnauthorizeError)) {
      return next(new UnauthorizeError(AuthError.AUTH_TOKEN_INVALID));
    }
    return next(err);
  }
};

export default {
  isAdminRequesting,
  havingValidPayloadToken,
  isHavingValidAst,
  deviceIdIsRequired,
} as const;
