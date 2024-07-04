import { associateTokentoContract } from "@services/contract-service";
import htsServices from "@services/hts-services";
import passwordService from "@services/password-service";
import { getSMInfo, provideActiveContract } from "@services/smartcontract-service";
import htsService from "@services/hts-services";
import twitterCardService from "@services/twitterCard-service";
import { ErrorWithCode } from "@shared/errors";
import { sensitizeUserData } from "@shared/helper";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import statuses from "http-status-codes";
import JSONBigInt from "json-bigint";
import { isEmpty } from "lodash";
import CampaignLifeCycleBase from "@services/CampaignLifeCycleBase";

const { OK, BAD_REQUEST } = statuses;
// const { associateTokenToContract } = htsServices;

export const handleGetAllCard = async (req: Request, res: Response) => {
  const status = req.query.status as any as string;
  const data = await twitterCardService.getAllTwitterCardByStatus(status);
  if (data && data.length > 0) {
    return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(data)));
  } else res.status(OK).json([]);
};

export const handleGetAllCardPendingCards = async (req: Request, res: Response) => {
  const data = await twitterCardService.getAllTwitterCardPendingCards();
  // console.log(data);
  if (data && data.length > 0) {
    return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(data)));
  } else res.status(OK).json([]);
};

export const handleUpdateCard = async (req: Request, res: Response) => {
  const approve = req.body.approve as boolean;
  const id = req.body.id as number;

  const data = await twitterCardService.updateStatus(id, approve);
  return res.status(OK).json({ message: "Status updated successfully", data: JSONBigInt.parse(JSONBigInt.stringify(data)) });
};

export const handleUpdatePasswordReq = async (req: Request, res: Response, next: NextFunction) => {
  const { password, oldPassword }: { password: string; oldPassword?: string } = req.body;

  if (req.currentUser?.salt && req.currentUser.hash && isEmpty(oldPassword)) {
    next(new ErrorWithCode("without old password password reset is not allowed", BAD_REQUEST));
  }

  // Update normal password.

  if (oldPassword && password && req.currentUser?.salt && req.currentUser.hash) {
    //?? match the old password.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const matchOldPassword = passwordService.validPassword(oldPassword, req.currentUser.salt, req.currentUser.hash);
    //!! if not matched throw error
    if (!matchOldPassword) next(new ErrorWithCode("Old password is not matching", BAD_REQUEST));

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

export const handleTokenInfoReq = async (req: Request, res: Response, next: NextFunction) => {
  const tokenId = req.body.tokenId as string;
  const tokenInfo = await htsServices.getTokenInfo(tokenId);
  return res.status(OK).json(tokenInfo);
};

export const handleWhiteListToken = async (req: Request, res: Response, next: NextFunction) => {
  const tokenId = req.body.token_id as string;
  const tokenInfo = req.body.tokendata;
  const token_type = req.body.token_type as string;
  const userId = req.currentUser?.id;
  const token_symbol = req.body.token_symbol as string;
  const decimals = req.body.decimals as number;

  const contractDetails = await provideActiveContract();
  const tokenData = await htsService.getTokenDetails(tokenId);
  if (userId && contractDetails?.contract_id && tokenId) {
    const token = await prisma.whiteListedTokens.findUnique({ where: { token_id: tokenId } });
    if (token) {
      return res.status(BAD_REQUEST).json({ message: "Token already associated" });
    } else {
      await associateTokentoContract(tokenId);
      // await associateTokenToContract(tokenId);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const newToken = await prisma.whiteListedTokens.upsert({
        where: { token_id: tokenId },
        create: {
          name: tokenInfo.name,
          token_id: tokenId,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          tokendata: tokenData,
          token_type,
          added_by: userId,
          token_symbol,
          decimals,
          contract_id: contractDetails.contract_id.toString(),
        },
        update: {
          token_id: tokenId,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          tokendata: tokenInfo,
        },
      });
      return res.status(OK).json({ message: "Token added successfully", data: JSONBigInt.parse(JSONBigInt.stringify(newToken)) });
    }
  }
  return res.status(BAD_REQUEST).json({ message: "Something went wrong." });
};

export const handleGetAllWLToken = async (req: Request, res: Response, next: NextFunction) => {
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
};

export const handleActiveContractInfoReq = async (_: Request, res: Response, next: NextFunction) => {
  const info = await getSMInfo();
  if (info) return res.status(OK).json(info);
  return res.status(BAD_REQUEST).json({ error: true });
};

export const handleGetCmapingLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cmapignId = req.params.id as any as number;
    const instance = await CampaignLifeCycleBase.create(cmapignId);
    const data = await instance.getLogsOfTheCampaign();
    res.status(OK).json({
      success: true,
      data,
      message: "Cmapaing logs found successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const handleAllowAsCampaigner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.body.id as any as number;
    if (!id) return res.status(BAD_REQUEST).json({ message: "User id not found." });
    const updatedUser = await prisma.user_user.update({
      data: { role: "USER" },
      where: { id },
    });

    return res.status(OK).json({ success: true, user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))) });
  } catch (err) {
    next(err);
  }
};
