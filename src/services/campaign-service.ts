import { campaign_twittercard } from "@prisma/client";
import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import logger from "jet-logger";
import moment from "moment";
import { scheduleJob } from "node-schedule";
import { twitterStatus } from "src/@types/custom";
import { updateAllEngagementsForCard, updateRepliesToDB } from "./engagement-servide";
import { SendRewardsForTheUsersHavingWallet } from "./reward-service";
import { queryBalance } from "./smartcontract-service";
import { closeCampaignSMTransaction } from "./transaction-service";
import userService from "./user-service";

export const getCampaignDetailsById = async (campaignId: number | bigint) => {
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

export const incrementClaimAmount = async (cardId: number | bigint, amount: number) => {
  return await prisma.campaign_twittercard.update({
    where: { id: cardId },
    data: {
      amount_claimed: {
        increment: amount,
      },
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
  const { id, name, tweet_id, last_thread_tweet_id } = card;
  const card_owner = await prisma.user_user.findUnique({ where: { id: card.owner_id! } });

  if (card_owner && card_owner.business_twitter_access_token && card_owner.business_twitter_access_token_secret) {
    logger.info(`close campaign operation:::start For id: ${id} and NAME:: ${name ?? ""}`);

    //?1. Fetch all the Replies left ot fetch from last cron task.
    const [commentsUpdates, isEngagementUpdated] = await Promise.all([await updateRepliesToDB(id, tweet_id!), await updateAllEngagementsForCard(card)]);

    const campaignExpiry = moment().add(parseFloat(process.env.REWARD_CALIM_HOUR!), "hours").toISOString();
    //log campaign expiry
    logger.info(`Campaign expired at ${campaignExpiry}`);

    const tweeterApi = twitterAPI.tweeterApiForUser({
      accessToken: card_owner.business_twitter_access_token,
      accessSecret: card_owner.business_twitter_access_token_secret,
    });

    try {
      const updateThread = await tweeterApi.v2.reply(
        // eslint-disable-next-line max-len
        `Campaign ended at ${moment().toLocaleString()}✅\n Rewards being distributed \n 🚨first time user🚨please login to @hbuzzs and connect your HashPack wallet to receive your rewards.`,
        last_thread_tweet_id!
      );

      await Promise.all([
        //update Status in campaign cards
        await prisma.campaign_twittercard.update({
          where: {
            id: card.id,
          },
          data: {
            campaign_expiry: campaignExpiry,
            card_status: "Completed",
            last_thread_tweet_id: updateThread.data.id,
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
          username: true,
          personal_twitter_id: true,
          personal_twitter_handle: true,
          business_twitter_access_token: true,
          business_twitter_access_token_secret: true,
          hedera_wallet_id: true,
          available_budget: true,
        },
      },
    },
  });
  const { user_user, name, tweet_id, owner_id, campaign_budget, amount_claimed, last_thread_tweet_id } = campaignDetails!;
  if (user_user?.business_twitter_access_token && user_user?.business_twitter_access_token_secret && user_user.personal_twitter_id) {
    const userTweeterApi = twitterAPI.tweeterApiForUser({
      accessToken: user_user?.business_twitter_access_token,
      accessSecret: user_user?.business_twitter_access_token_secret,
    });
    await closeCampaignSMTransaction(id);

    //?? Query and update campaigner balance after closing campaign.
    const balances = await queryBalance(user_user.hedera_wallet_id!);
    if (owner_id && balances?.balances) await userService.topUp(owner_id, parseInt(balances.balances), "update");

    try {
      await userTweeterApi.v2.reply(
        `Reward distribution is ended 🎉.\n At ${moment().toLocaleString()}\nTotal ${(amount_claimed! / 1e8).toFixed(4)} ℏ rewarded for this campaign`,
        last_thread_tweet_id!
      );
      await twitterAPI.sendDMFromHashBuzz(
        user_user.personal_twitter_id,
        // eslint-disable-next-line max-len
        `Greetings @${user_user.personal_twitter_handle!}\nThis is for your information only\n————————————\nCampaign: ${name!}\nStatus: Archived\nRewarded: ${(
          (amount_claimed! / Math.round(campaign_budget!)) *
          100
        ).toFixed(2)}% of campaign budget*`
      );
    } catch (error) {
      logger.err(error.message);
    }
  }
}
