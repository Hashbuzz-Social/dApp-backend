import { getConfig } from '@appConfig';
import {
  campaign_tweetstats,
  campaign_twittercard,
  campaign_type,
  campaignstatus as CampaignStatus,
  PrismaClient,
  user_user,
  whiteListedTokens,
} from '@prisma/client';
import { convertTinyHbarToHbar, formattedDateTime } from '@shared/helper';
import twitterAPI, {
  QuoteSearchOptions,
  ReplySearchOptions,
  TwitterAPIError,
  TwitterValidationError,
} from '@shared/twitterAPI';
import logger from 'jet-logger';
import moment from 'moment';
import { TweetV2PostTweetResult, UserV2 } from 'twitter-api-v2';
import { MediaService } from './media-service';

/**
 * Type definitions for better type safety
 */
export interface TwitterStats {
  like_count?: number;
  retweet_count?: number;
  quote_count?: number;
  reply_count?: number;
}

export interface RewardCatalog {
  retweet_reward: number;
  like_reward: number;
  quote_reward: number;
  reply_reward: number;
}

export interface TweetEngagement {
  id: string;
  author_id?: string;
  created_at?: string;
  text?: string;
}

export interface PublishTweetParams {
  cardOwner: user_user;
  tweetText: string;
  isThread?: boolean;
  parentTweetId?: string;
  media?: string[];
}

export interface CampaignWithOwner extends campaign_twittercard {
  user_user: {
    business_twitter_handle: string | null;
    personal_twitter_handle: string | null;
    available_budget: number | null;
    hedera_wallet_id: string | null;
  } | null;
}

export interface TokenInfo {
  token_id: string;
  token_symbol: string | null;
  token_name: string | null;
}

export type CampaignType = 'HBAR' | 'FUNGIBLE';

export interface TwitterApiError {
  code?: number;
  status?: number;
  message?: string;
  data?: {
    status?: number;
    detail?: string;
  };
}

/**
 * Custom error class for Twitter service errors
 */
export class TwitterServiceError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;

  constructor(code: string, message: string, statusCode?: number) {
    super(message);
    this.name = 'TwitterServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }

  static fromTwitterError(error: TwitterApiError): TwitterServiceError {
    if (
      error.code === 401 ||
      error.status === 401 ||
      (error.data && error.data.status === 401)
    ) {
      return new TwitterServiceError(
        'TWITTER_AUTH_EXPIRED',
        'Your 𝕏 account authentication has expired. Please reconnect your business 𝕏 account to continue publishing campaigns.',
        401
      );
    }
    if (error.code === 403 || error.status === 403) {
      return new TwitterServiceError(
        'TWITTER_FORBIDDEN',
        'Your 𝕏 account does not have permission to perform this action. Please check your account permissions.',
        403
      );
    }
    if (error.code === 429 || error.status === 429) {
      return new TwitterServiceError(
        'TWITTER_RATE_LIMITED',
        '𝕏 API rate limit exceeded. Please wait a few minutes before trying again.',
        429
      );
    }
    if (
      error.message &&
      typeof error.message === 'string' &&
      error.message.includes('duplicate')
    ) {
      return new TwitterServiceError(
        'TWITTER_DUPLICATE',
        'This tweet content has already been posted. Please modify your campaign text.',
        400
      );
    }
    return new TwitterServiceError(
      'TWITTER_UNKNOWN',
      error.message && typeof error.message === 'string'
        ? error.message
        : 'Unknown Twitter API error',
      error.status || error.code || 500
    );
  }
}

/**
 * Input validation utilities
 */
class ValidationUtils {
  static validateTweetText(text: string | null): asserts text is string {
    if (!text || typeof text !== 'string') {
      throw new Error('Tweet text is required and must be a string');
    }
    if (text.length > 280) {
      throw new Error('Tweet text must be 280 characters or less');
    }
  }

  static validateTwitterCredentials(user: user_user): void {
    if (
      !user.business_twitter_access_token ||
      !user.business_twitter_access_token_secret
    ) {
      throw new TwitterServiceError(
        'MISSING_CREDENTIALS',
        'User does not have Twitter credentials configured',
        400
      );
    }
  }

  static validateCampaignId(id: bigint | number): void {
    if (!id || (typeof id !== 'bigint' && typeof id !== 'number')) {
      throw new Error('Valid campaign ID is required');
    }
  }
}

/**
 * Twitter utilities for common operations
 */
class TwitterUtils {
  static formatRewards(reward: number, factor: number): string {
    return (reward / factor).toFixed(2);
  }

  static buildRewardText(
    campaignType: CampaignType,
    formattedDate: string,
    campaignDuration: number,
    rewards: RewardCatalog,
    tokenSymbol?: string,
    decimals?: number
  ): string {
    const baseText =
      `Promo initiated on ${formattedDate}. ` +
      `Interact with the primary tweet for the next ${campaignDuration} min to earn rewards`;

    if (campaignType === 'HBAR') {
      return (
        `${baseText} in HBAR: ` +
        `like ${convertTinyHbarToHbar(rewards.like_reward).toFixed(2)}, ` +
        `repost ${convertTinyHbarToHbar(rewards.retweet_reward).toFixed(2)}, ` +
        `quote ${convertTinyHbarToHbar(rewards.quote_reward).toFixed(2)}, ` +
        `reply ${convertTinyHbarToHbar(rewards.reply_reward).toFixed(2)}.`
      );
    } else {
      const factor = 10 ** Number(decimals);
      return (
        `${baseText} in ${tokenSymbol || 'TOKEN'}: ` +
        `like ${this.formatRewards(rewards.like_reward, factor)}, ` +
        `repost ${this.formatRewards(rewards.retweet_reward, factor)}, ` +
        `quote ${this.formatRewards(rewards.quote_reward, factor)}, ` +
        `reply ${this.formatRewards(rewards.reply_reward, factor)}.`
      );
    }
  }

  static buildQuestLaunchTweet(
    formattedDate: string,
    campaignDuration: number,
    campaignBudget: number,
    symbol: string
  ): string {
    return `🚀 Quest launched on ${formattedDate}. Engage within ${campaignDuration} min -> ${campaignBudget} ${symbol} up for grabs!`;
  }
}

/**
 * Main Twitter Card Service class with dependency injection
 */
export class TwitterCardService {
  private readonly prisma: PrismaClient;
  private readonly mediaService: MediaService;

  constructor(prisma: PrismaClient, mediaService?: MediaService) {
    this.prisma = prisma;
    this.mediaService = mediaService || new MediaService();
  }

  /**
   * Get all active Twitter cards
   */
  async getAllActiveCards(): Promise<campaign_twittercard[]> {
    try {
      return await this.prisma.campaign_twittercard.findMany({
        where: {
          card_status: CampaignStatus.CampaignRunning,
        },
      });
    } catch (error) {
      logger.err(
        `Error fetching active cards: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new Error('Failed to fetch active campaigns');
    }
  }

  /**
   * Get Twitter card statistics
   */
  async getCardStats(
    cardId: bigint | number
  ): Promise<campaign_tweetstats | null> {
    ValidationUtils.validateCampaignId(cardId);

    try {
      return await this.prisma.campaign_tweetstats.findUnique({
        where: {
          twitter_card_id: cardId,
        },
      });
    } catch (error) {
      logger.err(`Error fetching card stats for ${cardId}: ${error}`);
      throw new Error(`Failed to fetch statistics for campaign ${cardId}`);
    }
  }

  /**
   * Update Twitter card statistics
   */
  async updateCardStats(
    stats: TwitterStats,
    cardId: bigint | number
  ): Promise<bigint> {
    ValidationUtils.validateCampaignId(cardId);

    const { like_count, quote_count, reply_count, retweet_count } = stats;

    try {
      const result = await this.prisma.campaign_tweetstats.upsert({
        where: { twitter_card_id: cardId },
        update: {
          like_count: like_count ?? 0,
          quote_count: quote_count ?? 0,
          reply_count: reply_count ?? 0,
          retweet_count: retweet_count ?? 0,
          last_update: new Date(),
        },
        create: {
          like_count: like_count ?? 0,
          quote_count: quote_count ?? 0,
          reply_count: reply_count ?? 0,
          retweet_count: retweet_count ?? 0,
          twitter_card_id: cardId,
          last_update: new Date(),
        },
      });
      return result.id;
    } catch (error) {
      logger.err(`Error updating card stats for ${cardId}: ${error}`);
      throw new Error(`Failed to update statistics for campaign ${cardId}`);
    }
  }

  /**
   * Update total spent amount for a campaign
   */
  async updateTotalSpentAmount(
    id: number | bigint,
    amountSpent: number
  ): Promise<campaign_twittercard> {
    ValidationUtils.validateCampaignId(id);

    try {
      return await this.prisma.campaign_twittercard.update({
        where: { id },
        data: {
          amount_spent: amountSpent,
        },
      });
    } catch (error) {
      logger.err(`Error updating spent amount for campaign ${id}: ${error}`);
      throw new Error(`Failed to update spent amount for campaign ${id}`);
    }
  }

  /**
   * Publish a tweet or thread with improved error handling
   */
  async publishTweetOrThread(params: PublishTweetParams): Promise<string> {
    const { cardOwner, tweetText, isThread, parentTweetId, media } = params;

    ValidationUtils.validateTweetText(tweetText);
    ValidationUtils.validateTwitterCredentials(cardOwner);

    try {
      // const config = await getConfig();
      const userTwitter = await twitterAPI.tweeterApiForUser({
        accessToken: cardOwner.business_twitter_access_token as string,
        accessSecret: cardOwner.business_twitter_access_token_secret as string,
      });

      let mediaIds: string[] = [];
      const externalUrls: string[] = [];

      if (media && media.length > 0) {
        // Separate S3 media from external URLs (YouTube, etc.)
        const s3Media: string[] = [];

        media.forEach((mediaItem) => {
          if (mediaItem.startsWith('upload')) {
            // S3 uploaded files start with "upload"
            s3Media.push(mediaItem);
          } else if (
            mediaItem.startsWith('http://') ||
            mediaItem.startsWith('https://')
          ) {
            // External URLs (YouTube, Vimeo, etc.) - Twitter will embed them
            externalUrls.push(mediaItem);
          } else {
            // Assume it's an S3 key if no protocol
            s3Media.push(mediaItem);
          }
        });

        // Upload S3 media to Twitter
        if (s3Media.length > 0) {
          try {
            await this.mediaService.initialize();

            const uploadPromises = s3Media.map(async (mediaKey) => {
              try {
                const mediaFile = await this.mediaService.readFromS3(mediaKey);
                return await userTwitter.v1.uploadMedia(mediaFile.buffer, {
                  mimeType: mediaFile.mimetype,
                });
              } catch (s3Error) {
                logger.warn(
                  `Failed to read/upload media from S3 (${mediaKey}): ${
                    s3Error instanceof Error ? s3Error.message : String(s3Error)
                  }`
                );
                // Return null for failed uploads, filter them out later
                return null;
              }
            });

            const uploadResults = await Promise.all(uploadPromises);
            mediaIds = uploadResults.filter((id): id is string => id !== null);

            if (uploadResults.some((id) => id === null)) {
              logger.warn(
                'Some media failed to upload from S3. Proceeding with available media or text-only tweet.'
              );
            }
          } catch (error) {
            logger.err(
              `Media service initialization or upload failed: ${
                error instanceof Error ? error.message : String(error)
              }. Posting tweet without images.`
            );
            mediaIds = [];
          }
        }
      }

      // Build final tweet text with external URLs appended
      let finalTweetText = tweetText;
      if (externalUrls.length > 0) {
        // Add external URLs at the end for Twitter to embed them
        finalTweetText = `${tweetText}\n\n${externalUrls.join('\n')}`.trim();
      }

      const rwClient = userTwitter.readWrite;
      let result: TweetV2PostTweetResult;

      if (isThread && parentTweetId) {
        result = await rwClient.v2.reply(finalTweetText, parentTweetId);
      } else if (mediaIds.length > 0) {
        result = await rwClient.v2.tweet(finalTweetText, {
          media: { media_ids: mediaIds },
        });
      } else {
        // Post text-only tweet (including external URLs for embedding)
        result = await rwClient.v2.tweet(finalTweetText);
      }

      return result.data.id;
    } catch (error) {
      console.log('Error publishing tweet:', error);
      logger.err(
        `Twitter API Error: ${JSON.stringify({
          code: (error as TwitterApiError).code,
          status: (error as TwitterApiError).status,
          message: (error as TwitterApiError).message,
        })}`
      );

      throw TwitterServiceError.fromTwitterError(error as TwitterApiError);
    }
  }

  /**
   * Publish the first tweet of a campaign
   */
  async publishFirstTweet(
    card: campaign_twittercard,
    cardOwner: user_user
  ): Promise<string> {
    if (!card.tweet_text) {
      throw new Error('Tweet text is missing from campaign');
    }

    let tweetText = '';

    if (card.campaign_type === campaign_type.quest) {
      const options =
        Array.isArray(card.question_options) && card.question_options.length > 0
          ? card.question_options
              .map((opt, i) => `${i + 1}. ${String(opt)}`)
              .join('\n')
          : '';
      tweetText = `${card.tweet_text}${options ? `\n\n${options}` : ''}`.trim();
    } else {
      tweetText = card.tweet_text;
    }

    return await this.publishTweetOrThread({
      tweetText,
      cardOwner,
      media: card.media || [],
    });
  }

  /**
   * Publish the second thread tweet with campaign details
   */
  async publishSecondThread(
    card: campaign_twittercard,
    cardOwner: user_user,
    parentTweetId: string
  ): Promise<string> {
    ValidationUtils.validateTweetText(card.tweet_text);

    if (
      card.campaign_type === campaign_type.awareness &&
      (!card.like_reward ||
        !card.quote_reward ||
        !card.retweet_reward ||
        !card.comment_reward)
    ) {
      throw new Error('One or more reward values are missing');
    }

    const config = await getConfig();
    const campaignDurationInMin = config.app.defaultCampaignDuration;
    const formattedDate = formattedDateTime(moment().toISOString());

    const rewards: RewardCatalog = {
      like_reward: Number(card.like_reward ?? 0),
      quote_reward: Number(card.quote_reward ?? 0),
      retweet_reward: Number(card.retweet_reward ?? 0),
      reply_reward: Number(card.comment_reward ?? 0),
    };

    let tweetText: string;

    const isAwareness = card.campaign_type === campaign_type.awareness;
    const isHbar = card.type === 'HBAR';

    // Determine symbol and divisor for budget normalization
    let symbol = 'HBAR';
    let divisor = 1e8; // tiny HBAR -> HBAR divisor

    if (!isHbar) {
      const token = await this.getTokenInfo(String(card.fungible_token_id));
      if (!token) throw new Error('Token not found');

      const decimalsNum = card.decimals ? Number(card.decimals) : 0;
      symbol = token.token_symbol || 'TOKEN';
      divisor = 10 ** decimalsNum;
    }

    if (isAwareness) {
      tweetText = TwitterUtils.buildRewardText(
        isHbar ? 'HBAR' : 'FUNGIBLE',
        formattedDate,
        campaignDurationInMin,
        rewards,
        isHbar ? undefined : symbol,
        !isHbar ? (card.decimals ? Number(card.decimals) : 0) : undefined
      );
    } else {
      const normalizedBudget = (card.campaign_budget ?? 0) / divisor;
      tweetText = TwitterUtils.buildQuestLaunchTweet(
        formattedDate,
        campaignDurationInMin,
        normalizedBudget,
        symbol
      );
    }

    return await this.publishTweetOrThread({
      tweetText,
      cardOwner,
      isThread: true,
      parentTweetId,
    });
  }

  /**
   * Get campaigns by status with owner information
   */
  async getCampaignsByStatus(
    status: CampaignStatus
  ): Promise<CampaignWithOwner[]> {
    try {
      return await this.prisma.campaign_twittercard.findMany({
        where: {
          card_status: status,
        },
        include: {
          user_user: {
            select: {
              business_twitter_handle: true,
              personal_twitter_handle: true,
              available_budget: true,
              hedera_wallet_id: true,
            },
          },
        },
        orderBy: {
          id: 'desc',
        },
      });
    } catch (error) {
      logger.err(`Error fetching campaigns by status ${status}: ${error}`);
      throw new Error(`Failed to fetch campaigns with status ${status}`);
    }
  }

  /**
   * Get pending approval campaigns
   */
  async getPendingApprovalCampaigns(): Promise<campaign_twittercard[]> {
    try {
      return await this.prisma.campaign_twittercard.findMany({
        where: {
          AND: [
            {
              OR: [{ approve: false }, { approve: null }],
            },
            {
              OR: [{ isRejected: false }, { isRejected: null }],
            },
          ],
        },
      });
    } catch (error) {
      logger.err(`Error fetching pending campaigns: ${error}`);
      throw new Error('Failed to fetch pending approval campaigns');
    }
  }

  /**
   * Update campaign approval status
   */
  async updateApprovalStatus(
    id: number,
    approved: boolean
  ): Promise<campaign_twittercard | null> {
    try {
      const campaign = await this.prisma.campaign_twittercard.findUnique({
        where: { id },
      });

      if (
        !campaign ||
        campaign.card_status !== CampaignStatus.ApprovalPending
      ) {
        return null;
      }

      const updateData = approved
        ? {
            approve: true,
            isRejected: false,
            card_status: CampaignStatus.CampaignApproved,
          }
        : {
            isRejected: true,
            card_status: CampaignStatus.CampaignDeclined,
          };

      return await this.prisma.campaign_twittercard.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      logger.err(`Error updating approval status for campaign ${id}: ${error}`);
      throw new Error(`Failed to update approval status for campaign ${id}`);
    }
  }

  /**
   * Get token information
   */
  private async getTokenInfo(
    tokenId: string
  ): Promise<whiteListedTokens | null> {
    try {
      return await this.prisma.whiteListedTokens.findUnique({
        where: { token_id: tokenId },
      });
    } catch (error) {
      logger.err(`Error fetching token info for ${tokenId}: ${error}`);
      return null;
    }
  }

  /**
   * Get engagement data with proper typing
   */
  async getEngagementData(
    tweetId: string,
    user: user_user,
    untilTimestamp?: string | Date
  ): Promise<{
    quotes: TweetEngagement[];
    replies: TweetEngagement[];
    likes: UserV2[];
    retweets: UserV2[];
  }> {
    ValidationUtils.validateTwitterCredentials(user);

    try {
      const [quotes, replies, likes, retweets] = await Promise.all([
        this.getQuotesWithinTimestamp(tweetId, user, untilTimestamp),
        this.getRepliesWithinTimestamp(tweetId, user, untilTimestamp),
        this.getAllLikes(tweetId, user),
        this.getAllRetweets(tweetId, user),
      ]);

      return { quotes, replies, likes, retweets };
    } catch (error) {
      logger.err(
        `Error fetching engagement data for tweet ${tweetId}: ${error}`
      );
      throw new Error(`Failed to fetch engagement data for tweet ${tweetId}`);
    }
  }

  /**
   * Get quotes within timestamp with proper typing
   */
  private async getQuotesWithinTimestamp(
    tweetId: string,
    user: user_user,
    untilTimestamp?: string | Date
  ): Promise<TweetEngagement[]> {
    try {
      const options: QuoteSearchOptions = {
        maxResults: 100,
        userFields: ['username', 'public_metrics'],
        expansions: ['author_id'],
      };

      if (untilTimestamp) {
        options.endTime = untilTimestamp;
      }

      return await twitterAPI.getAllUsersWhoQuotedOnTweetId(
        tweetId,
        {
          business_twitter_access_token:
            user.business_twitter_access_token as string,
          business_twitter_access_token_secret:
            user.business_twitter_access_token_secret as string,
        },
        options
      );
    } catch (error) {
      if (error instanceof TwitterAPIError) {
        logger.warn(`Twitter API error fetching quotes: ${error.message}`);
        // Fallback to basic API call without timestamp filtering
        const quotes = await twitterAPI.getAllUsersWhoQuotedOnTweetId(tweetId, {
          business_twitter_access_token:
            user.business_twitter_access_token as string,
          business_twitter_access_token_secret:
            user.business_twitter_access_token_secret as string,
        });

        if (!untilTimestamp) return quotes;

        const until = new Date(untilTimestamp);
        return quotes.filter(
          (quote: TweetEngagement) =>
            quote.created_at && new Date(quote.created_at) <= until
        );
      }
      throw error;
    }
  }

  /**
   * Get replies within timestamp with proper typing
   */
  private async getRepliesWithinTimestamp(
    tweetId: string,
    user: user_user,
    untilTimestamp?: string | Date
  ): Promise<TweetEngagement[]> {
    try {
      ValidationUtils.validateTwitterCredentials(user);

      const options: ReplySearchOptions = {
        maxResults: 100,
        userFields: ['username', 'public_metrics'],
        tweetFields: ['created_at', 'author_id', 'text', 'conversation_id'],
        expansions: ['author_id'],
      };

      if (untilTimestamp) {
        options.endTime = untilTimestamp;
      }

      return await twitterAPI.getAllReplies(
        tweetId,
        user.business_twitter_access_token as string,
        user.business_twitter_access_token_secret as string,
        options
      );
    } catch (error) {
      if (error instanceof TwitterAPIError) {
        logger.warn(`Twitter API error fetching replies: ${error.message}`);
        // Fallback to basic API call without timestamp filtering
        const replies = await twitterAPI.getAllReplies(
          tweetId,
          user.business_twitter_access_token as string,
          user.business_twitter_access_token_secret as string
        );

        if (!untilTimestamp) return replies;

        const until = new Date(untilTimestamp);
        return replies.filter(
          (reply: TweetEngagement) =>
            reply.created_at && new Date(reply.created_at) <= until
        );
      }
      throw error;
    }
  }

  /**
   * Get all users who liked a tweet
   */
  private async getAllLikes(
    tweetId: string,
    user: user_user
  ): Promise<UserV2[]> {
    try {
      ValidationUtils.validateTwitterCredentials(user);
      return await twitterAPI.getAllUsersWhoLikedOnTweetId(tweetId, {
        business_twitter_access_token:
          user.business_twitter_access_token as string,
        business_twitter_access_token_secret:
          user.business_twitter_access_token_secret as string,
      });
    } catch (error) {
      if (error instanceof TwitterValidationError) {
        throw new TwitterServiceError(
          'INVALID_CREDENTIALS',
          'Invalid Twitter credentials for likes fetching',
          401
        );
      }
      if (error instanceof TwitterAPIError) {
        logger.warn(`Twitter API error fetching likes: ${error.message}`);
        return []; // Return empty array as fallback
      }
      throw error;
    }
  }

  /**
   * Get all users who retweeted a tweet
   */
  private async getAllRetweets(
    tweetId: string,
    user: user_user
  ): Promise<UserV2[]> {
    try {
      ValidationUtils.validateTwitterCredentials(user);
      return await twitterAPI.getAllRetweetOfTweetId(tweetId, {
        business_twitter_access_token:
          user.business_twitter_access_token as string,
        business_twitter_access_token_secret:
          user.business_twitter_access_token_secret as string,
      });
    } catch (error) {
      if (error instanceof TwitterValidationError) {
        throw new TwitterServiceError(
          'INVALID_CREDENTIALS',
          'Invalid Twitter credentials for retweets fetching',
          401
        );
      }
      if (error instanceof TwitterAPIError) {
        logger.warn(`Twitter API error fetching retweets: ${error.message}`);
        return []; // Return empty array as fallback
      }
      throw error;
    }
  }
}

/**
 * Factory function to create service instance with dependency injection
 */
export const createTwitterCardService = async (
  prisma?: PrismaClient
): Promise<TwitterCardService> => {
  const { default: createPrismaClient } = await import('@shared/prisma');
  const prismaClient = prisma || (await createPrismaClient());
  return new TwitterCardService(prismaClient);
};

// Export legacy functions for backward compatibility
export const legacyExports = {
  allActiveTwitterCard: async () => {
    const service = await createTwitterCardService();
    return service.getAllActiveCards();
  },

  twitterCardStats: async (cardId: bigint) => {
    const service = await createTwitterCardService();
    return service.getCardStats(cardId);
  },

  updateTwitterCardStats: async (
    body: TwitterStats,
    cardId: bigint | number
  ) => {
    const service = await createTwitterCardService();
    return service.updateCardStats(body, cardId);
  },

  updateTotalSpentAmount: async (id: number | bigint, amount_spent: number) => {
    const service = await createTwitterCardService();
    return service.updateTotalSpentAmount(id, amount_spent);
  },

  publishTweetORThread: async (params: PublishTweetParams) => {
    const service = await createTwitterCardService();
    return service.publishTweetOrThread(params);
  },

  publishFirstTweet: async (
    card: campaign_twittercard,
    cardOwner: user_user
  ) => {
    const service = await createTwitterCardService();
    return service.publishFirstTweet(card, cardOwner);
  },

  publishSecondThread: async (
    card: campaign_twittercard,
    cardOwner: user_user,
    parentTweetId: string
  ) => {
    const service = await createTwitterCardService();
    return service.publishSecondThread(card, cardOwner, parentTweetId);
  },

  getAllTwitterCardByStatus: async (status: CampaignStatus) => {
    const service = await createTwitterCardService();
    return service.getCampaignsByStatus(status);
  },

  getAllTwitterCardPendingCards: async () => {
    const service = await createTwitterCardService();
    return service.getPendingApprovalCampaigns();
  },

  updateStatus: async (id: number, status: boolean) => {
    const service = await createTwitterCardService();
    return service.updateApprovalStatus(id, status);
  },

  getQuotesWithinTimestamp: async (
    tweetId: string,
    user: user_user,
    untilTimestamp?: string | Date
  ) => {
    const service = await createTwitterCardService();
    const data = await service.getEngagementData(tweetId, user, untilTimestamp);
    return data.quotes;
  },

  getRepliesWithinTimestamp: async (
    tweetId: string,
    user: user_user,
    untilTimestamp?: string | Date
  ) => {
    const service = await createTwitterCardService();
    const data = await service.getEngagementData(tweetId, user, untilTimestamp);
    return data.replies;
  },

  getAllLikes: async (tweetId: string, user: user_user) => {
    const service = await createTwitterCardService();
    const data = await service.getEngagementData(tweetId, user);
    return data.likes;
  },

  getAllRetweets: async (tweetId: string, user: user_user) => {
    const service = await createTwitterCardService();
    const data = await service.getEngagementData(tweetId, user);
    return data.retweets;
  },
};

export default legacyExports;
