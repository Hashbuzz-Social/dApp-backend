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
  console.info("updateTwitterCardStats::withData", JSON.stringify(body));

  const data: any = {};
  if (body.like_count) data["like_count"] = body.like_count;
  if (body.quote_count) data["quote_count"] = body.quote_count;
  if (body.retweet_count) data["retweet_count"] = body.retweet_count;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  if (Object.keys(data).length > 0) {
    const update = await prisma.campaign_tweetstats.update({
      where: { twitter_card_id: cardId },
      data: {
        ...data,
      },
    });
    return update.id;
  }
  return false;
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

  const { id, tweet_text, user_user } = cardDetails!;
  const { contract_id } = contractDetails;

  if (tweet_text && user_user?.business_twitter_access_token && user_user?.business_twitter_access_token_secret && contract_id) {
    const threat1 = tweet_text;
    //@ignore es-lint
    // eslint-disable-next-line max-len
    const threat2 = `Campaign started 💥\nEngage with the main tweet to get rewarded with $hbars. The reward scheme: \n like ${cardDetails?.like_reward ?? ""} ℏ \n retweet ${cardDetails?.retweet_reward ?? ""} ℏ \n quote ${cardDetails?.quote_reward ?? ""} ℏ \n comment ${cardDetails?.comment_reward ?? ""} ℏ \n ad<create your own campaign @hbuzzs>`;
    const userTwitter = twitterAPI.tweeterApiForUser({
      accessToken: user_user?.business_twitter_access_token,
      accessSecret: user_user?.business_twitter_access_token_secret,
    });
    console.log({threat1 , threat2})
    //Post tweets to the tweeter;
    const card = await userTwitter.v2.tweetThread([""+threat1, ""+threat2]);
    //tweetId.
    const tweetId = card[0].data.id;

    //Add TweetId to the DB
    await prisma.campaign_twittercard.update({
      where: { id },
      data: {
        tweet_id: tweetId,
        card_status: "Running",
        contract_id:contract_id.toString(),
      },
    });
    return tweetId;
  } else {
    throw new Error("User's brand handle not found");
  }
};

export default {
  allActiveTwitterCard,
  twitterCardStats,
  updateTwitterCardStats,
  addNewCardStats,
  updateTotalSpentAmount,
  publishTwitter,
} as const;
