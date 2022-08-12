import { prisma } from "@shared/prisma";
import logger from "jet-logger";

//types

export interface TwitterStats {
  like_count?: number;
  retweet_count?: number;
  quote_count?: number;
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

const twitterCardStatus = async (cardId: bigint) => {
  console.info("twitterCardStatus::Start");
  const cardStatus = await prisma.campaign_tweetstats.findUnique({
    where: {
      twitter_card_id: cardId,
    },
  });
  return cardStatus;
};

const updateTwitterCardStats = async (body: TwitterStats, cardId: bigint | number) => {
  console.info("updateTwitterCardStats::start");

  const update = await prisma.campaign_tweetstats.update({
    where: { twitter_card_id: cardId },
    data: {
      like_count:body.like_count??0,
      quote_count:body.quote_count??0,
      retweet_count:body.retweet_count??0
    },
  });
  return update.id
};

const addNewCardStats = async(body:TwitterStats , cardId: bigint | number) => {

  console.info("addNewCardStats::start");

  const addNewStats = prisma.campaign_tweetstats.create({
    data:{
      twitter_card_id:cardId,
      like_count:body.like_count??0,
      quote_count:body.quote_count??0,
      retweet_count:body.retweet_count??0,
      last_update: new Date().toISOString()
    }
  })

  return addNewStats;
} 

export default {
  allActiveTwitterCard,
  twitterCardStatus,
  updateTwitterCardStats,
  addNewCardStats
} as const;
