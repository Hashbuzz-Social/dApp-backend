import { AccountId } from "@hashgraph/sdk";
import hederaService from "@services/hedera-service";
import signingService from "@services/signing-service";
import { encrypt } from "@shared/encryption";
import { ErrorWithCode, UnauthorizeError } from "@shared/errors";
import { base64ToUint8Array } from "@shared/helper";
import { verifyAccessToken } from "@shared/Verify";
import { NextFunction, Request, Response } from "express";
import httpStatuses from "http-status-codes";
import jwt from "jsonwebtoken";

const { BAD_REQUEST } = httpStatuses;

const authTokenNotPresentErr = "Authentication token not found.";
const authTokenInvalidError = "Authentication token is invalid.";
const accessSecret = process.env.J_ACCESS_TOKEN_SECRET ?? "";

const getBearerToken = (req: Request): string => {
  const bearerHeader = req.headers["authorization"];
  if (!bearerHeader) {
    throw new UnauthorizeError(authTokenNotPresentErr);
  }
  const token = bearerHeader.split(" ")[1];
  if (!token) {
    throw new UnauthorizeError(authTokenInvalidError);
  }
  req.token = token;
  return token;
};

const getHeadersData = (req: Request) => {
  let deviceId = (req.cookies.device_id ?? req.headers["x-device-id"]) as string;
  const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  deviceId = encrypt(deviceId);
  return { deviceId, ipAddress, userAgent };
};

const deviceIdIsRequired = (req: Request, res: Response, next: NextFunction) => {
  const { deviceId } = getHeadersData(req);
  if (!deviceId) {
    return next(new UnauthorizeError("Device Id is required"));
  }
  req.deviceId = deviceId;
  return next();
};

const isHavingValidAst = async (req: Request, res: Response, next: NextFunction) => {
  const bearerToken = getBearerToken(req);

  try {
    const { payload } = verifyAccessToken(bearerToken);
    const { ts, accountId, signature, id } = payload;

    // Verify the signature of the payload
    const validSignature = signingService.verifyData({ ts, accountId }, hederaService.operatorPublicKey!, base64ToUint8Array(signature));
    const { deviceId } = getHeadersData(req);

    if (!validSignature) {
      return next(new UnauthorizeError("Signature not verified"));
    }
    // set the data to request object
    const accountAddress = AccountId.fromString(accountId).toSolidityAddress();
    req.accountAddress = accountAddress;
    req.deviceId = deviceId;

    // move to next middleware
    return next();
  } catch (err) {
    console.error(err);
    return next(new ErrorWithCode("Error while checking auth token", BAD_REQUEST));
  }
};

const isAdminRequesting = (req: Request, res: Response, next: NextFunction) => {
  try {
    const accountAddress = req.accountAddress;
    if (accountAddress && globalThis.adminAddress.includes(accountAddress)) {
      return next();
    } else {
      throw new UnauthorizeError("Don't have necessary access for this route");
    }
  } catch (err) {
    return next(err);
  }
};

const havingValidPayloadToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body.payload.data.token as string;
    jwt.verify(token, accessSecret, (err, payload) => {
      if (err) {
        return next(new UnauthorizeError("Invalid signature token"));
      }

      const ts = (payload as { ts: number }).ts;
      const currentTimeStamp = Date.now();
      if (currentTimeStamp - ts <= 30 * 1000) {
        return next();
      } else {
        throw new UnauthorizeError("Signing message is expired.");
      }
    });
  } catch (err) {
    return next(new ErrorWithCode("Error while validating payload token", BAD_REQUEST));
  }
};

export default {
  isAdminRequesting,
  havingValidPayloadToken,
  isHavingValidAst,
  deviceIdIsRequired,
} as const;
