import { completeCampaignOperation, getCampaignDetailsById, getRunningCardsOfUserId, updateCampaignStatus } from "@services/campaign-service";
import { queryCampaignBalance } from "@services/smartcontract-service";
import { allocateBalanceToCampaign } from "@services/transaction-service";
import twitterCardService from "@services/twitterCard-service";
import userService from "@services/user-service";
import { ErrorWithCode } from "@shared/errors";
import { convertToTinyHbar, rmKeyFrmData, sensitizeUserData } from "@shared/helper";
import prisma from "@shared/prisma";
import { NextFunction, Request, Response } from "express";
import statuses from "http-status-codes";
import JSONBigInt from "json-bigint";
import { isEmpty } from "lodash";

const { OK, BAD_REQUEST, CONFLICT, INTERNAL_SERVER_ERROR, NO_CONTENT } = statuses;
const campaignStatuses = ["rejected", "running", "completed", "deleted"];

export const statusUpdateHandler = (req: Request, res: Response, next: NextFunction) => {
  (async () => {
    const campaignId: number = req.body.card_id;
    let requested_card_status: string = req.body.card_status;
    requested_card_status = requested_card_status.toLowerCase();

    const campaign_data = await getCampaignDetailsById(campaignId);
    const current_status_of_card = campaign_data?.card_status.toLocaleLowerCase();
    const campaignerId = campaign_data?.owner_id;
    let amounts = campaign_data?.campaign_budget;
    const campaignerAccount = campaign_data?.user_user?.hedera_wallet_id;

    //!! if card is in the same status don't update this card. respond with BAD_REQUEST
    if (current_status_of_card === requested_card_status) {
      return res.status(BAD_REQUEST).json({ error: true, message: "Card is currently in the same status." });
    }

    //!! if requested state is Running or rejected then current status of card must be pending.
    if (current_status_of_card === "pending" && !["running", "rejected"].includes(requested_card_status))
      return res.status(CONFLICT).json({ error: true, message: "Requested status updated will only be provided on pending card." });

    /**** ============= Update card to Running Status operation=================== */
    if (requested_card_status === "running" && campaign_data?.owner_id && amounts && campaignerId && campaignerAccount) {
      //? Check is there any running card for current card owner. We are allowing only one card running at a single moments.
      const currentRunningCardOfCardOwner = await getRunningCardsOfUserId(campaign_data?.owner_id);

      //! if any running account then status change will not allowed
      if (currentRunningCardOfCardOwner) return res.status(CONFLICT).json({ error: true, message: "Only one card is allowed at once." });

      //!  if any campaign_budget is grater than the card owner available_budget then status will remain same.
      if (
        campaign_data.campaign_budget &&
        campaign_data.user_user?.available_budget &&
        campaign_data.campaign_budget > campaign_data.user_user?.available_budget
      )
        return res.status(NO_CONTENT).json({ error: true, message: "Insufficient fund." });

      //! Now 1. - Do smartcontrct transaction for balance update.
      //! 2. Decrement the balance from card owner main account in db_available_budget;
      //! 3. Update the card status as per the requirements.
      amounts = Math.round(amounts);

      const tweetId = await twitterCardService.publishTwitter(campaignId);

      if (tweetId) {
        const [SM_transaction, dbUserBalance] = await Promise.all([
          await allocateBalanceToCampaign(campaign_data.id, amounts, campaignerAccount),
          await userService.topUp(campaignerId, amounts, "decrement"),
        ]);
        return res.status(OK).json({ transaction: SM_transaction, user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(dbUserBalance))) });
      }
    }

    if (requested_card_status === "completed") {
      const { user_user, ...restCard } = campaign_data!;
      const completeCampaign = await completeCampaignOperation(restCard);
      return res.status(OK).json(completeCampaign);
    }

    if (["rejected", "deleted"].includes(requested_card_status)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      const campaignUpdates = await updateCampaignStatus(campaignId, requested_card_status === "rejected" ? "Rejected" : "Deleted");
      return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(campaignUpdates)));
    }

    next(new ErrorWithCode("Insufficient parameters", BAD_REQUEST));
  })();
};

export const handleCampaignGet = (req: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const allCampaigns = await prisma.campaign_twittercard.findMany({
        where: {
          owner_id: req.currentUser?.id,
        },
        orderBy: {
          id: "desc",
        },
      });
      return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(allCampaigns)));
    })();
  } catch (err) {
    next(new ErrorWithCode("Error while requesting records", INTERNAL_SERVER_ERROR));
  }
};

export const handleAddNewCampaign = (req: Request, res: Response, next: NextFunction) => {
  const { name, tweet_text, comment_reward, retweet_reward, like_reward, quote_reward, follow_reward, campaign_budget, media } = req.body;
  if (
    isEmpty(name) ||
    isEmpty(tweet_text) ||
    isEmpty(comment_reward) ||
    isEmpty(retweet_reward) ||
    isEmpty(like_reward) ||
    isEmpty(quote_reward) ||
    isEmpty(campaign_budget)
  ) {
    return res.status(BAD_REQUEST).json({ error: true, message: "Data felids should not be emphty." });
  }
  (async () => {
    try {
      const newCampaign = await prisma.campaign_twittercard.create({
        data: {
          name,
          tweet_text,
          comment_reward: convertToTinyHbar(comment_reward as string),
          like_reward: convertToTinyHbar(like_reward as string),
          retweet_reward: convertToTinyHbar(retweet_reward as string),
          quote_reward: convertToTinyHbar(quote_reward as string),
          campaign_budget: convertToTinyHbar(campaign_budget as string),
          card_status: "Pending",
          owner_id: req.currentUser?.id,
          amount_spent: 0,
          amount_claimed: 0,
        },
      });
      return res
        .status(OK)
        .json(JSONBigInt.parse(JSONBigInt.stringify(rmKeyFrmData(newCampaign, ["last_reply_checkedAt", "last_thread_tweet_id", "contract_id"]))));
    } catch (err) {
      console.log("Error from handleAddNewCampaign:::", err);
      next(new ErrorWithCode("Error while creating new campaign", INTERNAL_SERVER_ERROR));
    }
  })();
};

export const handleCampaignStats = (req: Request, res: Response, next: NextFunction) => {
  (async () => {
    try {
      const card_id = req.body.card_id;
      const stats = await prisma.campaign_tweetstats.findUnique({
        where: { twitter_card_id: parseInt(card_id as string) },
      });
      return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(stats)));
    } catch (err) {
      console.log("Error from handleCampaignStats:::", err);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      next(new ErrorWithCode("Error while requesting data", INTERNAL_SERVER_ERROR));
    }
  })();
};

export const checkCampaignBalances = (req: Request, res: Response, next: NextFunction) => {
  try {
    (async () => {
      const campaignId = req.query.campaignId as any as string;
      // console.log(typeof campaignId);
      const campaignDetails = await getCampaignDetailsById(parseInt(campaignId));
      if (campaignDetails?.user_user?.hedera_wallet_id) {
        const data = await queryCampaignBalance(campaignDetails.user_user.hedera_wallet_id, campaignDetails.id);
        return res.status(OK).json(data);
      }
      return res.status(BAD_REQUEST).json({ error: true, message: "Wallet address not found" });
    })();
  } catch {
    next(new ErrorWithCode("Error while checking balance", INTERNAL_SERVER_ERROR));
  }
};
