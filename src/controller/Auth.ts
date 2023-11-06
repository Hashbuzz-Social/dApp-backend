import { AccountId } from "@hashgraph/sdk";
import { createAstToken, generateAdminToken, generateSigningToken } from "@services/authToken-service";
import hederaservice from "@services/hedera-service";
import passwordService from "@services/password-service";
import signingService from "@services/signing-service";
import { ErrorWithCode } from "@shared/errors";
import { base64ToUint8Array, fetchAccountIfoKey, sensitizeUserData } from "@shared/helper";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import HttpStatusCodes from "http-status-codes";
import JSONBigInt from "json-bigint";

const { OK, BAD_REQUEST, INTERNAL_SERVER_ERROR } = HttpStatusCodes;

/**
 * @description Update last login status for exiting user.
 * If no record in DB for this user then create a DB record for this user;
 */
export const handleAuthPing = async (req: Request, res: Response) => {
  if (req?.accountAddress) {
    const accountId = AccountId.fromSolidityAddress(req?.accountAddress).toString();

    //? Update login state or upsert the record.
    // (async () => {
    const create = {
      accountAddress: req.accountAddress!,
      hedera_wallet_id: accountId,
      available_budget: 0,
      is_active: false,
    };
    if (accountId === hederaservice.operatorId.toString()) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-expect-error
      create["role"] = "SUPER_ADMIN";
    }
    await prisma.user_user.upsert({
      where: { accountAddress: req.accountAddress },
      update: {
        last_login: new Date().toISOString(),
      },
      create,
    });
    // })();
    return res.status(OK).json({ hedera_wallet_id: accountId });
  } else {
    return res.status(BAD_REQUEST).json({ message: "No address found" });
  }
};

export const handleCreateChallenge = (req: Request, res: Response, next: NextFunction) => {
  const params = req.query;
  // console.log(param);
  // try {
  const payload = { url: params.url ?? "hashbuzz.social", data: { token: generateSigningToken() } };
  const { signature, serverSigningAccount } = signingService.signData(payload);
  return res.status(OK).json({ payload, server: { signature: Buffer.from(signature).toString("base64"), account: serverSigningAccount } });
  // } catch (err) {
  //   next(err);
  // }
};

export const handleGenerateAuthAst = async (req: Request, res: Response, next: NextFunction) => {
  // try {
  //   (async () => {
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
    await prisma.authtoken_token.upsert({
      where: { accountAddress },
      update: {
        expiry,
        key: token,
      },
      create: {
        accountAddress,
        expiry,
        key: token,
      },
    });

    res.status(OK).json({ message: "Login Successfully", auth: true, ast: token });
  } else {
    //! not verified by the signature throw an invalid signature error;
    res.status(BAD_REQUEST).json({ auth: false, message: "Invalid signature." });
  }
  //   })();
  // } catch (err) {
  //   next(err);
  // }
};

// export const handleTwitterBrand = (req: Request, res: Response, next: NextFunction) => {

// };

export const handleLogout = (req: Request, res: Response, next: NextFunction) => {
  prisma.authtoken_token
    .delete({ where: { accountAddress: req.currentUser?.accountAddress } })
    .then(() => {
      return res.status(OK).json({ success: true, message: "Logout Successfully" });
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

export const handleAdminLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
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
          user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(user))),
          adminToken: generateAdminToken(user),
        });
      } else next(new ErrorWithCode("Invalid Password", BAD_REQUEST));
    } else next(new ErrorWithCode("User not found as admin.", BAD_REQUEST));
  } catch (err) {
    next(new ErrorWithCode("Error while admin login processing", INTERNAL_SERVER_ERROR));
  }
};
