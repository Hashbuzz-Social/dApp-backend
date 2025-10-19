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
 * @param options - Optional configuration for what to fetch
 * @returns Object with raw API data for quotes and replies (simple version without user data)
 */
const collectQuotesAndReplies = async (
  tweetId: string,
  userBizCredentials: UserBizXCredentials,
  timestamp?: string | Date,
  options: CollectionOptions = {}
) => {
  // Default to fetching both if not specified
  const { fetchQuotes = true, fetchReplies = true } = options;

  const quoteOptions: QuoteSearchOptions = timestamp
    ? { endTime: timestamp }
    : {};
  const replyOptions: ReplySearchOptions = timestamp
    ? { endTime: timestamp }
    : {};

  // Build promises array based on what should be fetched
  const promises: [Promise<TweetV2[]> | null, Promise<TweetV2[]> | null] = [
    fetchQuotes
      ? getAllUsersWhoQuotedOnTweetId(tweetId, userBizCredentials, quoteOptions)
      : null,
    fetchReplies
      ? getAllReplies(
          tweetId,
          userBizCredentials.business_twitter_access_token,
          userBizCredentials.business_twitter_access_token_secret,
          replyOptions
        )
      : null,
  ];

  // Execute only non-null promises
  const results = await Promise.all(
    promises.map((p) => (p ? p : Promise.resolve([])))
  );

  const [quotes, replies] = results;

  return {
    quotes,
    replies,
  };
};

/**
 * Collection options for quotes and replies
 */
interface CollectionOptions {
  /** Whether to fetch quote tweets (default: true) */
  fetchQuotes?: boolean;
  /** Whether to fetch reply tweets (default: true) */
  fetchReplies?: boolean;
}

/**
 * Collects quotes and replies WITH user data for bot detection.
 * @param tweetId - The tweet ID
 * @param userBizCredentials - User business credentials
 * @param timestamp - Optional ISO timestamp to filter engagements up to this time
 * @param options - Optional configuration for what to fetch
 * @returns Object with tweets and users map for both quotes and replies
 */
const collectQuotesAndRepliesWithUsers = async (
  tweetId: string,
  userBizCredentials: UserBizXCredentials,
  timestamp?: string | Date,
  options: CollectionOptions = {}
): Promise<{
  quotes: { tweets: TweetV2[]; users: Map<string, UserV2> };
  replies: { tweets: TweetV2[]; users: Map<string, UserV2> };
}> => {
  // Default to fetching both if not specified
  const { fetchQuotes = true, fetchReplies = true } = options;

  const quoteOptions: QuoteSearchOptions = timestamp
    ? { endTime: timestamp }
    : {};
  const replyOptions: ReplySearchOptions = timestamp
    ? { endTime: timestamp }
    : {};

  // Build promises array based on what should be fetched
  const promises: [
    Promise<{ tweets: TweetV2[]; users: Map<string, UserV2> }> | null,
    Promise<{ tweets: TweetV2[]; users: Map<string, UserV2> }> | null
  ] = [
    fetchQuotes
      ? getAllQuotesWithUsers(tweetId, userBizCredentials, quoteOptions)
      : null,
    fetchReplies
      ? getAllRepliesWithUsers(
          tweetId,
          userBizCredentials.business_twitter_access_token,
          userBizCredentials.business_twitter_access_token_secret,
          replyOptions
        )
      : null,
  ];

  // Execute only non-null promises
  const results = await Promise.all(
    promises.map((p) =>
      p ? p : Promise.resolve({ tweets: [], users: new Map<string, UserV2>() })
    )
  );

  const [quotes, replies] = results;

  return {
    quotes,
    replies,
  };
};

export type { CollectionOptions };

export {
  collectLikesAndRetweets,
  collectQuotesAndReplies,
  collectQuotesAndRepliesWithUsers,
};
