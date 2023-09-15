import { TokenInfo } from "@hashgraph/sdk";
import htsServices from "@services/hts-services";
import passwordService from "@services/password-service";
import { getSMInfo, provideActiveContract } from "@services/smartcontract-service";
import twitterCardService from "@services/twitterCard-service";
import { ErrorWithCode, ParamMissingError } from "@shared/errors";
import { sensitizeUserData } from "@shared/helper";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import statuses from "http-status-codes";
import JSONBigInt from "json-bigint";
import { isEmpty } from "lodash";

const { OK, BAD_REQUEST } = statuses;
const { associateTokenToContract } = htsServices;

export const handleGetAllCard = (req: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const status = req.query.status as any as string;
      const data = await twitterCardService.getAllTwitterCardByStatus(status);
      if (data && data.length > 0) {
        return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(data)));
      } else res.status(OK).json([]);
    })();
  } catch (err) {
    next(err);
  }
};

export const handleUpdatePasswordReq = (req: Request, res: Response, next: NextFunction) => {
  (async () => {
    try {
      const { password , oldPassword }: { password: string; oldPassword?: string; } = req.body;

      if (req.currentUser?.salt && req.currentUser.hash && isEmpty(oldPassword)) {
        next(new ErrorWithCode("without old password password reset is not allowed" , BAD_REQUEST))
      }

      // Update normal password.

      if (oldPassword && password && req.currentUser?.salt && req.currentUser.hash) {
        //?? match the old password.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const matchOldPassword = passwordService.validPassword(oldPassword, req.currentUser.salt, req.currentUser.hash);
        //!! if not matched throw error
        if (!matchOldPassword) next(new ErrorWithCode("Old password is not matching" , BAD_REQUEST))

        //old password is match now generate salt and hash for given password.
        const { salt, hash } = passwordService.createPassword(password);
        await prisma.user_user.update({
          where: { id: req.currentUser.id },
          data: {
            salt,
            hash,
          },
        });

        return res.status(OK).json({ message: "Password updated successfully." });
      }

      //!! reset password for newly created admin.
      if (req.currentUser?.id && !req.currentUser?.salt && !req.currentUser?.hash && password) {
        // create new password key and salt
        const { salt, hash } = passwordService.createPassword(password);
        //!! Save to db.
        const updatedUser = await prisma.user_user.update({
          where: { id: req.currentUser?.id },
          data: {
            salt,
            hash,
          },
        });
        return res.status(OK).json({ message: "Password created successfully.", user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))) });
      }

      res.status(BAD_REQUEST).json({ message: "Handler function not found" });
    } catch (err) {
      next(err);
    }
  })();
};

// export const handleUpdateEmailReq = (req: Request, res: Response, next: NextFunction) => {
//   (async () => {
//     try {
//       const { email, password }: { email: string; password: string } = req.body;
//       if (!req.currentUser?.hash || !req.currentUser.salt) {
//         throw new ParamMissingError("First update your password.");
//       }
//       // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
//       const isPasswordMatched = passwordService.validPassword(password, req.currentUser?.salt, req.currentUser?.hash);
//       if (!isPasswordMatched) throw new ParamMissingError("Password used is incorrect");

//       //if password matched then update email and send updated user's data as response;
//       const updatedUser = await prisma.user_user.update({
//         where: { id: req.currentUser.id },
//         data: {
//           email,
//         },
//       });
//       return res.status(OK).json({
//         message: "Email updated successfully",
//         user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))),
//       });
//     } catch (err) {
//       next(err);
//     }
//   })();
// };

export const handleTokenInfoReq = (req: Request, res: Response, next: NextFunction) => {
  (async () => {
    try {
      const tokenId = req.body.tokenId as string;
      const tokenInfo = await htsServices.getTokenInfo(tokenId);
      return res.status(OK).json(tokenInfo);
    } catch (err) {
      // console.log(err);
      next(err);
    }
  })();
};

export const handleWhiteListToken = (req: Request, res: Response, next: NextFunction) => {
  (async () => {
    try {
      const tokenId = req.body.tokenId as string;
      const tokenInfo = req.body.tokenData as TokenInfo;
      const token_type = req.body.token_type as string;
      const userId = req.currentUser?.id;

      const contractDetails = await provideActiveContract();

      if (userId && contractDetails?.contract_id) {
        await associateTokenToContract(tokenId);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const token = await prisma.whiteListedTokens.upsert({
          where: { token_id: tokenId },
          create: {
            name: tokenInfo.name,
            token_id: tokenId,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            //@ts-ignore
            tokendata: tokenInfo,
            token_type,
            added_by: userId,
            token_symbol: tokenInfo.symbol,
            contract_id: contractDetails.contract_id.toString(),
          },
          update: {
            token_id: tokenId,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            //@ts-ignore
            tokendata: tokenInfo,
          },
        });
        return res.status(OK).json({ message: "Token added successfully", data: JSONBigInt.parse(JSONBigInt.stringify(token)) });
      }
      return res.status(BAD_REQUEST).json({ message: "Something went wrong." });
    } catch (err) {
      // console.log(err);
      next(err);
    }
  })();
};

export const handleGetAllWLToken = (req: Request, res: Response, next: NextFunction) => {
  (async () => {
    try {
      const tokenId = req.query.tokenId as any as string;
      if (tokenId) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const tokenData = await prisma.whiteListedTokens.findUnique({
          where: { token_id: tokenId },
          // select: {
          //   token_id: true,
          //   token_type: true,
          //   tokendata: true,
          // },
        });
        return res.status(OK).json({ tokenId, data: JSONBigInt.parse(JSONBigInt.stringify(tokenData)) });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const allTokens = await prisma.whiteListedTokens.findMany();
        return res.status(OK).json({
          data: JSONBigInt.parse(JSONBigInt.stringify(allTokens)),
        });
      }
    } catch (err) {
      // console.log(err);
      next(err);
    }
  })();
};

export const handleActiveContractInfoReq = (_: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const info = await getSMInfo();
      if (info) return res.status(OK).json(info);
      return res.status(BAD_REQUEST).json({ error: true });
    })();
  } catch (err) {
    next(err);
  }
};
