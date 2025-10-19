import {
  getAllReplies,
  getAllRepliesWithUsers,
  getAllRetweetOfTweetId,
  getAllUsersWhoLikedOnTweetId,
  getAllUsersWhoQuotedOnTweetId,
  getAllQuotesWithUsers,
  QuoteSearchOptions,
  ReplySearchOptions,
  UserBizXCredentials,
} from '@shared/twitterAPI';
import { TweetV2, UserV2 } from 'twitter-api-v2';

/**
 * Collects likes and retweets for a tweet.
 * @param tweetId - The tweet ID
 * @param userBizCredentials - The user credentials
 * @returns Object with raw API data for likes and retweets
 */
const collectLikesAndRetweets = async (
  tweetId: string,
  userBizCredentials: UserBizXCredentials
) => {
  const [likes, retweets] = await Promise.all([
    getAllUsersWhoLikedOnTweetId(tweetId, userBizCredentials),
    getAllRetweetOfTweetId(tweetId, userBizCredentials),
  ]);

  return {
    likes,
    retweets,
  };
};

/**
 * Collects quotes and replies for a tweet, filtered by optional timestamp.
 * @param tweetId - The tweet ID
 * @param userBizCredentials - User business credentials
 * @param timestamp - Optional ISO timestamp to filter engagements up to this time
 * @returns Object with raw API data for quotes and replies (simple version without user data)
 */
const collectQuotesAndReplies = async (
  tweetId: string,
  userBizCredentials: UserBizXCredentials,
  timestamp?: string | Date
) => {
  const quoteOptions: QuoteSearchOptions = timestamp
    ? { endTime: timestamp }
    : {};
  const replyOptions: ReplySearchOptions = timestamp
    ? { endTime: timestamp }
    : {};

  const [quotes, replies] = await Promise.all([
    getAllUsersWhoQuotedOnTweetId(tweetId, userBizCredentials, quoteOptions),
    getAllReplies(
      tweetId,
      userBizCredentials.business_twitter_access_token,
      userBizCredentials.business_twitter_access_token_secret,
      replyOptions
    ),
  ]);

  return {
    quotes,
    replies,
  };
};

/**
 * Collects quotes and replies WITH user data for bot detection.
 * @param tweetId - The tweet ID
 * @param userBizCredentials - User business credentials
 * @param timestamp - Optional ISO timestamp to filter engagements up to this time
 * @returns Object with tweets and users map for both quotes and replies
 */
const collectQuotesAndRepliesWithUsers = async (
  tweetId: string,
  userBizCredentials: UserBizXCredentials,
  timestamp?: string | Date
): Promise<{
  quotes: { tweets: TweetV2[]; users: Map<string, UserV2> };
  replies: { tweets: TweetV2[]; users: Map<string, UserV2> };
}> => {
  const quoteOptions: QuoteSearchOptions = timestamp
    ? { endTime: timestamp }
    : {};
  const replyOptions: ReplySearchOptions = timestamp
    ? { endTime: timestamp }
    : {};

  const [quotes, replies] = await Promise.all([
    getAllQuotesWithUsers(tweetId, userBizCredentials, quoteOptions),
    getAllRepliesWithUsers(
      tweetId,
      userBizCredentials.business_twitter_access_token,
      userBizCredentials.business_twitter_access_token_secret,
      replyOptions
    ),
  ]);

  return {
    quotes,
    replies,
  };
};

export {
  collectLikesAndRetweets,
  collectQuotesAndReplies,
  collectQuotesAndRepliesWithUsers,
};
