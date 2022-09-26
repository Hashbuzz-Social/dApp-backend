import prisma from "@shared/prisma";
import { campaign_twittercard } from "@prisma/client";
import { twitterStatus } from "src/@types/custom";
import { updateAllEngagementsForCard, updateRepliesToDB } from "./engagement-servide";
import logger from "jet-logger";
import moment from "moment";
import twitterAPI from "@shared/twitterAPI";
import { scheduleJob } from "node-schedule";
import { SendRewardsForTheUsersHavingWallet } from "./reward-service";

export const getCampaignDetailsById = async (campaignId: number) => {
  return await prisma.campaign_twittercard.findUnique({
    where: {
      id: campaignId,
    },
    include: {
      user_user: {
        select: {
          hedera_wallet_id: true,
          available_budget: true,
        },
      },
    },
  });
};

export const getRunningCardsOfUserId = async (userId: number | bigint) => {
  return await prisma.campaign_twittercard.findFirst({
    where: {
      owner_id: userId,
      card_status: "Running",
    },
  });
};

export const updateCampaignStatus = async (campaignId: number | bigint, status: twitterStatus) => {
  return await prisma.campaign_twittercard.update({
    where: {
      id: campaignId,
    },
    data: {
      card_status: status,
    },
  });
};

/******
 *@description Sole function for closing the campaign end to end.
 * 1. Get all campaign engagement from tweeter and update in to local DB.
 * 2. Sending a reply threat to the campaign about closing of the camp.
 * 3. Schedule expiry operation for campaign;
 * 4. Distribute the amounts for the users which have already wallet connected.
 */

export const completeCampaignOperation = async (card: campaign_twittercard) => {
  const { id, name, tweet_id } = card;
  const card_owner = await prisma.user_user.findUnique({ where: { id: card.owner_id! } });

  if (card_owner && card_owner.business_twitter_access_token && card_owner.business_twitter_access_token_secret) {
    logger.info(`close campaign operation:::start For id: ${id} and NAME:: ${name ?? ""}`);

    //?1. Fetch all the Replies left ot fetch from last cron task.
    const [commetsUpdates, isEngagementUpdated] = await Promise.all([
      await updateRepliesToDB(id, parseInt(tweet_id!)),
      await updateAllEngagementsForCard(card),
    ]);

    const campaignExpiry = moment().add(24, "hours").toISOString();
    //log campaign expiry
    logger.info(`Campaign expired at ${campaignExpiry}`);

    const tweeterApi = twitterAPI.tweeterApiForUser({
      accessToken: card_owner.business_twitter_access_token,
      accessSecret: card_owner.business_twitter_access_token_secret,
    });

    try {
      await Promise.all([
        //update Status in campaign cards
        await prisma.campaign_twittercard.update({
          where: {
            id: card.id,
          },
          data: {
            campaign_expiry: campaignExpiry,
            card_status: "Completed",
          },
        }),
        await prisma.campaign_tweetengagements.updateMany({
          where: {
            tweet_id: card.id.toString(),
          },
          data: {
            exprired_at: campaignExpiry,
          },
        }),
        //2. Replying to threat.
        await tweeterApi.v2.reply(
          `Campaign ended ✅ \n Rewards being distributed \n 🚨first timer🚨please login to hashbuzz and connect your HashPack wallet to receive your rewards.
      \n ad<create your own campaign @hbuzzs>`,
          tweet_id!
        ),

        //startDistributing Rewards
        await SendRewardsForTheUsersHavingWallet(card.id),
      ]);
    } catch (e) {
      console.log(e);
    }

    const date = new Date(campaignExpiry);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    scheduleJob(date, function () {
      const cardId = id;
      perFormCampaignExpiryOperation(cardId);
    });
  }

  return { message: "done" };
};

export async function perFormCampaignExpiryOperation(id: number | bigint) {
  const campaignDetails = await prisma.campaign_twittercard.findUnique({
    where: { id },
    include: {
      user_user: {
        select: {
          business_twitter_access_token: true,
          business_twitter_access_token_secret: true,
          hedera_wallet_id: true,
          available_budget: true,
        },
      },
    },
  });
  if (campaignDetails?.user_user?.business_twitter_access_token && campaignDetails?.user_user?.business_twitter_access_token_secret) {
    const tweeterApi = twitterAPI.tweeterApiForUser({
      accessToken: campaignDetails?.user_user?.business_twitter_access_token,
      accessSecret: campaignDetails?.user_user?.business_twitter_access_token_secret,
    });

    tweeterApi.v2.reply(`Campaign reward claiming for this tweet is closed✅.\n \n ad<create your own campaign @hbuzzs>`, campaignDetails.tweet_id!);
  }
}
