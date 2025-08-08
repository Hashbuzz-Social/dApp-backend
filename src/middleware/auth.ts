import { AccountId } from "@hashgraph/sdk";
import initHederaService from "@services/hedera-service";
import signingService from "@services/signing-service";
import { d_encrypt } from "@shared/encryption";
import { UnauthorizeError } from "@shared/errors";
import { base64ToUint8Array } from "@shared/helper";
import { verifyAccessToken } from "@shared/Verify";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getConfig } from "@appConfig";

const AUTH_TOKEN_NOT_PRESENT_ERR = "Authentication token not found.";
const AUTH_TOKEN_INVALID_ERR = "Authentication token is invalid.";
const SIGNATURE_NOT_VERIFIED_ERR = "Signature not verified";
const DEVICE_ID_REQUIRED_ERR = "Device Id is required";
const ACCESS_DENIED_ERR = "Don't have necessary access for this route";
const INVALID_SIGNATURE_TOKEN_ERR = "Invalid signature token";
const SIGNING_MESSAGE_EXPIRED_ERR = "Signing message is expired";
const ERROR_WHILE_FINDINF_DEVICE_ID = "Device id not found in request headers";


/**
 * Extracts auth token from Authorization header or access_token cookie.
 * @throws UnauthorizeError if no valid token is found
 */
const getAuthToken = (req: Request): string => {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts[0] === 'Bearer' && parts[1]) {
      req.token = parts[1];
      return parts[1];
    }
    throw new UnauthorizeError(AUTH_TOKEN_INVALID_ERR);
  }
  // Fallback to access_token cookie
  const cookieToken = req.cookies?.access_token;
  if (cookieToken && typeof cookieToken === 'string') {
    req.token = cookieToken;
    return cookieToken;
  }
  throw new UnauthorizeError(AUTH_TOKEN_NOT_PRESENT_ERR);
};

const getHeadersData = async (req: Request) => {
  let deviceId = req.cookies.device_id ?? (req.headers["x-device-id"] as string);
  const config = await getConfig();

  if (!deviceId) {
    throw new UnauthorizeError(ERROR_WHILE_FINDINF_DEVICE_ID);
  }

  deviceId = d_encrypt(deviceId, config.encryptions.encryptionKey);
  const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  return { deviceId, ipAddress, userAgent };
};

const deviceIdIsRequired = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log("deviceIdIsRequired starts");
    const { deviceId, ipAddress, userAgent } = await getHeadersData(req);
    if (!deviceId) {
      return next(new UnauthorizeError(DEVICE_ID_REQUIRED_ERR));
    }
    req.deviceId = deviceId;
    req.ipAddress = ipAddress;
    req.userAgent = userAgent;

    return next();
  } catch (err) {
    return next(new UnauthorizeError(AUTH_TOKEN_INVALID_ERR));
  }
};

const isHavingValidAst = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bearerToken = getAuthToken(req);
    const hederaService = await initHederaService();

    const { payload } = await verifyAccessToken(bearerToken);
    const { id, ts, accountId, signature } = payload;

    // Verify the signature of the payload
    const validSignature = signingService.verifyData(
      { ts, accountId },
      hederaService.operatorPublicKey!,
      base64ToUint8Array(signature)
    );

    if (!validSignature) {
      return next(new UnauthorizeError(SIGNATURE_NOT_VERIFIED_ERR));
    }

    if (!req.deviceId) {
      const { deviceId, userAgent, ipAddress } = await getHeadersData(req);
      req.deviceId = deviceId;
      req.ipAddress = ipAddress;
      req.userAgent = userAgent;
    }

    const accountAddress = AccountId.fromString(accountId).toSolidityAddress();
    req.accountAddress = accountAddress;
    req.userId = +id;

    return next();
  } catch (err) {
    console.error(err);
    return next(new UnauthorizeError(AUTH_TOKEN_INVALID_ERR));
  }
};

const isAdminRequesting = (req: Request, res: Response, next: NextFunction) => {
  try {
    const accountAddress = req.accountAddress;
    if (accountAddress && globalThis.adminAddress.includes(accountAddress)) {
      return next();
    } else {
      throw new UnauthorizeError(ACCESS_DENIED_ERR);
    }
  } catch (err) {
    return next(new UnauthorizeError(AUTH_TOKEN_INVALID_ERR));
  }
};

const havingValidPayloadToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body.payload.data.token as string;
    const appConfig = await getConfig();
    const accessSecret = appConfig.encryptions.jwtSecreatForAccessToken;
    jwt.verify(token, accessSecret, (err, payload) => {
      if (err) {
        console.error("JWT verification error:", err);
        return next(new UnauthorizeError(INVALID_SIGNATURE_TOKEN_ERR));
      }

      const ts = (payload as { ts: number }).ts;
      const currentTimeStamp = Date.now();
      if (currentTimeStamp - ts <= 30 * 1000) {
        return next();
      } else {
        throw new UnauthorizeError(SIGNING_MESSAGE_EXPIRED_ERR);
      }
    });
  } catch (err) {
    console.error(err);
    return next(new UnauthorizeError(AUTH_TOKEN_INVALID_ERR));
  }
};

export default {
  isAdminRequesting,
  havingValidPayloadToken,
  isHavingValidAst,
  deviceIdIsRequired,
} as const;
