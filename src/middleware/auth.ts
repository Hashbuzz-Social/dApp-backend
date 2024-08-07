import { AccountId } from "@hashgraph/sdk";
import hederaService from "@services/hedera-service";
import signingService from "@services/signing-service";
import { ErrorWithCode, UnauthorizeError } from "@shared/errors";
import { base64ToUint8Array } from "@shared/helper";
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

const extractDeviceId = (req: Request): string | undefined => {
  return (req.cookies.device_id ?? req.headers['x-device-id']) as string;
};

const isHavingValidAst = (req: Request, res: Response, next: NextFunction) => {
  try {
    const bearerToken = getBearerToken(req);
    jwt.verify(bearerToken, accessSecret, (err, payload) => {
      if (err) {
        return next(new UnauthorizeError(authTokenInvalidError));
      }

      if (payload) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { ts, accountId, signature } = payload as any;
        const timeStampDiffCheck = new Date().getTime() - ts <= 24 * 60 * 60 * 1000;
        const validSignature = signingService.verifyData(
          { ts, accountId },
          hederaService.operatorPublicKey!,
          base64ToUint8Array(signature as string)
        );

        if (timeStampDiffCheck && validSignature) {
          const accountAddress = AccountId.fromString(accountId as string).toSolidityAddress();
          req.accountAddress = accountAddress;
          req.deviceId = extractDeviceId(req);
          return next();
        } else {
          return next(new UnauthorizeError("Signature not verified"));
        }
      } else {
        return next(new UnauthorizeError(authTokenInvalidError));
      }
    });
  } catch (err) {
    return next(new ErrorWithCode("Error while checking auth token", BAD_REQUEST));
  }
};

const isAdminRequesting = (req: Request, res: Response, next: NextFunction) => {
  try {
    const accountAddress = req.accountAddress;
    const adminAccount = process.env.ADMIN_ADDRESS;
    if (!accountAddress || !adminAccount) {
      throw new UnauthorizeError("Don't have necessary access for this route");
    }
    const accountId = AccountId.fromSolidityAddress(accountAddress).toString();
    if (accountId === adminAccount) {
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
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      const ts = payload?.ts as string;
      const currentTimeStamp = new Date().getTime();
      if (currentTimeStamp - parseInt(ts) <= 30 * 1000) {
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
} as const;
