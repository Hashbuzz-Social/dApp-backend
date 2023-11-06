/* eslint-disable max-len */
import { convertTinyHbarToHbar } from "@shared/helper";
import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import { provideActiveContract } from "./smartcontract-service";
import { decrypt } from "@shared/encryption";

//types

export interface TwitterStats {
  like_count?: number;
  retweet_count?: number;
  quote_count?: number;
  reply_count?: number;
}

export interface RewardCatalog {
  retweet_reward: number;
  like_reward: number;
  quote_reward: number;
  reply_reward: number;
}

export const allActiveTwitterCard = async () => {
  // console.info("allActiveTwitterCard::start");
  const allActiveCards = await prisma.campaign_twittercard.findMany({
    where: {
      card_status: "Running",
    },
  });
  return allActiveCards;
};

const twitterCardStats = async (cardId: bigint) => {
  // console.info("twitterCardStatus::Start");
  const cardStatus = await prisma.campaign_tweetstats.findUnique({
    where: {
      twitter_card_id: cardId,
    },
  });
  return cardStatus;
};

const updateTwitterCardStats = async (body: TwitterStats, cardId: bigint | number) => {
  console.log("updateTwitterCardStats::withData", JSON.stringify(body));
  // {"like_count":3,"quote_count":0,"retweet_count":2,"reply_count":2};
  const { like_count, quote_count, reply_count, retweet_count } = body;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument

  const update = await prisma.campaign_tweetstats.upsert({
    where: { twitter_card_id: cardId },
    update: {
      like_count: like_count,
      quote_count: quote_count,
      reply_count: reply_count,
      retweet_count: retweet_count,
      last_update: new Date().toISOString(),
    },
    create: {
      like_count: like_count,
      quote_count: quote_count,
      reply_count: reply_count,
      retweet_count: retweet_count,
      twitter_card_id: cardId,
      last_update: new Date().toISOString(),
    },
  });
  return update.id;
};

const addNewCardStats = async (body: TwitterStats, cardId: bigint | number) => {
  // console.info("addNewCardStats::start::withData", JSON.stringify(body));

  const data: any = {};
  if (body.like_count) data["like_count"] = body.like_count;
  if (body.quote_count) data["quote_count"] = body.quote_count;
  if (body.retweet_count) data["retweet_count"] = body.retweet_count;

  const addNewStats = prisma.campaign_tweetstats.create({
    data: {
      ...data,
      twitter_card_id: cardId,
      last_update: new Date().toISOString(),
    },
  });

  return addNewStats;
};

const updateTotalSpentAmount = async (id: number | bigint, amount_spent: number) => {
  const updateTotalSpentBudget = await prisma.campaign_twittercard.update({
    where: { id },
    data: {
      amount_spent,
    },
  });
  return updateTotalSpentBudget;
};

/**
 *@description Create twitter tweet if the card is in pending state and then update the status.
 */

const publishTwitter = async (cardId: number | bigint) => {
  const [contractDetails, cardDetails] = await Promise.all([
    await provideActiveContract(),
    await prisma.campaign_twittercard.findUnique({
      where: { id: cardId },
      include: {
        user_user: {
          select: {
            twitter_access_token: true,
            twitter_access_token_secret: true,
            business_twitter_access_token: true,
            business_twitter_access_token_secret: true,

          },
        },
      },
    }),
  ]);

  const { id, tweet_text, user_user, like_reward, quote_reward, retweet_reward, comment_reward, type, media } = cardDetails!;
  const contract_id = contractDetails?.contract_id;

  if (
    tweet_text &&
    user_user?.business_twitter_access_token &&
    user_user?.business_twitter_access_token_secret &&
    user_user?.twitter_access_token &&
    user_user?.twitter_access_token_secret &&
    contract_id &&
    like_reward &&
    quote_reward &&
    comment_reward &&
    retweet_reward
  ) {
    const threat1 = tweet_text;
    //@ignore es-lint
    // eslint-disable-next-line max-len
    const year = new Date().getFullYear();
    const month = new Date().getMonth();
    const date = new Date().getDate();

    const hours = new Date().getHours();
    const second = new Date().getSeconds();
    const minutes = new Date().getMinutes();	

    const threat2Hbar = `Campaign initiated 💥 on ${date}/${month}/${year} at  ${hours}:${minutes}:${second} GMT+0530. Interact with the primary tweet to earn $hbars: like ${convertTinyHbarToHbar(
      like_reward
    ).toFixed(2)} ℏ, retweet ${convertTinyHbarToHbar(retweet_reward).toFixed(2)} ℏ, quote ${convertTinyHbarToHbar(quote_reward).toFixed(
      2
    )} ℏ, comment ${convertTinyHbarToHbar(comment_reward).toFixed(2)} ℏ<Advertise your own campaign via @hbuzzs>`;

    const threat2Fungible = `Campaign initiated 💥 on ${date}/${month}/${year} at  ${hours}:${minutes}:${second} GMT+0530. Interact with the primary tweet to earn $hbars: like ${like_reward} ℏ, retweet ${retweet_reward} ℏ, quote ${quote_reward} ℏ, comment ${comment_reward} ℏ<Advertise your own campaign via @hbuzzs>`;


    const userTwitter = twitterAPI.tweeterApiForUser({
      accessToken: decrypt(user_user?.business_twitter_access_token),
      accessSecret: decrypt(user_user?.business_twitter_access_token_secret),
    });
    // console.log({ threat1, threat2Hbar });
    //Post tweets to the tweeter;
    try {
      const rwClient = userTwitter.readWrite;
      console.log(rwClient)
      console.log(threat1)
      const card = await rwClient.v2.tweet(threat1);
      // await rwClient.v2.reply(media, card.data.id);

      let reply;
      if(type === "HBAR") {
        reply = await rwClient.v2.reply(threat2Hbar, card.data.id);
      } else if(type === "FUNGIBLE") {
        reply = await rwClient.v2.reply(threat2Fungible, card.data.id);
      }
      //tweetId.
      const tweetId = card.data.id;
      const lastThreadTweetId = reply?.data.id;

      //Add TweetId to the DB
      await prisma.campaign_twittercard.update({
        where: { id },
        data: {
          tweet_id: tweetId,
          last_thread_tweet_id: lastThreadTweetId,
          card_status: "Running",
          contract_id: `${contract_id.toString()}`,
        },
      });
      return tweetId;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      console.log(err);
      // console.log(err.message);
      throw Error("Something wrong with tweet text.");
    }
  } else {
    throw Error("User's brand handle not found");
  }
};

const getAllTwitterCardByStatus = async (status: string) => {
  const data = await prisma.campaign_twittercard.findMany({
    where: {
      card_status: status,
    },
    include: {
      user_user: {
        select: {
          business_twitter_handle: true,
          personal_twitter_handle: true,
          available_budget: true,
          hedera_wallet_id: true,
        },
      },
    },
    orderBy: {
      id: "desc",
    },
  });

  return data;
};

export default {
  allActiveTwitterCard,
  twitterCardStats,
  updateTwitterCardStats,
  addNewCardStats,
  updateTotalSpentAmount,
  publishTwitter,
  getAllTwitterCardByStatus,
} as const;
