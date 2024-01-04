import { formatTokenBalancesObject, sensitizeUserData } from "@shared/helper";
import { NextFunction, Request, Response } from "express";
import StatusCodes from "http-status-codes";
import logger from "jet-logger";
import JSONBigInt from "json-bigint";

import { queryBalance } from "@services/smartcontract-service";
import userService from "@services/user-service";
import { ParamMissingError } from "@shared/errors";
import prisma from "@shared/prisma";
import { validationResult } from "express-validator";

const { OK, BAD_REQUEST } = StatusCodes;
/**
 * @description Get all user list by pagination.
 */
export const handleGetAllUser = async (req: Request, res: Response, next: NextFunction) => {
  // try {
  const body = req.body;
  const offset = body.offset ?? 10;
  const limit = body.limit ?? 10;
  // (async () => {
  const users = await userService.getAll({ limit, offset });
  return res.status(OK).json({ users: JSONBigInt.parse(JSONBigInt.stringify(users)) });
  // })();
  // } catch (err) {
  //   next(err);
  // }
};

export const handleCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  // try {
  //   (async () => {
  if (req?.accountAddress) {
    const currentUser = await userService.getUserByAccountAddress(req.accountAddress);
    if (currentUser) return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(currentUser))));
    else throw new ParamMissingError("No record for this id.");
  }
  //   })();
  // } catch (err) {
  //   next(err);
  // }
};

export const handleUpdateConcent = async (req: Request, res: Response, next: NextFunction) => {
  // try {
  //   (async () => {
  const { consent } = req.body;
  const updatedUser = await prisma.user_user.update({
    where: { accountAddress: req.accountAddress },
    data: { consent: consent },
  });
  return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(updatedUser))));
  // })();
  // } catch (err) {
  //   next(err);
  // }
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
      if (req.currentUser?.id && balances?.balances) await userService.topUp(req.currentUser?.id, parseInt(balances.balances), "update");
      logger.info(`Contract balance for the ${address} is::::- ${balances?.balances ?? 0}`);
      return res.status(OK).json(balances);
    })();
  } else {
    return res.status(OK).json({ available_budget: req.currentUser?.available_budget });
  }
  // } catch (err) {
  //   next(err);
  // }
};

export const handleTokenBalReq = async (req: Request, res: Response, next: NextFunction) => {
  // try {
  //   (async () => {
  const tokenList = await prisma.whiteListedTokens.findMany();
  const userBalancesForTokens = await prisma.user_balances.findMany({
    where: {
      user_id: req.currentUser?.id,
    },
  });

  const balanceData = tokenList.map((token) => {
    const balance_record = userBalancesForTokens.find((b) => b.token_id === token.id);
    console.log(token, balance_record, "X-Token")
    return formatTokenBalancesObject(token, balance_record);
  });
  console.log(balanceData);
  return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(balanceData)));
  //   })();
  // } catch (error) {
  //   next(error);
  // }
};

export const twitterCardStatsData = async (req:Request, res:Response) => {
  const id = req.query.id;
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
    twitter_card_id: Number(cardStatus?.twitter_card_id)
  }
  return res.status(OK).json({data});
}