import { UserV2 } from 'twitter-api-v2';
import logger from 'jet-logger';

/**
 * Bot detection thresholds
 */
const BOT_DETECTION_THRESHOLDS = {
  MIN_ACCOUNT_AGE_DAYS: 30,
  MAX_FOLLOWER_RATIO: 50,
  MAX_TWEET_RATE_PER_DAY: 100,
} as const;

/**
 * Bot detection metrics interface
 */
export interface BotDetectionMetrics {
  accountAgeDays: number;
  followerRatio: number;
  tweetRatePerDay: number;
  isBotEngagement: boolean;
  botFlags: string[];
}

/**
 * Calculate account age in days
 * @param createdAt - Account creation date from Twitter
 * @returns Age in days
 */
function calculateAccountAge(createdAt?: string): number {
  if (!createdAt) {
    logger.warn('Missing created_at field for user account age calculation');
    return 0;
  }

  const accountCreationDate = new Date(createdAt);
  const currentDate = new Date();
  const ageDays = Math.floor(
    (currentDate.getTime() - accountCreationDate.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return Math.max(0, ageDays);
}

/**
 * Calculate follower ratio (following / followers)
 * @param followingCount - Number of accounts the user follows
 * @param followersCount - Number of followers
 * @returns Follower ratio
 */
function calculateFollowerRatio(
  followingCount: number,
  followersCount: number
): number {
  // Avoid division by zero, use max(1, followers)
  const denominator = Math.max(1, followersCount);
  return followingCount / denominator;
}

/**
 * Calculate tweet rate per day
 * @param tweetCount - Total number of tweets
 * @param accountAgeDays - Account age in days
 * @returns Tweet rate per day
 */
function calculateTweetRate(
  tweetCount: number,
  accountAgeDays: number
): number {
  if (accountAgeDays === 0) {
    // Account created today, return tweet count
    return tweetCount;
  }

  return tweetCount / accountAgeDays;
}

/**
 * Detect if a user engagement is likely from a bot
 * @param user - Twitter user data (from includes.users in API response)
 * @returns Bot detection metrics
 */
export function detectBotEngagement(user: UserV2): BotDetectionMetrics {
  const botFlags: string[] = [];

  // Get user metrics
  const publicMetrics = user.public_metrics;
  const createdAt = user.created_at;

  if (!publicMetrics) {
    logger.warn(`Missing public_metrics for user ${user.id}`);
    return {
      accountAgeDays: 0,
      followerRatio: 0,
      tweetRatePerDay: 0,
      isBotEngagement: true,
      botFlags: ['MISSING_METRICS'],
    };
  }

  // 1. Account Age Check
  const accountAgeDays = calculateAccountAge(createdAt);
  if (accountAgeDays < BOT_DETECTION_THRESHOLDS.MIN_ACCOUNT_AGE_DAYS) {
    botFlags.push('NEW_ACCOUNT');
  }

  // 2. Follower Ratio Check
  const followerRatio = calculateFollowerRatio(
    publicMetrics.following_count || 0,
    publicMetrics.followers_count || 0
  );
  if (followerRatio > BOT_DETECTION_THRESHOLDS.MAX_FOLLOWER_RATIO) {
    botFlags.push('HIGH_FOLLOWER_RATIO');
  }

  // 3. Tweet Rate Check
  const tweetRatePerDay = calculateTweetRate(
    publicMetrics.tweet_count || 0,
    accountAgeDays
  );
  if (tweetRatePerDay > BOT_DETECTION_THRESHOLDS.MAX_TWEET_RATE_PER_DAY) {
    botFlags.push('HIGH_TWEET_RATE');
  }

  // Additional checks
  if (publicMetrics.followers_count === 0) {
    botFlags.push('ZERO_FOLLOWERS');
  }

  if (!user.description || user.description.trim().length === 0) {
    botFlags.push('NO_BIO');
  }

  // Determine if bot based on flags
  const isBotEngagement = botFlags.length > 0;

  return {
    accountAgeDays,
    followerRatio: Math.round(followerRatio * 100) / 100, // Round to 2 decimals
    tweetRatePerDay: Math.round(tweetRatePerDay * 100) / 100,
    isBotEngagement,
    botFlags,
  };
}

/**
 * Get bot detection summary for logging
 * @param metrics - Bot detection metrics
 * @returns Summary string
 */
export function getBotDetectionSummary(metrics: BotDetectionMetrics): string {
  if (!metrics.isBotEngagement) {
    return 'Valid user engagement';
  }

  const details = `Age: ${metrics.accountAgeDays}d, Ratio: ${metrics.followerRatio}, Rate: ${metrics.tweetRatePerDay}/day`;
  return `Potential bot: ${metrics.botFlags.join(', ')} (${details})`;
}

/**
 * Update bot detection thresholds (for testing/configuration)
 */
export function updateBotThresholds(thresholds: Partial<typeof BOT_DETECTION_THRESHOLDS>) {
  Object.assign(BOT_DETECTION_THRESHOLDS, thresholds);
}

export { BOT_DETECTION_THRESHOLDS };
