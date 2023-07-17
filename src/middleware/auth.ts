import { UnauthorizeError } from "@shared/errors";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import signingService from "@services/signing-service";
import hederaService from "@services/hedera-service";
import { AccountId } from "@hashgraph/sdk";

const authTokenNotPresentErr = "Authentication token not found.";
const authTokenInvalidError = "Authentication token is invalid.";
const accessSecret = process.env.J_ACCESS_TOKEN_SECRET ?? "";

const extractToken = (authStr: string, type: "token1" | "token2" | "aSToken"): string => {
  let token = "";
  const authStrArr = authStr.split(",");
  switch (type) {
    case "token1":
      token = authStrArr[0].trim().substring(6);
      break;
    case "token2":
      token = authStrArr[1] && authStrArr[1].length > 6 ? authStrArr[1].trim().substring(6) : "";
      break;
    case "aSToken":
      token = authStrArr[0].trim().substring(7);
      break;
    default:
      token = "";
      break;
  }

  return token;
};

const getBarerToken = (req: Request, type: "token1" | "token2" | "aSToken") => {
  // Get header token
  const bearerHeader = req.headers["authorization"];

  if (!bearerHeader) {
    throw new UnauthorizeError(authTokenNotPresentErr);
  }

  // const bearer = bearerHeader.split(" ");
  return extractToken(bearerHeader, type);
};

const isHavingValidAst = (req: Request, _: Response, next: NextFunction) => {
  try {
    const barerToken = getBarerToken(req, "aSToken");
    jwt.verify(barerToken, accessSecret, (err, payload) => {
      if (err) {
        throw new UnauthorizeError("Invalid ast");
      }

      if (payload) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { ts, accountId, signature } = payload as any;
        const timeStampDiffCheck = new Date().getTime() - parseInt(ts as string) <= 24 * 60 * 60 * 1000;
        const validSignature = signingService.verifyData(
          { ts, accountId },
          hederaService.operatorKey.publicKey.toStringDer(),
          Buffer.from(signature as string, "utf-8")
        );
        if (timeStampDiffCheck && validSignature) {
          req.accountAddress = AccountId.fromString(accountId as string).toSolidityAddress();
          next();
        } else throw new UnauthorizeError("Signature not verified");
      } else throw new UnauthorizeError("Invalid data. Please try again.");
    });
  } catch (err) {
    next(err);
  }
};

const isHavingValidAuthToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    // const bearer = bearerHeader.split(" ");
    const bearerToken = getBarerToken(req, "token1");

    jwt.verify(bearerToken, accessSecret, (err, payload) => {
      if (err) {
        throw new UnauthorizeError(authTokenInvalidError);
      }
      (async () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const username: string = payload.username;
        // get data in reference of auth token
        const clientData = await prisma.user_user.findUnique({
          where: { username },
          select: {
            id: true,
            hedera_wallet_id: true,
            available_budget: true,
            username: true,
            name: true,
            email: true,
            last_login: true,
            salt: true,
            hash: true,
            role: true,
            profile_image_url: true,
            twitter_access_token: true,
            twitter_access_token_secret: true,
            personal_twitter_handle: true,
            business_twitter_access_token: true,
            business_twitter_access_token_secret: true,
            business_twitter_handle: true,
            consent: true,
          },
        });
        if (clientData) req.currentUser = clientData;
        next();
      })();
    });
  } catch (err) {
    next(err);
    // res.status(UNAUTHORIZED).json({
    //   error: err.message,
    // });
  }
};

const isAdminRequesting = (req: Request, res: Response, next: NextFunction) => {
  try {
    const bearerToken = getBarerToken(req, "token2");

    jwt.verify(bearerToken, accessSecret, (err, payload) => {
      if (err) {
        throw new UnauthorizeError(authTokenInvalidError + "-A-");
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore;
      const userRole: string = payload.role;
      const roleCheck = ["SUPER_ADMIN", "ADMIN"].includes(userRole);
      if (roleCheck) next();
      else throw new UnauthorizeError("Don't have necessary access for this routes");
    });
  } catch (err) {
    next(err);
  }
};

const havingValidPayloadToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body.payload.token as string;
    jwt.verify(token, accessSecret, (err, payload) => {
      if (err) {
        throw new UnauthorizeError("Invalid data. Please try again.");
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      const ts = payload?.ts as string;
      const currentTimeStamp = new Date().getTime();
      if (currentTimeStamp - parseInt(ts) <= 30 * 1000) next();
      else throw new UnauthorizeError("Invalid data. Please try again.");
    });
  } catch (err) {
    next(err);
  }
};

export default {
  isHavingValidAuthToken,
  isAdminRequesting,
  havingValidPayloadToken,
  isHavingValidAst,
} as const;
