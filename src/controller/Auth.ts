import { AccountId } from "@hashgraph/sdk";
import { twitterAuthUrl } from "@services/auth-service";
import { createAstToken, generateSigningToken } from "@services/authToken-service";
import hederaservice from "@services/hedera-service";
import signingService from "@services/signing-service";
import { base64ToUint8Array, fetchAccountIfoKey } from "@shared/helper";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import HttpStatusCodes from "http-status-codes";

const { OK, BAD_REQUEST } = HttpStatusCodes;

export const handleAuthPing = (req: Request, res: Response) => {
  if (req?.accountAddress) {
    const accountId = AccountId.fromSolidityAddress(req?.accountAddress).toString();
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
        res.status(OK).json({ ast: createAstToken({ ts, accountId, signature: Buffer.from(signature).toString("base64") }) });
      } else {
        //! not verified by the signature throw an invalid signature error;
        res.status(BAD_REQUEST).json({ message: "Invalid signature." });
      }
    })();
  } catch (err) {
    next(err);
  }
};

export const handleTwitterLogin = (_: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const url = await twitterAuthUrl({ callbackUrl: `${process.env.TWITTER_CALLBACK_HOST!}/auth/twitter-return/` });
      return res.status(OK).json({ url });
    })();
  } catch (err) {
    next(err);
  }
};
export const handleTwitterBrand = (req: Request, res: Response, next: NextFunction) => {
  twitterAuthUrl({
    callbackUrl: `${process.env.TWITTER_CALLBACK_HOST!}/auth/business-twitter-return/`,
    isBrand: true,
    business_owner_id: req.currentUser?.id,
  })
    .then((url) => {
      return res.status(OK).json({ url });
    })
    .catch((err) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      next(err);
    });
};

export const handleLogout = (req: Request, res: Response, next: NextFunction) => {
  prisma.authtoken_token
    .delete({ where: { user_id: req.currentUser?.id } })
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

// export const handleTwitterReturnUrl = (req: Request, res: Response) => {
//   (async () => {
//     try {
//       // Extract tokens from query string
//       const oauth_token = req.query.oauth_token as any as string;
//       const oauth_verifier = req.query.oauth_verifier as any as string;

//       //get the twitter users that are whitelisted
//       const wl_users = process.env.TWITTER_ADMIN_USERNAMES?.split(" ")?.map((u) => u.trim());
//       // Obtain the persistent tokens
//       // Create a client from temporary tokens
//       const { loginResult } = await authLogin({ oauth_token, oauth_verifier });
//       const { client: loggedClient, accessToken, accessSecret } = loginResult;
//       const meUser = await loggedClient.v2.me();
//       const { username, id, name, profile_image_url } = meUser.data;
//       const user = await prisma.user_user.upsert({
//         where: { username: username },
//         create: {
//           personal_twitter_handle: username,
//           username: username,
//           personal_twitter_id: id,
//           twitter_access_token: accessToken,
//           twitter_access_token_secret: accessSecret,
//           available_budget: 0,
//           is_active: true,
//           name,
//           profile_image_url: profile_image_url ?? "",
//           role: wl_users?.includes(username) ? "SUPER_ADMIN" : "GUEST_USER",
//           email: `${username.toLocaleLowerCase()}@hashbuzz.social`,
//           date_joined: moment().toISOString(),
//         },
//         update: {
//           twitter_access_token: accessToken,
//           twitter_access_token_secret: accessSecret,
//           personal_twitter_id: id,
//         },
//       });
//       // ?token={token.key}&user_id={user.id}
//       const token = generateAccessToken(user);
//       const refreshToken = await generateRefreshToken(user);
//       res.writeHead(TEMPORARY_REDIRECT, {
//         Location: `${process.env.FRONTEND_URL!}?token=${token}&refreshToken=${refreshToken}&user_id=${user.id}`,
//       });
//       res.end();
//     } catch (error) {
//       logger.err(error.message);
//       // console.log(error);
//       const message: string = error.message as string;
//       res.writeHead(TEMPORARY_REDIRECT, {
//         Location: `${process.env.FRONTEND_URL!}?authStatus=fail&message=${message}`,
//       });
//       res.end();
//     }
//   })();
// };

// export const handleTwitterBizRegister = (req: Request, res: Response) => {
//   (async () => {
//     try {
//       // Extract tokens from query string
//       const oauth_token = req.query.oauth_token as any as string;
//       const oauth_verifier = req.query.oauth_verifier as any as string;

//       // Obtain the persistent tokens
//       // Create a client from temporary tokens
//       const { loginResult, business_owner_id } = await authLogin({ oauth_token, oauth_verifier });
//       const { client: loggedClient, accessToken, accessSecret } = loginResult;
//       const meUser = await loggedClient.v2.me();
//       const { username, id } = meUser.data;
//       await prisma.user_user.update({
//         where: {
//           id: business_owner_id!,
//         },
//         data: {
//           business_twitter_handle: username,
//           business_twitter_access_token: accessToken,
//           business_twitter_access_token_secret: accessSecret,
//         },
//       });
//       res.writeHead(TEMPORARY_REDIRECT, {
//         Location: `${process.env.FRONTEND_URL!}?brandConnection=success&handle=${username}`,
//       });
//       res.end();
//     } catch (error) {
//       logger.err(error.message);
//       const message: string = error.message as string;
//       res.writeHead(TEMPORARY_REDIRECT, {
//         Location: `${process.env.FRONTEND_URL!}?brandConnection=fail&message=${message}`,
//       });
//       res.end();
//     }
//   })();
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
