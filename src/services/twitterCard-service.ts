import prisma from "@shared/prisma";

//types

export interface TwitterStats {
  like_count?: number;
  retweet_count?: number;
  quote_count?: number;
  reply_count?:number
}

export interface RewardCatalog {
  retweet_reward: number;
  like_reward: number;
  quote_reward: number;
  reply_reward:number
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
  if(Object.keys(data).length > 0){
    const update = await prisma.campaign_tweetstats.update({
      where: { twitter_card_id: cardId },
      data: {
        ...data,
      },
    });
    return update.id;
  } 
  return false
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
  const updateTotalSpentBudget = await  prisma.campaign_twittercard.update({
    where: { id },
    data: {
      amount_spent,
    },
  });
  return updateTotalSpentBudget;
};

export default {
  allActiveTwitterCard,
  twitterCardStats,
  updateTwitterCardStats,
  addNewCardStats,
  updateTotalSpentAmount,
} as const;
