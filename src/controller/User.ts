import { formatTokenBalancesObject, sensitizeUserData } from "@shared/helper";
import { NextFunction, Request, Response } from "express";
import StatusCodes from "http-status-codes";
import logger from "../config/logger";
import JSONBigInt from "json-bigint";
import userService from "@services/user-service";
import { ParamMissingError } from "@shared/errors";
import prisma from "@shared/prisma";
import { validationResult } from "express-validator";
import { queryBalance, queryFungibleBalanceOfCampaigner } from "@services/contract-service";
import createPrismaClient from "@shared/prisma";
import { getConfig } from "@appConfig";

const { OK, BAD_REQUEST } = StatusCodes;
/**
 * @description Get all user list by pagination.
 */
export const handleGetAllUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { offset = 0, limit = 10 } = req.body;
    const { users, count } = await userService.getAll({ limit, offset });
    const userData = await Promise.all(users.map(async (u) => JSONBigInt.parse(JSONBigInt.stringify(await sensitizeUserData(u)))));
    return res.status(OK).json({ users: userData, count });
  } catch (error) {
    next(error);
  }
};

export const handleCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  if (req?.accountAddress) {
    const config = await getConfig();

    const currentUser = await userService.getUserByAccountAddress(req.accountAddress);
    const contractAddress = config.network.contractAddress;
    const collecterAddress = config.network.accountID;
    const campaignDuration = config.app.defaultCampaignDuratuon;
    const campaignRewardDuration = config.app.defaultRewardClaimDuration;
    if (currentUser) {
      const senetizedUser = await sensitizeUserData(currentUser)
      return res.status(OK).json({ ...JSONBigInt.parse(JSONBigInt.stringify(senetizedUser)), config: { contractAddress, collecterAddress, campaignDuration, campaignRewardDuration } });
    }
    else throw new ParamMissingError("No record for this id.");
  }
};

export const handleUpdateConcent = async (req: Request, res: Response, next: NextFunction) => {
  const { consent } = req.body;
  const prisma = await createPrismaClient();
  const updatedUser = await prisma.user_user.update({
    where: { accountAddress: req.accountAddress },
    data: { consent: consent },
  });
  return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(await sensitizeUserData(updatedUser))));
};

export const handleGetUserBalances = (req: Request, res: Response, next: NextFunction) => {
  // try {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(BAD_REQUEST).json({ errors: errors.array() });
  }

  const address: string = req.body.accountId;
  const contractBal: boolean = req.body.contractBal;
  if (contractBal) {
    (async () => {
      const balances = await queryBalance(address);
      if (req.currentUser?.id && balances?.balances) await userService.topUp(req.currentUser?.id, balances.balances, "update");
      logger.info(`Contract balance for the ${address} is::::- ${balances?.balances ?? 0}`);
      return res.status(OK).json(balances);
    })();
  } else {
    return res.status(OK).json({ available_budget: req.currentUser?.available_budget });
  }
};

export const handleTokenBalReq = async (req: Request, res: Response, next: NextFunction) => {
  const prisma = await createPrismaClient();
  const tokenList = await prisma.whiteListedTokens.findMany();
  const userBalancesForTokens = await prisma.user_balances.findMany({
    where: {
      user_id: req.currentUser?.id,
    },
  });

  const balanceData = tokenList.map((token) => {
    const balance_record = userBalancesForTokens.find((b) => b.token_id === token.id);
    return formatTokenBalancesObject(token, balance_record);
  });
  return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(balanceData)));
};

export const twitterCardStatsData = async (req: Request, res: Response) => {
  const id = req.query.id;
  const prisma = await createPrismaClient();
  const cardStatus = await prisma.campaign_tweetstats.findUnique({
    where: {
      twitter_card_id: Number(id),
    },
  });

  const data = {
    id: Number(cardStatus?.id),
    retweet_count: cardStatus?.retweet_count,
    reply_count: cardStatus?.reply_count,
    like_count: cardStatus?.like_count,
    quote_count: cardStatus?.quote_count,
    last_update: cardStatus?.last_update,
    twitter_card_id: Number(cardStatus?.twitter_card_id),
  };
  return res.status(OK).json({ data });
};

export const handleTokenContractBal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokenId = req.params.tokenId as string;
    if (req.currentUser?.hedera_wallet_id) {
      const balance = await queryFungibleBalanceOfCampaigner(req.currentUser.hedera_wallet_id, tokenId);
      logger.info(`Toeken baalnce for the user ${req.currentUser.id} and for token ${tokenId}`);
      return res.status(OK).json({ balance });
    }
    throw new Error("No wallet for this user");
  } catch (err) {
    next(err);
  }
};

export const syncBal = async (req: Request, res: Response, next: NextFunction) => {
  const prisma = await createPrismaClient();
  try {
    const tokenId = req.params.tokenId as string;

    // verify token

    const tokendata = await prisma.whiteListedTokens.findUnique({ where: { token_id: tokenId } });
    if (!tokendata) return res.status(BAD_REQUEST).json({ error: true, messages: "Unsupoorted token" });

    // Go for SM query for the baalnce
    if (req.currentUser && req.currentUser.hedera_wallet_id && req.currentUser.id) {
      const balance = await queryFungibleBalanceOfCampaigner(req.currentUser.hedera_wallet_id, tokenId);

      logger.info(`Toeken baalnce syn for the user ${req.currentUser.id} and for token ${tokenId}`);

      await prisma.user_balances.updateMany({
        where: {
          token_id: tokendata.id,
          user_id: req.currentUser.id,
        },
        data: {
          entity_balance: Number(balance),
        },
      });

      return res.status(OK).json({ balance: Number(balance) });
    }
    throw new Error("No wallet for this user");
  } catch (err) {
    next(err);
  }
};
