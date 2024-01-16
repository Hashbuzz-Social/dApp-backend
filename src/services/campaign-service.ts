/* eslint-disable max-len */
import { campaign_twittercard } from "@prisma/client";
import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import logger from "jet-logger";
import moment from "moment";
import { scheduleJob } from "node-schedule";
import { twitterStatus } from "src/@types/custom";
import { updateAllEngagementsForCard, updateRepliesToDB } from "./engagement-servide";
// import { SendRewardsForTheUsersHavingWallet } from "./reward-service";
import { queryBalance, queryFungibleBalance } from "./smartcontract-service";
import { closeCampaignSMTransaction } from "./transaction-service";
import userService from "./user-service";
import { decrypt } from "@shared/encryption";
import { closeFungibleAndNFTCampaign, expiryCampaign, expiryFungibleCampaign } from "./contract-service";

export const getCampaignDetailsById = async (campaignId: number | bigint) => {
  return await prisma.campaign_twittercard.findUnique({
    where: {
      id: campaignId,
    },
    include: {
      user_user: {
        select: {
          id:true,
          hedera_wallet_id: true,
          available_budget: true,
          business_twitter_access_token: true,
          business_twitter_access_token_secret: true,
          personal_twitter_id: true,
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

const currentDate = new Date();
const formattedDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
}).format(currentDate);

export const completeCampaignOperation = async (card: campaign_twittercard) => {
  const { id, name, tweet_id, last_thread_tweet_id, type, fungible_token_id, contract_id } = card;
  const card_owner = await prisma.user_user.findUnique({ where: { id: card.owner_id! } });

  if (card_owner && card_owner.business_twitter_access_token && card_owner.business_twitter_access_token_secret) {
    console.log(`close campaign operation:::start For id: ${id} and NAME:: ${name ?? ""} ${contract_id}`);

    //?1. Fetch all the Replies left ot fetch from last cron task.
    // const [commentsUpdates, isEngagementUpdated] = await Promise.all([await updateRepliesToDB(id, tweet_id!), await updateAllEngagementsForCard(card)]);

    // console.log(commentsUpdates, isEngagementUpdated, "Fetch all the Replies");
    const campaignExpiry = moment().add(parseFloat(process.env.REWARD_CALIM_DURATION!), "minutes").toISOString();
    //log campaign expiry
    console.log(`Campaign expired at ${campaignExpiry}`);
    const tweeterApi = twitterAPI.tweeterApiForUser({
      accessToken: decrypt(card_owner.business_twitter_access_token),
      accessSecret: decrypt(card_owner.business_twitter_access_token_secret),
    });
    
    if(type === "HBAR" && contract_id) {
      try {
        const date = new Date().toUTCString();

    //?1. Fetch all the Replies left ot fetch from last cron task.
    // const [commentsUpdates, isEngagementUpdated] = await Promise.all([await updateRepliesToDB(id, tweet_id!), await updateAllEngagementsForCard(card)]);

    // console.log(commentsUpdates, isEngagementUpdated, "Fetch all the Replies");
    const campaignExpiry = moment().add(parseFloat(process.env.REWARD_CALIM_DURATION!), "minutes").toISOString();
    //log campaign expiry

        const updateThread = await tweeterApi.v2.reply(
          // eslint-disable-next-line max-len
          `Promo concluded on ${formattedDate}. Rewards are now being allocated. First-time users: log in to https://testnet.hashbuzz.social to claim your rewards.`,  
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
              card_status: "Campaign Complete, Initiating Rewards",
              last_thread_tweet_id: updateThread.data.id,
            },
          }),
          await prisma.campaign_tweetengagements.updateMany({
            where: {
              tweet_id: card.id,
            },
            data: {
              exprired_at: campaignExpiry,
            },
          }),
          //startDistributing Rewards
          await closeCampaignSMTransaction(card.id, contract_id),
          // await SendRewardsForTheUsersHavingWallet(card.id, contract_id),
        ]);
      } catch (e) {
        console.log(e);
      }

      const date = new Date(campaignExpiry);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      scheduleJob(date, function () {
        const cardId = id;
        perFormCampaignExpiryOperation(cardId, contract_id);
      });
  
    } else if(type === "FUNGIBLE" && contract_id) {
      try {
        const date = new Date().toUTCString();

        const updateThread = await tweeterApi.v2.reply(
          // eslint-disable-next-line max-len
          `Promo concluded on ${formattedDate}. Rewards are now being allocated. First-time users: log in to https://testnet.hashbuzz.social to claim your rewards.`,  
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
              card_status: "Campaign Complete, Initiating Rewards",
              last_thread_tweet_id: updateThread.data.id,
            },
          }),
          await prisma.campaign_tweetengagements.updateMany({
            where: {
              tweet_id: card.id,
            },
            data: {
              exprired_at: campaignExpiry,
            },
          }),
          // st?artDistributing Rewards
          await closeFungibleAndNFTCampaign(fungible_token_id, card_owner.hedera_wallet_id, contract_id),
        //  await SendRewardsForTheUsersHavingWallet(card.id, contract_id),
        ]);
      } catch (e) {
        console.log(e);
      }

      const date = new Date(campaignExpiry);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      scheduleJob(date, function () {
        const cardId = id;
        perFormCampaignExpiryOperation(cardId, contract_id);
      });

    }

  }

  return { message: "Campaign is closed" };
};

export async function perFormCampaignExpiryOperation(id: number | bigint, contract_id:string) {
  console.log("perFormCampaignExpiryOperation")

  const campaignDetails = await prisma.campaign_twittercard.findUnique({
    where: { id },
    include: {
      user_user: {
        select: {
          personal_twitter_id: true,
          personal_twitter_handle: true,
          business_twitter_access_token: true,
          business_twitter_access_token_secret: true,
          hedera_wallet_id: true,
          available_budget: true,
          id:true,
        },
      },
    },
  });

  await prisma.campaign_twittercard.update({
    where: {
      id,
    },
    data: {
      card_status: "Rewards Disbursed",
    },
  });

  const { user_user, name, tweet_id, owner_id, campaign_budget, amount_claimed, last_thread_tweet_id, type, amount_spent, decimals, fungible_token_id } = campaignDetails!;
  if (user_user?.business_twitter_access_token && user_user?.business_twitter_access_token_secret && user_user.personal_twitter_id) {
    const userTweeterApi = twitterAPI.tweeterApiForUser({
      accessToken: decrypt(user_user?.business_twitter_access_token),
      accessSecret: decrypt(user_user?.business_twitter_access_token_secret),
    });
    // await closeCampaignSMTransaction(id);
    if(type === "HBAR") {
      await expiryCampaign(id, contract_id)

      const balances = await queryBalance(user_user.hedera_wallet_id!);
      if (owner_id && balances?.balances) await userService.topUp(owner_id, parseInt(balances.balances), "update");
  
      try {
        await userTweeterApi.v2.reply(
          `Reward allocation concluded on ${formattedDate}. A total of ${(amount_spent / 1e8).toFixed(2)} HBAR was given out for this promo.`,
          last_thread_tweet_id!
        );
        // await twitterAPI.sendDMFromHashBuzz(
        //   user_user.personal_twitter_id,
        //   // eslint-disable-next-line max-len, max-len
        //   `Greetings @${user_user.personal_twitter_handle!}\nThis is for your information only\n————————————\nCampaign: ${name!}\nStatus: Archived\nRewarded: ${(
        //     (amount_claimed! / Math.round(campaign_budget!)) *
        //     100
        //   ).toFixed(2)}% of campaign budget*`
        // );
      } catch (error) {
        logger.err(error.message);
      }
  
    } else if(type === "FUNGIBLE" && fungible_token_id) {
      await expiryFungibleCampaign(id, contract_id)

      const token = await prisma.whiteListedTokens.findUnique({where: {token_id: String(fungible_token_id)}})

      const balances = await queryFungibleBalance(user_user.hedera_wallet_id!, fungible_token_id);
      if(token) {
        const balanceRecord = await userService.updateTokenBalanceForUser({ amount:Number(balances), operation: "increment", token_id: token.id, decimal:Number(token.decimals), user_id:user_user.id });
      }

      // if (owner_id && balances?.balances) await userService.topUp(owner_id, parseInt(balances.balances), "update");
  
      try {
        await userTweeterApi.v2.reply(
          `Reward allocation concluded on ${formattedDate}. A total of ${(amount_spent / (10 ** Number(decimals))).toFixed(2)} ${token?.token_symbol} was given out for this promo.`,
          last_thread_tweet_id!
        );
      } catch (error) {
        logger.err(error.message);
      }
  
    }

    

    // ?? Query and update campaigner balance after closing campaign.
  }
}
