import twitterAPI from "@shared/twitterAPI";
import prisma from "@shared/prisma";
import { campaign_twittercard } from "@prisma/client";
import moment from "moment";

export type engagements = "Like" | "Retweet" | "Reply" | "Quote";

const getExistingRecordsIdsIfAny = async (id: string, engagement_type: engagements) => {
  const existingRecordsIfAny = await prisma.campaign_tweetengagements.findMany({
    where: {
      tweet_id: id,
      engagement_type,
    },
    select: {
      user_id: true,
      tweet_id: true,
      engagement_type: true,
    },
  });
  const allIds = existingRecordsIfAny.map((d) => d.user_id);
  return allIds;
};

export const updateRepliesToDB = async (id: number | bigint, tweet_Id: number | string) => {
  const [allReplies, allExistingReplyEngagements] = await Promise.all([
    await twitterAPI.getAllReplies(`${tweet_Id}`),
    await prisma.campaign_tweetengagements.findMany({
      where: {
        tweet_id: id.toString(),
        engagement_type: "Reply",
      },
      select: {
        user_id: true,
        tweet_id: true,
        engagement_type: true,
      },
    }),
  ]);
  const existingUserIds = allExistingReplyEngagements.map((d) => d.user_id);

  const formattedArray = allReplies.map((d) => ({
    user_id: d.author_id!,
    tweet_id: id.toString(),
    engagement_type: "Reply",
    updated_at: moment().toISOString(),
  }));
  const filterResult = formattedArray.filter((d) => {
    const isExisting = existingUserIds.includes(d.user_id);
    return !isExisting;
  });
  if (filterResult && filterResult.length > 0) {
    const updates = await prisma.campaign_tweetengagements.createMany({
      data: [...filterResult],
      skipDuplicates: true,
    });
    await prisma.campaign_twittercard.update({
      where: { id: parseInt(tweet_Id.toString()) },
      data: { last_reply_checkedAt: new Date().toISOString() },
    });
    return updates;
  } else return false;
};

export const updateAllEngagementsForCard = async (card: campaign_twittercard) => {
  const { tweet_id, id } = card;

  let isDone = false;

  const { likes, retweets, quotes } = await twitterAPI.getEngagementOnCard(tweet_id!);

  if (likes.length > 0) {
    const likesForDB = likes.map((d) => ({ user_id: d.id, tweet_id: id.toString(), engagement_type: "Like", updated_at: moment().toISOString() }));

    const existingUserIds = await getExistingRecordsIdsIfAny(id.toString(), "Like");
    const filterResult = likesForDB.filter((d) => {
      const isExisting = existingUserIds.includes(d.user_id);
      return !isExisting;
    });
    if (filterResult && filterResult.length > 0) {
      await prisma.campaign_tweetengagements.createMany({
        data: [...filterResult],
        skipDuplicates: true,
      });
      isDone = true;
    }
  }

  //Retweets lengths grater than 0;
  if (retweets.length > 0) {
    const retweetsForDB = retweets.map((d) => ({ user_id: d.id, tweet_id: id.toString(), engagement_type: "Retweet", updated_at: moment().toISOString() }));

    const existingUserIds = await getExistingRecordsIdsIfAny(id.toString(), "Retweet");
    const filterResult = retweetsForDB.filter((d) => {
      const isExisting = existingUserIds.includes(d.user_id);
      return !isExisting;
    });
    if (filterResult && filterResult.length > 0) {
      await prisma.campaign_tweetengagements.createMany({
        data: [...filterResult],
        skipDuplicates: true,
      });
      isDone = true;
    }
  }

  //Quotes lengths grater than > 0
  if (quotes.length > 0) {
    const quotesForDB = quotes.map((d) => ({ user_id: d.author_id, tweet_id: id.toString(), engagement_type: "Quote", updated_at: moment().toISOString() }));

    const existingUserIds = await getExistingRecordsIdsIfAny(id.toString(), "Quote");
    const filterResult = quotesForDB.filter((d) => {
      const isExisting = existingUserIds.includes(d.user_id!);
      return !isExisting;
    });
    if (filterResult && filterResult.length > 0) {
      await prisma.campaign_tweetengagements.createMany({
        data: [...filterResult],
        skipDuplicates: true,
      });
      isDone = true;
    }
  }
  return isDone;
};
