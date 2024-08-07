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

const getBarerToken = (req: Request) => {
  // Get header token
  const bearerHeader = req.headers["authorization"];

  if (!bearerHeader) {
    throw new UnauthorizeError(authTokenNotPresentErr);
  }

  // const bearer = bearerHeader.split(" ");
  return bearerHeader.split(" ")[1];
};

const extractDeviceId = (req: Request): string | undefined => {
  // Assuming device ID is sent in headers
  console.log("Cookies" , req.cookies);
  console.log("header" , req.headers);
  console.log("header" , req.headers["x-device-id"]);
  return (req.cookies.device_id ?? req.headers['x-device-id'] ) as string;
};

const isHavingValidAst = (req: Request, _: Response, next: NextFunction) => {
  try {
    const barerToken = getBarerToken(req);
    jwt.verify(barerToken, accessSecret, (err, payload) => {
      if (err) {
        next(new UnauthorizeError("Error from verification::" + authTokenInvalidError));
      }

      if (payload) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { ts, accountId, signature } = payload as any;
        const timeStampDiffCheck = new Date().getTime() - ts <= 24 * 60 * 60 * 1000;
        const validSignature = signingService.verifyData({ ts, accountId }, hederaService.operatorPublicKey!, base64ToUint8Array(signature as string));

        if (timeStampDiffCheck && validSignature) {
          const accountAddress = AccountId.fromString(accountId as string).toSolidityAddress();
          req.accountAddress = accountAddress;
          req.deviceId = extractDeviceId(req);;
          next();
        } else next(new UnauthorizeError("Signature not verified"));
      } else next(new UnauthorizeError("Error from payload check::" + authTokenInvalidError));
    });
  } catch (err) {
    next(new ErrorWithCode("Error while checking auth token", BAD_REQUEST));
  }
};

const isAdminRequesting = (req: Request, res: Response, next: NextFunction) => {
  try {
    const accountAddress = req.accountAddress;
    const adminAccount = process.env.ADMIN_ADDRESS;
    if (accountAddress && adminAccount) {
      const accountId = AccountId.fromSolidityAddress(accountAddress).toString();
      if (accountId === adminAccount) next();
      else throw new UnauthorizeError("Don't have necessary access for this routes");
    }
  } catch (err) {
    next(err);
  }
};

const havingValidPayloadToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body.payload.data.token as string;
    jwt.verify(token, accessSecret, (err, payload) => {
      if (err) {
        throw new UnauthorizeError("Invalid signature token");
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      const ts = payload?.ts as string;
      const currentTimeStamp = new Date().getTime();
      if (currentTimeStamp - parseInt(ts) <= 30 * 1000) next();
      else throw new UnauthorizeError("Signing message is expired.");
    });
  } catch (err) {
    next(err);
  }
};

export default {
  isAdminRequesting,
  havingValidPayloadToken,
  isHavingValidAst,
} as const;
