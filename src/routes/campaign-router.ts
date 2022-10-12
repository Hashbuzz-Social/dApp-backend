import { completeCampaignOperation, getCampaignDetailsById, getRunningCardsOfUserId, updateCampaignStatus } from "@services/campaign-service";
import { queryCampaignBalance } from "@services/smartcontract-service";
import { allocateBalanceToCampaign } from "@services/transaction-service";
import twitterCardService from "@services/twitterCard-service";
import userService from "@services/user-service";
import { convertToTinyHbar, sensitizeUserData } from "@shared/helper";
import prisma from "@shared/prisma";
import { checkErrResponse } from "@validator/userRoutes.validator";
import { Request, Response, Router } from "express";
import { body, query as validateQuery } from "express-validator";
import statuses from "http-status-codes";
import JSONBigInt from "json-bigint";
import { isEmpty } from "lodash";

const router = Router();
const { OK, BAD_REQUEST, CONFLICT } = statuses;
const campaignStatuses = ["rejected", "running", "completed", "deleted"];
router.post("/update-status", body("card_id").isNumeric(), body("card_status").isIn(campaignStatuses), checkErrResponse, statusUpdateHandler);

router.get("/all", handleCampaignGet);
router.post("/add-new", handleAddNewCampaign);
router.post("/stats", body("card_id").isNumeric(), checkErrResponse, handleCampaignStats);

router.get("/balance", validateQuery("campaignId").isNumeric(), checkErrResponse, (_: Request, res: Response) => {
  (async () => {
    const campaignId = _.query.campaignId as any as string;
    // console.log(typeof campaignId);
    const campaignDetails = await getCampaignDetailsById(parseInt(campaignId));
    if (campaignDetails?.user_user?.hedera_wallet_id) {
      const data = await queryCampaignBalance(campaignDetails.user_user.hedera_wallet_id, campaignDetails.id);
      return res.status(OK).json(data);
    }
    return res.status(BAD_REQUEST).json({ error: true, message: "Wallet address not found" });
  })();
});

// router.post("/send-rewards", body("campaignId").isNumeric(), checkErrResponse, async (_: Request, res: Response) => {
//   const campaignId: number = _.body.campaignId;
//   await SendRewardsForTheUsersHavingWallet(campaignId);
//   return res.status(OK).json({ success: true, message: "reward Distributed" });
// });

// router.post("/expirytest", body("campaignId").isNumeric(), checkErrResponse, async (_: Request, res: Response) => {
//   const id:string = _.body.campaignId;
//   // const data = await SendRewardsForTheUsersHavingWallet(id);
//   const cardDetails = await getCampaignDetailsById(parseInt(id.toString()));
//   if(cardDetails?.id) await closeCampaignSMTransaction(cardDetails.id);
//   return res.status(OK).json({message:"done"});
// });

function statusUpdateHandler(req: Request, res: Response) {
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
        return res.status(CONFLICT).json({ error: true, message: "Insufficient fund." });

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

    return res.status(BAD_REQUEST).json({ error: true, message: "Something went wrong." });
  })();
}

function handleCampaignGet(req: Request, res: Response) {
  (async () => {
    const allCampaigns = await prisma.campaign_twittercard.findMany({
      where: {
        owner_id: req.currentUser?.id,
      },
    });
    return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(allCampaigns)));
  })();
}

function handleAddNewCampaign(req: Request, res: Response) {
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
          amount_spent:0,
          amount_claimed:0
        },
      });
      return res.status(OK).json(JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(newCampaign))));
    } catch (err) {
      console.log("Error from handleAddNewCampaign:::", err);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw Error(err.message);
    }
  })();
}

function handleCampaignStats(req: Request, res: Response) {
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
      throw Error(err.message);
    }
  })();
}

export default router;
