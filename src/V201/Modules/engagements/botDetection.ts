import { UserV2 } from 'twitter-api-v2';
import logger from 'jet-logger';
import createPrismaClient from '@shared/prisma';

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
  skipReason?: string; // Reason why bot detection was skipped
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
 * Check if a Twitter user ID is in the bot detection exceptions list
 * @param twitterUserId - Twitter user ID to check
 * @returns Promise<boolean> - True if user should be skipped from bot detection
 */
async function isUserInExceptionList(twitterUserId: string): Promise<boolean> {
  try {
    const prisma = await createPrismaClient();

    const exception = await prisma.bot_detection_exceptions.findFirst({
      where: {
        twitter_user_id: twitterUserId,
        is_active: true,
      },
    });

    return !!exception;
  } catch (error) {
    logger.err(
      `Error checking bot detection exceptions: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    // Return false (with logging) to allow bot detection to proceed if exception check fails
    return false;
  }
}

/**
 * Check if a Twitter user ID exists in the user_user table (registered users)
 * @param twitterUserId - Twitter user ID to check
 * @returns Promise<boolean> - True if user exists in user_user table
 */
async function isRegisteredUser(twitterUserId: string): Promise<boolean> {
  try {
    const prisma = await createPrismaClient();

    const user = await prisma.user_user.findFirst({
      where: {
        personal_twitter_id: twitterUserId,
      },
      select: {
        id: true, // Only select ID for performance
      },
    });

    return !!user;
  } catch (error) {
    logger.err(
      `Error checking registered users: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    // Throw error instead of returning false to ensure proper error handling
    throw new Error(
      `Failed to check registered users: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Detect if a user engagement is likely from a bot
 * @param user - Twitter user data (from includes.users in API response)
 * @returns Promise<Bot detection metrics>
 */
export async function detectBotEngagement(
  user: UserV2
): Promise<BotDetectionMetrics> {
  const botFlags: string[] = [];

  // First, check if user should be skipped from bot detection
  const isInExceptionList = await isUserInExceptionList(user.id);
  if (isInExceptionList) {
    logger.info(
      `Skipping bot detection for user ${user.id} - found in exception list`
    );
    return {
      accountAgeDays: 0,
      followerRatio: 0,
      tweetRatePerDay: 0,
      isBotEngagement: false,
      botFlags: [],
      skipReason: 'EXCEPTION_LIST',
    };
  }

  // Check if user is registered in our system
  const isRegistered = await isRegisteredUser(user.id);
  if (isRegistered) {
    logger.info(`Skipping bot detection for user ${user.id} - registered user`);
    return {
      accountAgeDays: 0,
      followerRatio: 0,
      tweetRatePerDay: 0,
      isBotEngagement: false,
      botFlags: [],
      skipReason: 'REGISTERED_USER',
    };
  }

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
export function updateBotThresholds(
  thresholds: Partial<typeof BOT_DETECTION_THRESHOLDS>
) {
  Object.assign(BOT_DETECTION_THRESHOLDS, thresholds);
}

export { BOT_DETECTION_THRESHOLDS };

/**
 * Bot Detection Exception Management Service
 */
export class BotDetectionExceptionService {
  /**
   * Add a user to the bot detection exception list
   * @param twitterUserId - Twitter user ID to add
   * @param twitterUsername - Twitter username (optional)
   * @param reason - Reason for adding to exception list
   * @param addedByAdminId - ID of admin adding the exception
   * @param notes - Additional notes (optional)
   * @returns Promise<boolean> - Success status
   */
  static async addException(
    twitterUserId: string,
    twitterUsername: string | null,
    reason: string,
    addedByAdminId: bigint | null = null,
    notes: string | null = null
  ): Promise<boolean> {
    try {
      const prisma = await createPrismaClient();

      await prisma.bot_detection_exceptions.create({
        data: {
          twitter_user_id: twitterUserId,
          twitter_username: twitterUsername,
          reason,
          added_by_admin_id: addedByAdminId,
          notes,
          is_active: true,
        },
      });

      logger.info(
        `Added bot detection exception for user ${twitterUserId} (${
          twitterUsername || 'N/A'
        }) - Reason: ${reason}`
      );
      return true;
    } catch (error) {
      logger.err(
        `Error adding bot detection exception: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Throw error instead of returning false
      throw new Error(
        `Failed to add bot detection exception: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Remove a user from the bot detection exception list (deactivate)
   * @param twitterUserId - Twitter user ID to remove
   * @returns Promise<boolean> - Success status
   */
  static async removeException(twitterUserId: string): Promise<boolean> {
    try {
      const prisma = await createPrismaClient();

      await prisma.bot_detection_exceptions.updateMany({
        where: {
          twitter_user_id: twitterUserId,
          is_active: true,
        },
        data: {
          is_active: false,
          updated_at: new Date(),
        },
      });

      logger.info(`Removed bot detection exception for user ${twitterUserId}`);
      return true;
    } catch (error) {
      logger.err(
        `Error removing bot detection exception: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Throw error instead of returning false
      throw new Error(
        `Failed to remove bot detection exception: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get all active bot detection exceptions
   * @returns Promise<any[]> - List of active exceptions
   */
  static async getActiveExceptions(): Promise<any[]> {
    try {
      const prisma = await createPrismaClient();

      const exceptions = await prisma.bot_detection_exceptions.findMany({
        where: {
          is_active: true,
        },
        include: {
          added_by_admin: {
            select: {
              id: true,
              name: true,
              business_twitter_handle: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      return exceptions;
    } catch (error) {
      logger.err(
        `Error getting bot detection exceptions: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Throw error instead of returning empty array
      throw new Error(
        `Failed to get bot detection exceptions: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Check if a user is in the exception list (exposed for external use)
   * @param twitterUserId - Twitter user ID to check
   * @returns Promise<boolean> - True if user is in exception list
   */
  static async isUserExcepted(twitterUserId: string): Promise<boolean> {
    return await isUserInExceptionList(twitterUserId);
  }
}
