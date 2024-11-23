import { Status } from "@hashgraph/sdk";
import { campaignstatus as CampaignStatus } from "@prisma/client";
import CampaignLifeCycleBase from "@services/CampaignLifeCycleBase";
import ContractUtils from "@services/ContractUtilsHandlers";
import { hederaSDKCallHandler } from "@services/HederaSDKCalls";
import { default as htsServices } from "@services/hts-services";
import passwordService from "@services/password-service";
import twitterCardService from "@services/twitterCard-service";
import { ErrorWithCode } from "@shared/errors";
import { sensitizeUserData } from "@shared/helper";
import { networkHelpers } from "@shared/NetworkHelpers";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import statuses from "http-status-codes";
import JSONBigInt from "json-bigint";
import { isEmpty } from "lodash";
import { TokenData } from "src/@types/networkResponses";
import fs from 'fs';
import path from 'path';
import { provideActiveContract } from "@services/contract-service";

const { OK, BAD_REQUEST, NOT_FOUND } = statuses;

export const handleGetAllCard = async (req: Request, res: Response) => {
  const status = req.query.status as any as CampaignStatus;
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


export const handleTokenInfoReq = async (req: Request, res: Response, next: NextFunction) => {
  const tokenId = req.body.tokenId as string;
  const tokenInfo = await htsServices.getTokenInfo(tokenId);
  return res.status(OK).json(tokenInfo);
};

export const handleWhiteListToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokenId = req.body.token_id as string;

    const tokenType = req.body.token_type as string;
    const userId = req.currentUser?.id;
    const tokenSymbol = req.body.token_symbol as string;
    const decimals = req.body.decimals as number;

    if (!tokenId || !tokenType || !userId || !tokenSymbol || decimals === undefined) {
      return res.status(BAD_REQUEST).json({ message: "Missing required fields" });
    }

    const contractDetails = await provideActiveContract();
    const tokenData = await networkHelpers.getTokenDetails<TokenData>(tokenId);

    if (!contractDetails?.contract_id || !tokenData || tokenData.type !== "FUNGIBLE_COMMON") {
      return res.status(BAD_REQUEST).json({ message: "Invalid contract details or token data" });
    }

    const existingToken = await prisma.whiteListedTokens.findUnique({ where: { token_id: tokenId } });

    if (existingToken) {
      return res.status(BAD_REQUEST).json({ message: "Token already associated." });
    }
    const utilsHandlerService = new ContractUtils(contractDetails.contract_id);
    // Lodge in the contract.
    const response = await utilsHandlerService.associateToken(tokenId, true);

    if (response._code !== Status.Success._code) {
      return res.status(BAD_REQUEST).json({ message: "Token association SM update failed" });
    }

    // SDK call to associate token with account
    const associateTokenResponse = await hederaSDKCallHandler.associateToken(contractDetails.contract_id, tokenId);

    if (associateTokenResponse !== Status.Success) {
      return res.status(BAD_REQUEST).json({ message: "Token association failed" });
    }

    const newToken = await prisma.whiteListedTokens.upsert({
      where: { token_id: tokenId },
      create: {
        name: tokenData.name,
        token_id: tokenId,
        tokendata: tokenData,
        token_type: tokenType,
        added_by: userId,
        token_symbol: tokenSymbol,
        decimals,
        contract_id: contractDetails.contract_id.toString(),
      },
      update: {
        token_id: tokenId,
        tokendata: tokenData,
      },
    });

    return res.status(OK).json({ message: "Token added successfully", data: JSONBigInt.parse(JSONBigInt.stringify(newToken)) });
  } catch (error) {
    console.error("Error in handleWhiteListToken:", error);
    return res.status(BAD_REQUEST).json({ message: "Something went wrong." });
  }
};

export const handleGetAllWLToken = async (req: Request, res: Response, next: NextFunction) => {
  const tokenId = req.query.tokenId as any as string;
  if (tokenId) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const tokenData = await prisma.whiteListedTokens.findUnique({
      where: { token_id: tokenId },
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

export const handleGetAllCampaigns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(OK).json({})
  }
  catch (err) {
    next(err)
  }
}

export const handleDeleteBizHanlde = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.body.userId as any as number;

    // Check if the user exists
    const user = await prisma.user_user.findUnique({
      where: { id: Number(userId) },
    });

    if (!user) {
      return res.status(NOT_FOUND).json({ message: 'User not found' });
    }

    // Update specific fields to null
    const updatedUser = await prisma.user_user.update({
      where: { id: Number(userId) },
      data: {
        business_twitter_handle: null,
        business_twitter_access_token: null,
        business_twitter_access_token_secret: null
      },
    });

    return res.status(200).json({ message: 'User buiesness handle removed successfully', data: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))) });
  } catch (err) {
    next(err); // Pass error to the error handling middleware
  }
}

export const handleDeletePerosnalHanlde = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.body.userId as any as number;

    // Check if the user exists
    const user = await prisma.user_user.findUnique({
      where: { id: Number(userId) },
    });

    if (!user) {
      return res.status(NOT_FOUND).json({ message: 'User not found' });
    }

    // Update specific fields to null
    const updatedUser = await prisma.user_user.update({
      where: { id: Number(userId) },
      data: {
        personal_twitter_handle: null,
        personal_twitter_id: null,
        profile_image_url: "",
        twitter_access_token: null,
        twitter_access_token_secret: null
      },
    });

    return res.status(200).json({ message: 'User buiesness handle removed successfully', data: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))) });
  } catch (err) {
    next(err); // Pass error to the error handling middleware
  }
}


export const handleGetTrailsettters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Path to Key Store
    const filePath = path.join(__dirname, "../../.trailsetters/data.json");
    const fileData = fs.readFileSync(filePath, 'utf8');
    const trailsettersData = fileData.length > 0 ? JSON.parse(fileData) : [];
    return res.status(OK).json(trailsettersData);
  } catch (err) {
    next(err);
  }
};

export const updateTrailsettersData = async (req: Request, res: Response, next: NextFunction) => {
  const filePath = path.join(__dirname, "../../.trailsetters/data.json");
  const fileData = fs.readFileSync(filePath, 'utf8');

  try {
    const trailsettersData = fileData.length > 0 ? JSON.parse(fileData) : [];
    const updatedData = [...trailsettersData, ...req.body.accounts];
    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), 'utf8');
    return res.status(OK).json({ message: 'Trailsetters data updated successfully', data: updatedData });
  } catch (err) {
    next(err);
  }
}