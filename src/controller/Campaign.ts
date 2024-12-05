import { getConfig } from "@appConfig";
import { campaignstatus as CampaignStatus } from "@prisma/client";
import CampaignLifeCycleBase, { CampaignCommands, createCampaignParams } from "@services/CampaignLifeCycleBase";
import MakeCampaignRunning from "@services/MakeCmapignRunning";
import { getCampaignDetailsById, getRunningCardsOfUserId } from "@services/campaign-service";
import { addFungibleAndNFTCampaign, queryCampaignBalanceFromContract } from "@services/contract-service";
import { getRewardDetails } from "@services/reward-service";
import { allocateBalanceToCampaign } from "@services/transaction-service";
import twitterCardService from "@services/twitterCard-service";
import userService from "@services/user-service";
import { ErrorWithCode } from "@shared/errors";
import { convertToTinyHbar, rmKeyFrmData, sensitizeUserData } from "@shared/helper";
import createPrismaClient from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import statuses from "http-status-codes";
import JSONBigInt from "json-bigint";
import { isEmpty } from "lodash";

const { OK, BAD_REQUEST, CONFLICT, INTERNAL_SERVER_ERROR, NO_CONTENT, CREATED } = statuses;

export const makeCardRunning = async (req: Request, res: Response, next: NextFunction) => {
  const campaignId = req.body.card_id as any as number;
  const campaign_command = req.body.campaign_command as any as CampaignCommands;
  try {
    if (campaign_command === CampaignCommands.StartCampaign) {
      // ?.. Call the method of running campaign of Campaign:Ifecycle memthod.
      const runningCampaign = await MakeCampaignRunning.create(campaignId);
      const data = await runningCampaign.makeCardRunning();
      return res.status(CREATED).json(data);
    } else {
      throw new ErrorWithCode("Card is not in valid state to run!", BAD_REQUEST);
    }
  } catch (err) {
    next(err);
  }
};

export const statusUpdateHandler = async (req: Request, res: Response, next: NextFunction) => {
  const campaignId: number = req.body.card_id;
  let requested_card_status: string = req.body.card_status;
  requested_card_status = requested_card_status.toLowerCase();

  const prisma = await createPrismaClient();
  const campaign_data = await getCampaignDetailsById(campaignId);

  if (campaign_data?.approve === true && campaign_data?.contract_id) {
    const current_status_of_card = campaign_data?.card_status.toLocaleLowerCase();
    const campaignerId = campaign_data?.owner_id;
    const amounts = campaign_data?.campaign_budget;
    const campaignerAccount = campaign_data?.user_user?.hedera_wallet_id;

    if (campaign_data?.type === "HBAR") {
      //!! if card is in the same status don't update this card. respond with BAD_REQUEST
      if (current_status_of_card === requested_card_status) {
        return res.status(BAD_REQUEST).json({
          error: true,
          message: "Card is currently in the same status.",
        });
      }

      /**** ============= Update card to Running Status operation=================== */
      if (requested_card_status === "running" && campaign_data?.owner_id && amounts && campaignerId && campaignerAccount) {
        //? Check is there any running card for current card owner. We are allowing only one card running at a single moments.
        const currentRunningCardOfCardOwner = await getRunningCardsOfUserId(campaign_data?.owner_id);

        //! if any running account then status change will not allowed
        if (currentRunningCardOfCardOwner) {
          return res.status(CONFLICT).json({
            error: true,
            message: "Only one card is allowed at once.",
          });
        }

        //!  if any campaign_budget is grater than the card owner available_budget then status will remain same.
        if (campaign_data.campaign_budget && campaign_data.user_user?.available_budget && campaign_data.campaign_budget > campaign_data.user_user?.available_budget) {
          return res.status(NO_CONTENT).json({ error: true, message: "Insufficient fund." });
        }

        //! Now 1. - Do smartcontrct transaction for balance update.
        //! 2. Decrement the balance from card owner main account in db_available_budget;
        //! 3. Update the card status as per the requirements.

        const tweetId = await twitterCardService.publishTwitter(campaignId);
        if (tweetId) {
          const [SM_transaction, dbUserBalance] = await Promise.all([await allocateBalanceToCampaign(campaign_data.id, amounts, campaignerAccount, campaign_data?.contract_id), await userService.topUp(campaignerId, amounts, "decrement")]);

          const updated_campaign_data = await getCampaignDetailsById(campaignId);
          const { user_user, ...restCard } = updated_campaign_data!;

          return res.status(OK).json({
            message: "Campaign status updated",
            transaction: SM_transaction,
            user: JSONBigInt.parse(JSONBigInt.stringify(await sensitizeUserData(dbUserBalance))),
          });
        }
      }

    }

    if (campaign_data && campaign_data?.type === "FUNGIBLE" && campaign_data.user_user && campaign_data?.fungible_token_id) {

      const entityData = await prisma.whiteListedTokens.findUnique({
        where: { token_id: campaign_data?.fungible_token_id },
      });

      const user_balances = await prisma.user_balances.findFirst({
        where: {
          user_id: campaign_data?.user_user?.id,
          token_id: entityData?.id,
        },
      });

      const current_status_of_card = campaign_data?.card_status.toLocaleLowerCase();
      const campaignerId = campaign_data?.owner_id;
      let amounts = campaign_data?.campaign_budget;
      const campaignerAccount = campaign_data?.user_user?.hedera_wallet_id;

      //!! if card is in the same status don't update this card. respond with BAD_REQUEST
      if (current_status_of_card === requested_card_status) {
        return res.status(BAD_REQUEST).json({
          error: true,
          message: "Card is currently in the same status.",
        });
      }
      /**** ============= Update card to Running Status operation=================== */
      if (requested_card_status === "running" && campaign_data?.owner_id && amounts && campaignerId && campaignerAccount) {
        //? Check is there any running card for current card owner. We are allowing only one card running at a single moments.
        const currentRunningCardOfCardOwner = await getRunningCardsOfUserId(campaign_data?.owner_id);

        //! if any running account then status change will not allowed
        if (currentRunningCardOfCardOwner) {
          return res.status(CONFLICT).json({
            error: true,
            message: "Only one card is allowed at once.",
          });
        }

        //!  if any campaign_budget is grater than the card owner available_budget then status will remain same.
        if (campaign_data.campaign_budget && user_balances?.entity_balance && campaign_data.campaign_budget >= user_balances?.entity_balance) {
          return res.status(NO_CONTENT).json({ error: true, message: "Insufficient fund." });
        }

        //! Now 1. - Do smartcontrct transaction for balance update.
        //! 2. Decrement the balance from card owner main account in db_available_budget;
        //! 3. Update the card status as per the requirements.

        const tweetId = await twitterCardService.publishTwitter(campaignId);
        if (tweetId && entityData?.id) {
          const [SM_transaction, dbUserBalance] = await Promise.all([
            await addFungibleAndNFTCampaign(campaign_data?.fungible_token_id, amounts, campaign_data?.user_user?.hedera_wallet_id, campaign_data?.contract_id),
            await userService.updateTokenBalanceForUser({
              amount: amounts,
              operation: "decrement",
              token_id: entityData?.id,
              decimal: Number(entityData?.decimals),
              user_id: campaign_data.user_user.id,
            }),
          ]);

          return res.status(OK).json({
            message: "Campaign status updated",
            transaction: SM_transaction,
            user: JSONBigInt.parse(JSONBigInt.stringify(await sensitizeUserData(dbUserBalance))),
          });
        }
      }
    }
  } else {
    res.json({ message: "Campaign is not approved" });
  }
};

export const handleCampaignGet = async (req: Request, res: Response, next: NextFunction) => {
  const prisma = await createPrismaClient();
  const allCampaigns = await prisma.campaign_twittercard.findMany({
    where: {
      owner_id: req.currentUser?.id,
    },
    orderBy: {
      id: "desc",
    },
  });
  return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(allCampaigns)));
};

export const handleAddNewCampaignNew = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.body && req.currentUser?.id) {
      const campaign_data = req.body as any as createCampaignParams;
      const config = await getConfig();
      const createCampaign = await new CampaignLifeCycleBase(config.db.redisServerURI).createNewCampaign(campaign_data, req.currentUser?.id);
      if (createCampaign.error) {
        return res.status(BAD_REQUEST).json({ createCampaign });
      } else {
        return res.status(CREATED).json(createCampaign);
      }
    } else throw new ErrorWithCode("Request params is not sufficient", BAD_REQUEST);
  } catch (err) {
    next(new ErrorWithCode("Error while creating new campaign", INTERNAL_SERVER_ERROR));
  }
};

export const handleAddNewCampaign = async (req: Request, res: Response, next: NextFunction) => {
  const { name, tweet_text, comment_reward, retweet_reward, like_reward, quote_reward, follow_reward, campaign_budget, media, type } = req.body;
  const { fungible_token_id } = req.body;
  const prisma = await createPrismaClient();
  if (isEmpty(name) || isEmpty(tweet_text) || isEmpty(comment_reward) || isEmpty(retweet_reward) || isEmpty(like_reward) || isEmpty(quote_reward) || isEmpty(campaign_budget) || isEmpty(req.currentUser?.id)) {
    return res.status(BAD_REQUEST).json({ error: true, message: "Data fields should not be empty." });
  }

  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < 20; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  (async () => {
    try {
      const token = await prisma.whiteListedTokens.findUnique({
        where: { token_id: fungible_token_id },
        select: { decimals: true },
      });

      if (type === "HBAR" && req.currentUser?.id) {

        const newCampaign = await prisma.campaign_twittercard.create({
          data: {
            name,
            tweet_text,
            comment_reward: convertToTinyHbar(comment_reward as string),
            like_reward: convertToTinyHbar(like_reward as string),
            retweet_reward: convertToTinyHbar(retweet_reward as string),
            quote_reward: convertToTinyHbar(quote_reward as string),
            campaign_budget: convertToTinyHbar(campaign_budget as string),
            card_status: CampaignStatus.ApprovalPending,
            owner_id: req.currentUser.id,
            amount_spent: 0,
            amount_claimed: 0,
            type: "HBAR",
            media,
            approve: false,
            contract_id: result,
          },
        });
        return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(rmKeyFrmData(newCampaign, ["last_reply_checkedAt", "last_thread_tweet_id", "contract_id"]))));
      } else if (type === "FUNGIBLE" && req.currentUser?.id) {
        const newCampaign = await prisma.campaign_twittercard.create({
          data: {
            name,
            tweet_text,
            comment_reward: Number(comment_reward * 10 ** Number(token?.decimals)),
            like_reward: Number(like_reward * 10 ** Number(token?.decimals)),
            retweet_reward: Number(retweet_reward * 10 ** Number(token?.decimals)),
            quote_reward: Number(quote_reward * 10 ** Number(token?.decimals)),
            campaign_budget: Number(campaign_budget * 10 ** Number(token?.decimals)),
            card_status: CampaignStatus.ApprovalPending,
            owner_id: req.currentUser?.id,
            amount_spent: 0,
            amount_claimed: 0,
            fungible_token_id,
            type: "FUNGIBLE",
            media,
            approve: false,
            decimals: token?.decimals,
            contract_id: result,
          },
        });
        return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(rmKeyFrmData(newCampaign, ["last_reply_checkedAt", "last_thread_tweet_id", "contract_id"]))));
      }
    } catch (err) {
      console.log("Error from handleAddNewCampaign:::", err);
      next(new ErrorWithCode("Error while creating new campaign", INTERNAL_SERVER_ERROR));
    }
  })();
};

export const handleCampaignStats = async (req: Request, res: Response, next: NextFunction) => {
  const card_id = req.body.card_id;
  const prisma = await createPrismaClient();
  const stats = await prisma.campaign_tweetstats.findUnique({
    where: { twitter_card_id: parseInt(card_id as string) },
  });
  return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(stats)));
};

export const checkCampaignBalances = async (req: Request, res: Response, next: NextFunction) => {
  const campaignId = req.query.campaignId as any as string;
  const campaignDetails = await getCampaignDetailsById(parseInt(campaignId));
  if (campaignDetails?.contract_id) {
    const balance = await queryCampaignBalanceFromContract(
      campaignDetails.contract_id,
      campaignDetails.fungible_token_id,
    );
    return res.status(OK).json({ balance });
  }
  return res.status(BAD_REQUEST).json({ error: true, message: "Wallet address not found" });
};

export const rewardDetails = async (req: Request, res: Response) => {
  const user = await getRewardDetails(req.currentUser?.hedera_wallet_id!);
  return res.status(OK).json({ rewardDetails: JSONBigInt.parse(JSONBigInt.stringify(user)) });
};

