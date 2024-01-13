/* eslint-disable max-len */
import twitterAPI from "@shared/twitterAPI";
import prisma from "@shared/prisma";
import { campaign_twittercard, payment_status } from "@prisma/client";
import moment from "moment";
import logger from "jet-logger";
import { getCampaignDetailsById } from "./campaign-service";

export type engagements = "Like" | "Retweet" | "Reply" | "Quote";

const getExistingRecordsIdsIfAny = async (id: bigint, engagement_type: engagements) => {
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

export const updateRepliesToDB = async (id: bigint, tweet_Id: string) => {
  console.log("UpdateReplied to DB ");

  const data = await getCampaignDetailsById(id);
  // console.log(data, "data");

  // if (data?.user_user) {
  const [allReplies, allExistingReplyEngagements] = await Promise.all([
    await twitterAPI.getAllReplies(tweet_Id, data?.user_user?.business_twitter_access_token as string, data?.user_user?.business_twitter_access_token_secret as string),
    await prisma.campaign_tweetengagements.findMany({
      where: {
        tweet_id: id,
        engagement_type: "Reply",
      },
      select: {
        user_id: true,
        tweet_id: true,
        engagement_type: true,
      },
    }),
  ]);

  console.log(allReplies, allExistingReplyEngagements, "allReplies, allExistingReplyEngagements")

  const newAllReplies = [];

  for (let i = 0; i < allReplies.length; i++) {
    if (allReplies[i].author_id !== data?.user_user?.personal_twitter_id) {
      newAllReplies.push(allReplies[i]);
    }
  }

  const existingUserIds = allExistingReplyEngagements.length > 0 && allExistingReplyEngagements.map((d) => d.user_id!);

  let formattedArray = newAllReplies.map((d) => ({
    user_id: d.author_id!,
    tweet_id: id,
    engagement_type: "Reply",
    updated_at: moment().toISOString(),
  }));
  if (existingUserIds) {
    formattedArray = formattedArray.filter((d) => {
      const isExisting = existingUserIds.includes(d.user_id);
      return !isExisting;
    });
  }
  if (formattedArray && formattedArray.length > 0) {
    const updates = await prisma.campaign_tweetengagements.createMany({
      data: [...formattedArray],
      skipDuplicates: true,
    });

    // await prisma.campaign_tweetstats.upsert
    await prisma.campaign_tweetstats.upsert({
      where: { twitter_card_id: id },
      update: {
        reply_count: newAllReplies.length,
        last_update: new Date().toISOString(),
      },
      create: {
        reply_count: newAllReplies.length,
        twitter_card_id: id,
        last_update: new Date().toISOString(),
      },
    });


    await prisma.campaign_twittercard.update({
      where: { id: id },
      data: { last_reply_checkedAt: new Date().toISOString() },
    });
    return updates;
  } else return false;
  // }x
};

export const updateAllEngagementsForCard = async (card: number | bigint) => {

  const data = await getCampaignDetailsById(card);
  console.log(data, "data");
  // const { tweet_id, id } = data;
  if (data?.id && data?.tweet_id && data?.user_user) {

    let isDone = false;

    const details = data?.tweet_id!.toString();
    const { likes, retweets, quotes } = await twitterAPI.getEngagementOnCard(details, data?.user_user);
    console.log(likes, retweets, quotes);
    if (likes.length > 0) {
      const newLikes = [];

      for (let i = 0; i < likes.length; i++) {
        if (likes[i].id !== data.user_user.personal_twitter_id) {
          newLikes.push(likes[i]);
        }
      }

      await prisma.campaign_tweetstats.upsert({
        where: { twitter_card_id: data.id },
        update: {
          like_count: newLikes.length,
          last_update: new Date().toISOString(),
        },
        create: {
          like_count: newLikes.length,
          twitter_card_id: data.id,
          last_update: new Date().toISOString(),
        },
      });

      const likesForDB = newLikes.map((d) => ({ user_id: d.id, tweet_id: data?.id, engagement_type: "Like", updated_at: moment().toISOString() }));
      console.log(likesForDB, "LIKES")
      const existingUserIds = await getExistingRecordsIdsIfAny(data?.id, "Like");
      const filterResult = likesForDB.filter((d) => {
        const isExisting = existingUserIds.includes(d.user_id);
        return !isExisting;
      });
      console.log(filterResult, "Filter result of likes")

      if (filterResult && filterResult.length > 0) {
        console.log(filterResult)
        await prisma.campaign_tweetengagements.createMany({
          data: [...filterResult],
          // skipDuplicates: true,
        });

        // await prisma.campaign_twittercard.update({
        //   where: { id: card },
        //   data: { last_reply_checkedAt: new Date().toISOString() },
        // });

        isDone = true;
      }
    }

    //Retweets lengths grater than 0;
    if (retweets.length > 0) {
      const newRetweet = [];

      for (let i = 0; i < retweets.length; i++) {
        if (retweets[i].id !== data.user_user.personal_twitter_id) {
          newRetweet.push(retweets[i]);
        }
      }

      await prisma.campaign_tweetstats.upsert({
        where: { twitter_card_id: data.id },
        update: {
          retweet_count: newRetweet.length,
          last_update: new Date().toISOString(),
        },
        create: {
          retweet_count: newRetweet.length,
          twitter_card_id: data.id,
          last_update: new Date().toISOString(),
        },
      });

      const retweetsForDB = newRetweet.map((d) => ({ user_id: d.id, tweet_id: data?.id, engagement_type: "Retweet", updated_at: moment().toISOString() }));

      const existingUserIds = await getExistingRecordsIdsIfAny(data?.id, "Retweet");
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
      const newQuotes = [];

      for (let i = 0; i < quotes.length; i++) {
        if (quotes[i].id !== data.user_user.personal_twitter_id) {
          newQuotes.push(quotes[i]);
        }
      }

      await prisma.campaign_tweetstats.upsert({
        where: { twitter_card_id: data.id },
        update: {
          quote_count: newQuotes.length,
          last_update: new Date().toISOString(),
        },
        create: {
          quote_count: newQuotes.length,
          twitter_card_id: data.id,
          last_update: new Date().toISOString(),
        },
      });


      const quotesForDB = newQuotes.map((d) => ({ user_id: d.author_id, tweet_id: data?.id, engagement_type: "Quote", updated_at: moment().toISOString() }));

      const existingUserIds = await getExistingRecordsIdsIfAny(data?.id, "Quote");
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
  }
};

export const updatePaymentStatusToManyRecords = async (ids: number[] | bigint[], payment_status: payment_status) => {
  return await prisma.campaign_tweetengagements.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: {
      payment_status,
    },
  });
};
