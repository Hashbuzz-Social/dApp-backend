import { AccountId } from "@hashgraph/sdk";
import hederaService from "@services/hedera-service";
import signingService from "@services/signing-service";
import { d_encrypt } from "@shared/encryption";
import { UnauthorizeError } from "@shared/errors";
import { base64ToUint8Array } from "@shared/helper";
import { verifyAccessToken } from "@shared/Verify";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const AUTH_TOKEN_NOT_PRESENT_ERR = "Authentication token not found.";
const AUTH_TOKEN_INVALID_ERR = "Authentication token is invalid.";
const SIGNATURE_NOT_VERIFIED_ERR = "Signature not verified";
const DEVICE_ID_REQUIRED_ERR = "Device Id is required";
const ACCESS_DENIED_ERR = "Don't have necessary access for this route";
const INVALID_SIGNATURE_TOKEN_ERR = "Invalid signature token";
const SIGNING_MESSAGE_EXPIRED_ERR = "Signing message is expired";
const ERROR_CHECKING_AUTH_TOKEN_ERR = "Error while checking auth token";
const ERROR_VALIDATING_PAYLOAD_TOKEN_ERR = "Error while validating payload token";
const ERROR_WHILE_FINDINF_DEVICE_ID = "Device id not found in request headers";

const accessSecret = process.env.J_ACCESS_TOKEN_SECRET ?? "";

const getBearerToken = (req: Request): string => {
  const bearerHeader = req.headers["authorization"];
  if (!bearerHeader) {
    throw new UnauthorizeError(AUTH_TOKEN_NOT_PRESENT_ERR);
  }
  const token = bearerHeader.split(" ")[1];
  if (!token) {
    throw new UnauthorizeError(AUTH_TOKEN_INVALID_ERR);
  }
  req.token = token;
  return token;
};

const getHeadersData = (req: Request) => {
  let deviceId = req.cookies.device_id ?? req.headers["x-device-id"] as string;

  if (!deviceId) {
    throw new UnauthorizeError(ERROR_WHILE_FINDINF_DEVICE_ID);
  }

  deviceId = d_encrypt(deviceId);
  const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  return { deviceId, ipAddress, userAgent };
};

const deviceIdIsRequired = (req: Request, res: Response, next: NextFunction) => {
  console.log(" deviceIdIsRequired starts");
  const { deviceId, ipAddress, userAgent } = getHeadersData(req);
  if (!deviceId) {
    return next(new UnauthorizeError(DEVICE_ID_REQUIRED_ERR));
  }
  req.deviceId = deviceId;
  req.ipAddress = ipAddress;
  req.userAgent = userAgent;
  console.log("Device Id deviceIdIsRequired is passes", deviceId);
  return next();
};

const isHavingValidAst = async (req: Request, res: Response, next: NextFunction) => {
  console.log(" isHavingValidAst starts");
  const bearerToken = getBearerToken(req);

  try {
    const { payload } = verifyAccessToken(bearerToken);
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
      const { deviceId, userAgent, ipAddress } = getHeadersData(req);
      req.deviceId = deviceId;
      req.ipAddress = ipAddress;
      req.userAgent = userAgent;
    }

    const accountAddress = AccountId.fromString(accountId).toSolidityAddress();
    req.accountAddress = accountAddress;
    req.userId = +id;

    console.log(" isHavingValidAst ends width", { accountAddress, userid: id });

    return next();
  } catch (err) {
    console.error(err);
    return next(new UnauthorizeError(ERROR_CHECKING_AUTH_TOKEN_ERR));
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
    return next(err);
  }
};

const havingValidPayloadToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body.payload.data.token as string;
    jwt.verify(token, accessSecret, (err, payload) => {
      if (err) {
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
    return next(new UnauthorizeError(ERROR_VALIDATING_PAYLOAD_TOKEN_ERR));
  }
};

export default {
  isAdminRequesting,
  havingValidPayloadToken,
  isHavingValidAst,
  deviceIdIsRequired,
} as const;