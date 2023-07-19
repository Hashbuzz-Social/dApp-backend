import { UnauthorizeError } from "@shared/errors";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import signingService from "@services/signing-service";
import hederaService from "@services/hedera-service";
import { AccountId } from "@hashgraph/sdk";
import { base64ToUint8Array } from "@shared/helper";

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

const isHavingValidAst = (req: Request, _: Response, next: NextFunction) => {
  try {
    const barerToken = getBarerToken(req);
    jwt.verify(barerToken, accessSecret, (err, payload) => {
      if (err) {
        throw new UnauthorizeError("Invalid ast");
      }

      if (payload) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { ts, accountId, signature } = payload as any;
        const timeStampDiffCheck = new Date().getTime() - ts <= 24 * 60 * 60 * 1000;
        const validSignature = signingService.verifyData({ ts, accountId }, hederaService.operatorPublicKey!, base64ToUint8Array(signature as string));
       
        if (timeStampDiffCheck && validSignature) {
          const accountAddress =  AccountId.fromString(accountId as string).toSolidityAddress();
          console.log(accountAddress);
          req.accountAddress = accountAddress;
          next();
        } else throw new UnauthorizeError("Signature not verified");
      } else throw new UnauthorizeError("Invalid data. Please try again.");
    });
  } catch (err) {
    next(err);
  }
};

// const isHavingValidAuthToken = (req: Request, res: Response, next: NextFunction) => {
//   try {
//     // const bearer = bearerHeader.split(" ");
//     const bearerToken = getBarerToken(req, "token1");

//     jwt.verify(bearerToken, accessSecret, (err, payload) => {
//       if (err) {
//         throw new UnauthorizeError(authTokenInvalidError);
//       }
//       (async () => {
//         // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//         //@ts-ignore
//         const username: string = payload.username;
//         // get data in reference of auth token
//         const clientData = await prisma.user_user.findUnique({
//           where: { username },
//           select: {
//             id: true,
//             hedera_wallet_id: true,
//             available_budget: true,
//             name: true,
//             last_login: true,
//             salt: true,
//             hash: true,
//             role: true,
//             profile_image_url: true,
//             twitter_access_token: true,
//             twitter_access_token_secret: true,
//             personal_twitter_handle: true,
//             business_twitter_access_token: true,
//             business_twitter_access_token_secret: true,
//             business_twitter_handle: true,
//             consent: true,
//           },
//         });
//         if (clientData) req.currentUser = clientData;
//         next();
//       })();
//     });
//   } catch (err) {
//     next(err);
//     // res.status(UNAUTHORIZED).json({
//     //   error: err.message,
//     // });
//   }
// };

// const isAdminRequesting = (req: Request, res: Response, next: NextFunction) => {
//   try {
//     const bearerToken = getBarerToken(req, "token2");

//     jwt.verify(bearerToken, accessSecret, (err, payload) => {
//       if (err) {
//         throw new UnauthorizeError(authTokenInvalidError + "-A-");
//       }
//       // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//       //@ts-ignore;
//       const userRole: string = payload.role;
//       const roleCheck = ["SUPER_ADMIN", "ADMIN"].includes(userRole);
//       if (roleCheck) next();
//       else throw new UnauthorizeError("Don't have necessary access for this routes");
//     });
//   } catch (err) {
//     next(err);
//   }
// };

const havingValidPayloadToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body.payload.data.token as string;
    jwt.verify(token, accessSecret, (err, payload) => {
      if (err) {
        throw new UnauthorizeError("Invalid data. Please try again. 1");
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      const ts = payload?.ts as string;
      const currentTimeStamp = new Date().getTime();
      if (currentTimeStamp - parseInt(ts) <= 30 * 1000) next();
      else throw new UnauthorizeError("Invalid data. Please try again. 2");
    });
  } catch (err) {
    next(err);
  }
};

export default {
  // isHavingValidAuthToken,
  // isAdminRequesting,
  havingValidPayloadToken,
  isHavingValidAst,
} as const;
