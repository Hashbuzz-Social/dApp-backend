import {
  getAllReplies,
  getAllRetweetOfTweetId,
  getAllUsersWhoLikedOnTweetId,
  getAllUsersWhoQuotedOnTweetId,
  QuoteSearchOptions,
  ReplySearchOptions,
  UserBizXCredentials
} from '@shared/twitterAPI';

/**
 * Collects likes and retweets for a tweet.
 * @param tweetId - The tweet ID
 * @param user - The user object (with required Twitter credentials)
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
 * @param user - The user object (with required Twitter credentials)
 * @param timestamp - Optional ISO timestamp to filter engagements up to this time
 * @returns Object with raw API data for quotes and replies
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

export { collectLikesAndRetweets, collectQuotesAndReplies };
