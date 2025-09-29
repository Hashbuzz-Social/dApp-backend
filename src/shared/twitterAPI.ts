// src/shared/twitterAPI.ts

import logger from 'jet-logger';
import { getConfig } from '@appConfig';
import TwitterApi, {
  TweetV2,
  Tweetv2SearchParams,
  TwitterApiV2Settings,
  UserV2,
} from 'twitter-api-v2';
import { decrypt } from './encryption';
import createPrismaClient from './prisma';
import { user_user } from '@prisma/client';

// Twitter API settings
TwitterApiV2Settings.debug = true;
TwitterApiV2Settings.logger = {
  log: (msg, payload) => {
    logger.info(msg);
    logger.warn(JSON.stringify(payload));
  },
};

// Types
interface PublicMetrics {
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
}

interface PublicMetricsObject {
  [name: string]: PublicMetrics;
}

interface TimestampFilter {
  startTime?: string | Date;
  endTime?: string | Date;
}

interface TwitterCredentials {
  accessToken: string;
  accessSecret: string;
}

interface EngagementResult {
  likes: UserV2[];
  retweets: UserV2[];
  quotes: TweetV2[];
}

interface TwitterAPIError extends Error {
  code?: string;
  statusCode?: number;
  details?: any;
}

interface QuoteSearchOptions extends TimestampFilter {
  maxResults?: number;
  userFields?: string[];
  expansions?: string[];
}

interface ReplySearchOptions extends TimestampFilter {
  maxResults?: number;
  userFields?: string[];
  tweetFields?: string[];
  expansions?: string[];
}

interface UserTokens {
  business_twitter_access_token: string | null;
  business_twitter_access_token_secret: string | null;
  twitter_access_token: string | null;
  twitter_access_token_secret: string | null;
}

export interface UserBizXCredentials {
  business_twitter_access_token: string;
  business_twitter_access_token_secret: string;
}

/**
 * Custom error classes for Twitter API operations
 */
class TwitterAPIError extends Error implements TwitterAPIError {
  code?: string;
  statusCode?: number;
  details?: any;

  constructor(
    message: string,
    code?: string,
    statusCode?: number,
    details?: any
  ) {
    super(message);
    this.name = 'TwitterAPIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

class TwitterTokenError extends TwitterAPIError {
  constructor(message: string, tokenType: 'personal' | 'business') {
    super(`Token Error: ${message}`, 'TOKEN_ERROR');
    this.name = 'TwitterTokenError';
    this.details = { tokenType };
  }
}

class TwitterValidationError extends TwitterAPIError {
  constructor(message: string, field: string) {
    super(`Validation Error: ${message}`, 'VALIDATION_ERROR');
    this.name = 'TwitterValidationError';
    this.details = { field };
  }
}

/**
 * Validate input parameters
 * @param tweetId - Tweet ID to validate
 * @throws TwitterValidationError if invalid
 */
function validateTweetId(tweetId: string): void {
  if (!tweetId || typeof tweetId !== 'string' || tweetId.trim().length === 0) {
    throw new TwitterValidationError(
      'Tweet ID is required and must be a non-empty string',
      'tweetId'
    );
  }
}

/**
 * Validate timestamp filter
 * @param filter - Timestamp filter to validate
 * @throws TwitterValidationError if invalid
 */
function validateTimestampFilter(filter?: TimestampFilter): void {
  if (!filter) return;

  if (filter.startTime && filter.endTime) {
    const start = new Date(filter.startTime);
    const end = new Date(filter.endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new TwitterValidationError(
        'Invalid timestamp format',
        'timestampFilter'
      );
    }

    if (start >= end) {
      throw new TwitterValidationError(
        'Start time must be before end time',
        'timestampFilter'
      );
    }
  }
}

/**
 * Create a Twitter client with tokens and configuration.
 * @param accessToken - Access token
 * @param accessSecret - Access secret
 * @param configs - App configuration
 * @returns TwitterApi instance
 */
function createTwitterClientWithTokens(
  accessToken: string,
  accessSecret: string,
  configs: any
): TwitterApi {
  const decryptedAccessToken = decrypt(
    accessToken,
    configs.encryptions.encryptionKey as string
  );
  const decryptedAccessSecret = decrypt(
    accessSecret,
    configs.encryptions.encryptionKey as string
  );

  return new TwitterApi({
    appKey: configs.xApp.xAppAPIKey,
    appSecret: configs.xApp.xAppAPISecret,
    accessToken: decryptedAccessToken,
    accessSecret: decryptedAccessSecret,
  });
}

/**
 * Validate user tokens for Twitter API access.
 * @param tokens - User token object
 * @param tokenType - Type of tokens to validate ('personal' | 'business')
 * @throws Error if tokens are missing
 */
function validateUserTokens(
  tokens: UserTokens,
  tokenType: 'personal' | 'business' = 'personal'
): void {
  if (tokenType === 'business') {
    if (
      !tokens.business_twitter_access_token ||
      !tokens.business_twitter_access_token_secret
    ) {
      throw new Error(
        'Business Twitter access tokens are not available for the user'
      );
    }
  } else {
    if (!tokens.twitter_access_token || !tokens.twitter_access_token_secret) {
      throw new Error(
        'Personal Twitter access tokens are not available for the user'
      );
    }
  }
}

/**
 * Filter tweets or users by timestamp.
 * @param items - Array of items with created_at property
 * @param timestampFilter - Filter options
 * @returns Filtered array
 */
function filterByTimestamp<T extends { created_at?: string }>(
  items: T[],
  timestampFilter?: TimestampFilter
): T[] {
  if (
    !timestampFilter ||
    (!timestampFilter.startTime && !timestampFilter.endTime)
  ) {
    return items;
  }

  return items.filter((item) => {
    if (!item.created_at) return true;

    const itemDate = new Date(item.created_at);
    const startTime = timestampFilter.startTime
      ? new Date(timestampFilter.startTime)
      : null;
    const endTime = timestampFilter.endTime
      ? new Date(timestampFilter.endTime)
      : null;

    if (startTime && itemDate < startTime) return false;
    if (endTime && itemDate > endTime) return false;

    return true;
  });
}

/**
 * Convert string or Date to ISO string.
 * @param timestamp - Timestamp to convert
 * @returns ISO string or undefined
 */
function normalizeTimestamp(timestamp?: string | Date): string | undefined {
  if (!timestamp) return undefined;
  return timestamp instanceof Date ? timestamp.toISOString() : timestamp;
}

/**
 * Get all users who liked a tweet.
 * @param tweetId - Tweet ID
 * @param user - User object
 * @returns Array of UserV2
 */
export async function getAllUsersWhoLikedOnTweetId(
  tweetId: string,
  userCred: UserBizXCredentials
): Promise<UserV2[]> {
  try {
    validateTweetId(tweetId);

    const configs = await getConfig();
    const twitterClient = createTwitterClientWithTokens(
      userCred.business_twitter_access_token,
      userCred.business_twitter_access_token_secret,
      configs
    );

    const users: UserV2[] = [];
    const usersRequest = await twitterClient.readOnly.v2.tweetLikedBy(tweetId, {
      'user.fields': ['username'],
      asPaginator: true,
    });

    for await (const user of usersRequest) {
      users.push(user);
    }

    return users;
  } catch (error) {
    if (error instanceof TwitterAPIError) {
      throw error;
    }
    logger.err(
      'Error getting users who liked tweet: ' + (error as Error).message
    );
    throw new TwitterAPIError(
      `Failed to get users who liked tweet: ${(error as Error).message}`,
      'API_ERROR'
    );
  }
}

/**
 * Get all users who retweeted a tweet.
 * @param tweetId - Tweet ID
 * @param user - User object
 * @returns Array of UserV2
 */
export async function getAllRetweetOfTweetId(
  tweetId: string,
  userCred: UserBizXCredentials
): Promise<UserV2[]> {
  const configs = await getConfig();
  const twitterClient = createTwitterClientWithTokens(
    userCred.business_twitter_access_token,
    userCred.business_twitter_access_token_secret,
    configs
  );
  const users: UserV2[] = [];
  const retweets = await twitterClient.readOnly.v2.tweetRetweetedBy(tweetId, {
    'user.fields': ['username'],
    asPaginator: true,
  });
  for await (const user of retweets) {
    users.push(user);
  }
  return users;
}

/**
 * Get all users who quoted a tweet with optional timestamp filtering.
 * @param tweetId - Tweet ID
 * @param user - User object
 * @param options - Search options including timestamp filter
 * @returns Array of TweetV2
 */
export async function getAllUsersWhoQuotedOnTweetId(
  tweetId: string,
  user: UserBizXCredentials,
  options?: QuoteSearchOptions
): Promise<TweetV2[]> {
  try {
    validateTweetId(tweetId);
    validateTimestampFilter(options);

    const configs = await getConfig();
    const twitterClient = createTwitterClientWithTokens(
      user.business_twitter_access_token,
      user.business_twitter_access_token_secret,
      configs
    );

    const data: TweetV2[] = [];
    const searchParams: Partial<Tweetv2SearchParams> = {
      expansions: (options?.expansions || ['author_id']) as any,
      'user.fields': (options?.userFields || ['username']) as any,
      'tweet.fields': [
        'created_at',
        'public_metrics',
        'text',
        'author_id',
      ] as any,
      max_results: options?.maxResults || 100,
      ...(options?.startTime && {
        start_time: normalizeTimestamp(options.startTime),
      }),
      ...(options?.endTime && {
        end_time: normalizeTimestamp(options.endTime),
      }),
    } as any;

    const quotes = await twitterClient.readOnly.v2.quotes(
      tweetId,
      searchParams
    );

    for await (const quote of quotes) {
      data.push({ ...quote });
    }

    // Apply client-side filtering if timestamp options provided but API doesn't support them natively
    if (options?.startTime || options?.endTime) {
      return filterByTimestamp(data, options);
    }

    return data;
  } catch (error) {
    if (error instanceof TwitterAPIError) {
      throw error;
    }
    logger.err('Error getting quoted tweets: ' + (error as Error).message);
    throw new TwitterAPIError(
      `Failed to get quoted tweets: ${(error as Error).message}`,
      'API_ERROR'
    );
  }
}

/**
 * Get engagement metrics (likes, retweets, quotes) for a tweet with optional timestamp filtering.
 * @param tweetId - Tweet ID
 * @param user - User object
 * @param options - Optional timestamp filtering for quotes
 * @returns Engagement object
 */
export async function getEngagementOnCard(
  tweetId: string,
  user: user_user,
  options?: QuoteSearchOptions
): Promise<EngagementResult> {
  if (
    !user.business_twitter_access_token ||
    !user.business_twitter_access_token_secret
  ) {
    throw new TwitterTokenError(
      'Business Twitter access tokens are not available for the user',
      'business'
    );
  }

  const [likes, retweets, quotes] = await Promise.all([
    getAllUsersWhoLikedOnTweetId(tweetId, {
      business_twitter_access_token: user.business_twitter_access_token,
      business_twitter_access_token_secret:
        user.business_twitter_access_token_secret,
    }),
    getAllRetweetOfTweetId(tweetId, {
      business_twitter_access_token: user.business_twitter_access_token,
      business_twitter_access_token_secret:
        user.business_twitter_access_token_secret,
    }),
    getAllUsersWhoQuotedOnTweetId(
      tweetId,
      {
        business_twitter_access_token: user.business_twitter_access_token,
        business_twitter_access_token_secret:
          user.business_twitter_access_token_secret,
      },
      options
    ),
  ]);
  return { likes, retweets, quotes };
}

/**
 * Get public metrics for one or more tweets.
 * @param tweetIds - Tweet ID(s)
 * @param cardId - Card ID
 * @returns PublicMetricsObject
 */
export async function getPublicMetrics(
  tweetIds: string | string[],
  cardId: number
): Promise<PublicMetricsObject | undefined> {
  const appConfig = await getConfig();
  const prisma = await createPrismaClient();
  const cardDetails = await prisma.campaign_twittercard.findUnique({
    where: { id: Number(cardId) },
    select: { user_user: true },
  });
  if (!cardDetails?.user_user) return;
  const twitterClient = createTwitterClientWithTokens(
    cardDetails.user_user.business_twitter_access_token as string,
    cardDetails.user_user.business_twitter_access_token_secret as string,
    appConfig
  );
  const result = await twitterClient.readOnly.v2.tweets(tweetIds, {
    'user.fields': ['username', 'public_metrics', 'description', 'location'],
    'tweet.fields': ['created_at', 'public_metrics', 'text'],
    expansions: ['author_id', 'referenced_tweets.id'],
  });
  if (!result.data) return;
  const publicMetrics: PublicMetricsObject = {};
  result.data.forEach((d) => {
    if (d.public_metrics) publicMetrics[d.id] = d.public_metrics;
  });
  return publicMetrics;
}

/**
 * Get all replies to a tweet with optional timestamp filtering.
 * @param tweetID - Tweet ID
 * @param token - Access token
 * @param secret - Access secret
 * @param options - Search options including timestamp filter
 * @returns Array of tweets
 */
export async function getAllReplies(
  tweetID: string,
  token: string,
  secret: string,
  options?: ReplySearchOptions
): Promise<TweetV2[]> {
  try {
    validateTweetId(tweetID);
    validateTimestampFilter(options);

    const config = await getConfig();
    const twitterClient = createTwitterClientWithTokens(token, secret, config);

    const searchParams: Partial<Tweetv2SearchParams> = {
      expansions: (options?.expansions || [
        'author_id',
        'referenced_tweets.id',
      ]) as any,
      'user.fields': (options?.userFields || [
        'username',
        'public_metrics',
        'description',
        'location',
      ]) as any,
      'tweet.fields': (options?.tweetFields || [
        'created_at',
        'geo',
        'public_metrics',
        'text',
        'conversation_id',
        'in_reply_to_user_id',
      ]) as any,
      max_results: options?.maxResults || 100,
      ...(options?.startTime && {
        start_time: normalizeTimestamp(options.startTime),
      }),
      ...(options?.endTime && {
        end_time: normalizeTimestamp(options.endTime),
      }),
    } as any;

    const searchResults = await twitterClient.readOnly.v2.search(
      `in_reply_to_tweet_id:${tweetID}`,
      searchParams
    );

    const tweets: TweetV2[] = [];
    for await (const tweet of searchResults) {
      tweets.push(tweet);
    }

    // Apply client-side filtering if timestamp options provided
    if (options?.startTime || options?.endTime) {
      return filterByTimestamp(tweets, options);
    }

    return tweets;
  } catch (error) {
    if (error instanceof TwitterAPIError) {
      throw error;
    }
    logger.err('Error getting replies: ' + (error as Error).message);
    throw new TwitterAPIError(
      `Failed to get replies: ${(error as Error).message}`,
      'API_ERROR'
    );
  }
}

/**
 * Create a Twitter API client for a user.
 * @param user - Partial user_user object
 * @returns TwitterApi instance
 */
export async function createTwitterClient(
  user: Partial<user_user>
): Promise<TwitterApi> {
  try {
    const configs = await getConfig();
    validateUserTokens(user as UserTokens, 'personal');

    return createTwitterClientWithTokens(
      user.twitter_access_token as string,
      user.twitter_access_token_secret as string,
      configs
    );
  } catch (error) {
    if (error instanceof TwitterAPIError) {
      throw error;
    }
    logger.err('Error creating Twitter client: ' + (error as Error).message);
    throw new TwitterTokenError('Failed to create Twitter client', 'personal');
  }
}

/**
 * Create a Twitter API client for a business user.
 * @param user - Partial user_user object
 * @returns TwitterApi instance
 */
export async function createTwitterBizClient(
  user: Partial<user_user>
): Promise<TwitterApi> {
  try {
    const configs = await getConfig();
    validateUserTokens(user as UserTokens, 'business');

    return createTwitterClientWithTokens(
      user.business_twitter_access_token as string,
      user.business_twitter_access_token_secret as string,
      configs
    );
  } catch (error) {
    if (error instanceof TwitterAPIError) {
      throw error;
    }
    logger.err(
      'Error creating business Twitter client: ' + (error as Error).message
    );
    throw new TwitterTokenError(
      'Failed to create business Twitter client',
      'business'
    );
  }
}

/**
 * Create a Twitter API client for a user with provided tokens.
 * @param accessToken - Access token
 * @param accessSecret - Access secret
 * @returns TwitterApi instance
 */
export async function tweeterApiForUser({
  accessToken,
  accessSecret,
}: {
  accessToken: string;
  accessSecret: string;
}): Promise<TwitterApi> {
  const configs = await getConfig();
  return createTwitterClientWithTokens(accessToken, accessSecret, configs);
}

/**
 * Get Hashbuzz account Twitter client.
 * @returns TwitterApi instance
 */
export async function HashbuzzTwitterClient(): Promise<TwitterApi> {
  const configs = await getConfig();
  return tweeterApiForUser({
    accessToken: configs.xApp.xHashbuzzAccAccessToken,
    accessSecret: configs.xApp.xHashbuzzAccSecretToken,
  });
}

/**
 * Send a direct message from Hashbuzz to a Twitter user.
 * @param recipient_id - Recipient user ID
 * @param text - Message text
 * @returns DM response
 */
export async function sendDMFromHashBuzz(recipient_id: string, text: string) {
  const hbuuzzClient = await HashbuzzTwitterClient();
  return hbuuzzClient.v1.sendDm({ recipient_id, text });
}

// Export all types for external use
export {
  PublicMetrics,
  PublicMetricsObject,
  TimestampFilter,
  TwitterCredentials,
  EngagementResult,
  TwitterAPIError,
  TwitterTokenError,
  TwitterValidationError,
  QuoteSearchOptions,
  ReplySearchOptions,
  UserTokens,
};

export default {
  // Main API functions with enhanced type safety and timestamp filtering
  getAllReplies,
  getAllUsersWhoQuotedOnTweetId,
  getPublicMetrics,
  getEngagementOnCard,
  getAllUsersWhoLikedOnTweetId,
  getAllRetweetOfTweetId,

  // Client creation utilities with improved error handling
  createTwitterClient,
  createTwitterBizClient,
  tweeterApiForUser,
  HashbuzzTwitterClient,

  // Direct messaging
  sendDMFromHashBuzz,

  // Utility functions
  validateTweetId,
  validateTimestampFilter,
  validateUserTokens,
  filterByTimestamp,
  normalizeTimestamp,
  createTwitterClientWithTokens,

  // Error classes for proper error handling
  TwitterAPIError,
  TwitterTokenError,
  TwitterValidationError,
} as const;
