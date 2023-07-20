import { AccountId } from "@hashgraph/sdk";
import { createAstToken, generateSigningToken } from "@services/authToken-service";
import hederaservice from "@services/hedera-service";
import signingService from "@services/signing-service";
import { base64ToUint8Array, fetchAccountIfoKey } from "@shared/helper";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import HttpStatusCodes from "http-status-codes";

const { OK, BAD_REQUEST } = HttpStatusCodes;

/**
 * @description Update last login status for exiting user.
 * If no record in DB for this user then create a DB record for this user;
 */
export const handleAuthPing = (req: Request, res: Response) => {
  if (req?.accountAddress) {
    const accountId = AccountId.fromSolidityAddress(req?.accountAddress).toString();

    //? Update login state or upsert the record.
    (async () => {
      await prisma.user_user.upsert({
        where: { accountAddress: req.accountAddress },
        update: {
          last_login: new Date().toISOString(),
        },
        create: {
          accountAddress: req.accountAddress!,
          hedera_wallet_id: accountId,
          available_budget: 0,
          is_active: false,
        },
      });
    })();
    return res.status(OK).json({ hedera_wallet_id: accountId });
  } else {
    return res.status(BAD_REQUEST).json({ message: "No address found" });
  }
};

export const handleCreateChallenge = (req: Request, res: Response, next: NextFunction) => {
  const params = req.query;
  // console.log(param);
  try {
    const payload = { url: params.url ?? "hashbuzz.social", data: { token: generateSigningToken() } };
    const { signature, serverSigningAccount } = signingService.signData(payload);
    return res.status(OK).json({ payload, server: { signature: Buffer.from(signature).toString("base64"), account: serverSigningAccount } });
  } catch (err) {
    next(err);
  }
};

export const handleGenerateAuthAst = (req: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const data = req.body;
      const {
        payload,
        clientPayload,
        signatures: {
          server,
          wallet: { value, accountId },
        },
      } = data;

      const clientAccountPublicKey = await fetchAccountIfoKey(accountId as string);
      // check verification status
      const server_sig_verification = signingService.verifyData(
        payload as object,
        hederaservice.operatorKey.publicKey.toStringRaw(),
        base64ToUint8Array(server as string)
      );
      const client_sig_verification = signingService.verifyData(clientPayload as object, clientAccountPublicKey, base64ToUint8Array(value as string));

      if (server_sig_verification && client_sig_verification) {
        //? if verified send a ast token to the client
        const ts = new Date().getTime();
        const { signature } = signingService.signData({ ts, accountId });
        const token = createAstToken({ ts, accountId, signature: Buffer.from(signature).toString("base64") });

        const expiry = new Date(ts + 24 * 60 * 60 * 1000).toISOString();
        const accountAddress = AccountId.fromString(accountId as string).toSolidityAddress();

        //saving temp auth token
        await prisma.authtoken_token.create({
          data: {
            accountAddress,
            expiry,
            key: token,
          },
        });

        res.status(OK).json({ auth: true, ast: token });
      } else {
        //! not verified by the signature throw an invalid signature error;
        res.status(BAD_REQUEST).json({ auth: false, message: "Invalid signature." });
      }
    })();
  } catch (err) {
    next(err);
  }
};

// export const handleTwitterBrand = (req: Request, res: Response, next: NextFunction) => {

// };

export const handleLogout = (req: Request, res: Response, next: NextFunction) => {
  prisma.authtoken_token
    .delete({ where: { accountAddress: req.currentUser?.accountAddress } })
    .then(() => {
      return res.status(OK).json({ success: true, message: "Logout successfully." });
    })
    .catch((err) => {
      next(err);
    });
};

// export const handleRefreshToken = (req: Request, res: Response, next: NextFunction) => {
//   try {
//     (async () => {
//       const refreshToken = req.body.refreshToken as string;
//       const tokenDetails = await prisma.authtoken_token.findUnique({ where: { key: refreshToken }, include: { user_user: true } });
//       if (!tokenDetails) {
//         throw new Error("Refresh token is invalid. Do login again");
//       }
//       const { user_user } = tokenDetails;
//       const newRefreshToken = await generateRefreshToken(user_user);
//       const token = generateAccessToken(user_user);
//       const data = {
//         users: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(user_user))),
//         token,
//         refreshToken: newRefreshToken,
//       };
//       return res.status(OK).json(data);
//     })();
//   } catch (err) {
//     next(err);
//   }
// };

// export const handleAdminLogin = (req: Request, res: Response, next: NextFunction) => {
//   (async () => {
//     try {
//       const { email, password }: { email: string; password: string } = req.body;
//       const user = await prisma.user_user.findMany({
//         where: {
//           email,
//           role: {
//             in: ["ADMIN", "SUPER_ADMIN"],
//           },
//         },
//       });

//       if (!user || isEmpty(user)) {
//         throw new UserNotFoundError();
//       }

//       const _user = user[0];
//       const { id } = _user;
//       const { salt, hash } = passwordService.createPassword(password);
//       const updatedUser = await prisma.user_user.update({
//         where: { id },
//         data: { salt, hash },
//       });
//       const adminToken = generateAdminToken(updatedUser);

//       return res.status(OK).json({
//         message: "Logged in successfully.",
//         user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))),
//         adminToken,
//       });
//     } catch (err) {
//       next(err);
//     }
//   })();
// };
