/* eslint-disable max-len */
import { payment_status } from "@prisma/client";
import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import moment from "moment";
import { getCampaignDetailsById } from "./campaign-service";
import logger from "jet-logger";

export type engagements = "Like" | "Retweet" | "Reply" | "Quote";

const getExistingRecordsIdsIfAny = async (id: bigint, engagement_type: engagements) => {
  try {
    const existingRecordsIfAny = await prisma.campaign_tweetengagements.findMany({
      where: {
        tweet_id: id,
        engagement_type,
      },
      select: {
        user_id: true,
      },
    });
    return existingRecordsIfAny.map((d) => d.user_id);
  } catch (error) {
    logger.err("Error fetching existing records: ", error);
    throw error;
  }
};

export const updateRepliesToDB = async (id: bigint, tweet_Id: string) => {
  try {
    const data = await getCampaignDetailsById(id);
    if (!data?.user_user?.business_twitter_access_token || !data?.user_user?.business_twitter_access_token_secret) {
      logger.err("No twitter account is accessible.");
      return false;
    }

    const [allRepliesResult, allExistingReplyEngagementsResult] = await Promise.allSettled([
      twitterAPI.getAllReplies(tweet_Id, data.user_user.business_twitter_access_token, data.user_user.business_twitter_access_token_secret),
      prisma.campaign_tweetengagements.findMany({
        where: {
          tweet_id: id,
          engagement_type: "Reply",
        },
        select: {
          user_id: true,
        },
      }),
    ]);

    if (allRepliesResult.status !== "fulfilled" || allExistingReplyEngagementsResult.status !== "fulfilled") {
      logger.err("Failed to fetch data from Twitter or database.");
      return false;
    }

    const allReplies = allRepliesResult.value;
    const allExistingReplyEngagements = allExistingReplyEngagementsResult.value;

    const newAllReplies = allReplies.filter(reply => reply.author_id !== data.user_user.personal_twitter_id);
    const existingUserIds = allExistingReplyEngagements.map(d => d.user_id);

    let formattedArray = newAllReplies.map(reply => ({
      user_id: reply.author_id,
      tweet_id: id,
      engagement_type: "Reply",
      updated_at: new Date().toISOString(),
    })).filter(reply => !existingUserIds.includes(reply.user_id));

    if (formattedArray.length > 0) {
      await prisma.campaign_tweetengagements.createMany({
        data: formattedArray,
        skipDuplicates: true,
      });

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

      return true;
    }

    return false;
  } catch (error) {
    logger.err("Error updating replies to DB: ", error);
    throw error;
  }
};

export const updateAllEngagementsForCard = async (card: number | bigint) => {
  try {
    const data = await getCampaignDetailsById(card);
    if (data?.id && data?.tweet_id && data?.user_user) {
      const details = data.tweet_id.toString();
      const { likes, retweets, quotes } = await twitterAPI.getEngagementOnCard(details, data.user_user);

      let isDone = false;

      if (likes.length > 0) {
        const newLikes = likes.filter(like => like.id !== data.user_user.personal_twitter_id);

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

        const likesForDB = newLikes.map((d) => ({
          user_id: d.id,
          tweet_id: data.id,
          engagement_type: "Like",
          updated_at: moment().toISOString(),
        }));

        const existingUserIds = await getExistingRecordsIdsIfAny(data.id, "Like");
        const filterResult = likesForDB.filter(d => !existingUserIds.includes(d.user_id));

        if (filterResult.length > 0) {
          await prisma.campaign_tweetengagements.createMany({
            data: filterResult,
          });
          isDone = true;
        }
      }

      if (retweets.length > 0) {
        const newRetweet = retweets.filter(retweet => retweet.id !== data.user_user.personal_twitter_id);

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

        const retweetsForDB = newRetweet.map((d) => ({
          user_id: d.id,
          tweet_id: data.id,
          engagement_type: "Retweet",
          updated_at: moment().toISOString(),
        }));

        const existingUserIds = await getExistingRecordsIdsIfAny(data.id, "Retweet");
        const filterResult = retweetsForDB.filter(d => !existingUserIds.includes(d.user_id));

        if (filterResult.length > 0) {
          await prisma.campaign_tweetengagements.createMany({
            data: filterResult,
            skipDuplicates: true,
          });
          isDone = true;
        }
      }

      if (quotes.length > 0) {
        const newQuotes = quotes.filter(quote => quote.id !== data.user_user.personal_twitter_id);

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

        const quotesForDB = newQuotes.map((d) => ({
          user_id: d.author_id,
          tweet_id: data.id,
          engagement_type: "Quote",
          updated_at: moment().toISOString(),
        }));

        const existingUserIds = await getExistingRecordsIdsIfAny(data.id, "Quote");
        const filterResult = quotesForDB.filter(d => !existingUserIds.includes(d.user_id!));

        if (filterResult.length > 0) {
          await prisma.campaign_tweetengagements.createMany({
            data: filterResult,
            skipDuplicates: true,
          });
          isDone = true;
        }
      }

      return isDone;
    }
  } catch (error) {
    logger.err("Error updating all engagements for card: ", error);
    throw error;
  }
};

export const updatePaymentStatusToManyRecords = async (ids: number[] | bigint[], payment_status: payment_status) => {
  try {
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
  } catch (error) {
    logger.err("Error updating payment status: ", error);
    throw error;
  }
};
