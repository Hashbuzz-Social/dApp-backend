/* eslint-disable max-len */
import { convertTinyHbarToHbar } from "@shared/helper";
import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import { provideActiveContract } from "./smartcontract-service";
import { decrypt } from "@shared/encryption";
import moment from "moment";

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

  const { id, tweet_text, user_user, like_reward, quote_reward, retweet_reward, comment_reward, type, media, fungible_token_id, decimals } = cardDetails!;
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
    let threat1;
    if(media[0]) {
      threat1 = `${tweet_text} ${media[0]}`;
    }else {
      threat1 = `${tweet_text}`;
    }

    const token = await prisma.whiteListedTokens.findUnique({where: {token_id: String(fungible_token_id)}})
    //@ignore es-lint
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
        
    const threat2Hbar = `Promo initiated on ${formattedDate}. Interact with the primary tweet to earn rewards in HBAR: like ${convertTinyHbarToHbar(
      like_reward
    ).toFixed(2)}, repost ${convertTinyHbarToHbar(retweet_reward).toFixed(2)}, quote ${convertTinyHbarToHbar(quote_reward).toFixed(
      2
    )}, reply ${convertTinyHbarToHbar(comment_reward).toFixed(2)}.` 

    const threat2Fungible = `Promo initiated on ${formattedDate}. Interact with the primary tweet to earn rewards in ${token?.token_symbol}: ${
  (like_reward / (10 ** Number(decimals)))
    .toFixed(2)}, repost ${(retweet_reward  / (10 ** Number(decimals))).toFixed(2)}, quote ${(quote_reward  / (10 ** Number(decimals))).toFixed(
      2
    )}, reply ${(comment_reward / (10 ** Number(decimals))).toFixed(2)}.` 

    const userTwitter = twitterAPI.tweeterApiForUser({
      accessToken: decrypt(user_user?.business_twitter_access_token),
      accessSecret: decrypt(user_user?.business_twitter_access_token_secret),
    });

    // console.log({ threat1, threat2Hbar });
    //Post tweets to the tweeter;
    try {
      // const mediaId = dataResp.data.media_id_string;
    
      const rwClient = userTwitter.readWrite;
      // console.log(rwClient)
      // console.log(threat1)
      const card = await rwClient.v2.tweet(threat1);
      // await rwClient.v2.reply(media, card.data.id);

      let reply;
      if(type === "HBAR") {
        reply = await rwClient.v2.reply(threat2Hbar, card.data.id);
      } else if(type === "FUNGIBLE") {
        reply = await rwClient.v2.reply(threat2Fungible, card.data.id);
      }
      //tweetId.

      // const mediaData = await userTwitter.uploadMedia({
      //   mediaUrl: media[0],
      // });
    
      // const mediaId = media.media_id_string;
    
      const tweetId = card.data.id;
      const lastThreadTweetId = reply?.data.id;

      //Add TweetId to the DB
      await prisma.campaign_twittercard.update({
        where: { id },
        data: {
          tweet_id: tweetId,
          last_thread_tweet_id: lastThreadTweetId,
          card_status: "Running",
          campaign_start_time: new Date().toISOString(),
          campaign_close_time: new Date(new Date().setMinutes(new Date().getMinutes() + 15)).toISOString()
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

const getAllTwitterCardPendingCards = async () => {
  const data = await prisma.campaign_twittercard.findMany({
    where: {
      approve: false,
      isRejected:null,
    },
  });

  return data;
};


const updateStatus = async (id:number, status:boolean) => {
  const data = await prisma.campaign_twittercard.findUnique({
    where: {
      id,
    },
  });

  if(data?.card_status === "Under Review") {
    if(status === true) {
      const data = await prisma.campaign_twittercard.update({
        where: {
          id,
        },
        data:{
          approve: true,
          isRejected: false,
          card_status:"Campaign Active"
        }
      });
      
      return data;
    } else if(status === false){
      const data = await prisma.campaign_twittercard.update({
        where: {
          id,
        },
        data:{
          isRejected: true,
          card_status:"Campaign Declined"
        }
      });
    
      return data;
    }
  }
};


export default {
  allActiveTwitterCard,
  twitterCardStats,
  updateTwitterCardStats,
  addNewCardStats,
  updateTotalSpentAmount,
  publishTwitter,
  getAllTwitterCardByStatus,
  getAllTwitterCardPendingCards,
  updateStatus
} as const;
