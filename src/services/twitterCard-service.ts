import { convertTinyHbarToHbar } from "@shared/helper";
import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import { provideActiveContract } from "./smartcontract-service";

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
  console.info("allActiveTwitterCard::start");
  const allActiveCards = await prisma.campaign_twittercard.findMany({
    where: {
      card_status: "Running",
    },
  });
  return allActiveCards;
};

const twitterCardStats = async (cardId: bigint) => {
  console.info("twitterCardStatus::Start");
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
  console.info("addNewCardStats::start::withData", JSON.stringify(body));

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
            business_twitter_access_token: true,
            business_twitter_access_token_secret: true,
          },
        },
      },
    }),
  ]);

  const { id, tweet_text, user_user, like_reward, quote_reward, retweet_reward, comment_reward } = cardDetails!;
  const { contract_id } = contractDetails;

  if (
    tweet_text &&
    user_user?.business_twitter_access_token &&
    user_user?.business_twitter_access_token_secret &&
    contract_id &&
    like_reward &&
    quote_reward &&
    comment_reward &&
    retweet_reward
  ) {
    const threat1 = tweet_text;
    //@ignore es-lint
    // eslint-disable-next-line max-len
    const threat2 = `Campaign started 💥\nEngage with the main tweet to get rewarded with $hbars.The reward scheme: like ${convertTinyHbarToHbar(
      like_reward
    ).toFixed(2)} ℏ, retweet ${convertTinyHbarToHbar(retweet_reward).toFixed(2)} ℏ, quote ${convertTinyHbarToHbar(quote_reward).toFixed(
      2
    )} ℏ, comment ${convertTinyHbarToHbar(comment_reward).toFixed(2)} ℏ\nad<create your own campaign @hbuzzs>`;
    const userTwitter = twitterAPI.tweeterApiForUser({
      accessToken: user_user?.business_twitter_access_token,
      accessSecret: user_user?.business_twitter_access_token_secret,
    });
    console.log({ threat1, threat2 });
    //Post tweets to the tweeter;
    try{
      const card = await userTwitter.v2.tweet(threat1);
      const reply = await userTwitter.v2.reply(threat2, card.data.id);
      //tweetId.
      const tweetId = card.data.id;
      const lastThreadTweetId = reply.data.id;

      //Add TweetId to the DB
      await prisma.campaign_twittercard.update({
        where: { id },
        data: {
          tweet_id: tweetId,
          last_thread_tweet_id: lastThreadTweetId,
          card_status: "Running",
          contract_id: contract_id.toString().trim(),
        },
      });
      return tweetId;
    }catch(err){
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      console.log(err); 
      console.log(err.message);
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
