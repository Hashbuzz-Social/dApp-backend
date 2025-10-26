import { campaign_type, payment_status } from '@prisma/client';
import { CampaignTypes } from '@services/CampaignLifeCycleBase';
import createPrismaClient from '@shared/prisma';
import { CampaignEvents, CampaignScheduledEvents } from '@V201/events/campaign';
import CampaignTweetEngagementsModel from '@V201/Modals/CampaignTweetEngagements';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import {
  collectLikesAndRetweets,
  collectQuotesAndRepliesWithUsers,
  detectBotEngagement,
  getBotDetectionSummary,
} from '@V201/modules/engagements';
import { TweetV2, UserV2 } from 'twitter-api-v2';
import logger from 'jet-logger';
import { publishEvent } from '../../../../eventPublisher';
import SchedulerQueue, {
  TaskSchedulerJobType,
} from '../../../../schedulerQueue';
import { EventPayloadMap } from '../../../../Types/eventPayload';
import {
  CampaignLogEventHandler,
  CampaignLogEventType,
  CampaignLogLevel,
} from '../campaignLogs';

export const processLikeAndRetweetCollection = async (
  eventData: EventPayloadMap[CampaignEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET]
): Promise<void> => {
  const prisma = await createPrismaClient();
  const engagementModel = new CampaignTweetEngagementsModel(prisma);
  const campaignLogger = await CampaignLogEventHandler.create(prisma);
  const campaignCardModel = new CampaignTwitterCardModel(prisma);
  try {
    if (!prisma || !engagementModel || !campaignLogger) {
      throw new Error('Services not properly initialized');
    }

    const { campaignId } = eventData;
    logger.info(
      `[OnCloseEngagement] Processing like and retweet collection for campaign ${campaignId}`
    );

    // Log start of engagement collection
    await campaignLogger.saveLog({
      campaignId: Number(campaignId),
      status: 'ENGAGEMENT_COLLECTION_STARTED',
      message: 'Started collecting like and retweet engagement data',
      level: CampaignLogLevel.INFO,
      eventType: CampaignLogEventType.SYSTEM_EVENT,
      data: {
        level: CampaignLogLevel.INFO,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        metadata: {
          engagementTypes: ['like', 'retweet'],
        },
      },
    });

    const campaignWithUser = await campaignCardModel?.getCampaignsWithUserData(
      campaignId
    );

    if (!campaignWithUser) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    if (!campaignWithUser.tweet_id) {
      throw new Error(`Campaign ${campaignId} has no tweet_id`);
    }

    // Get user tokens for API access
    const cardOwner = campaignWithUser.user_user;
    if (
      !cardOwner.business_twitter_access_token ||
      !cardOwner.business_twitter_access_token_secret
    ) {
      throw new Error('User does not have valid Twitter tokens');
    }

    const { likes, retweets } = await collectLikesAndRetweets(
      campaignWithUser.tweet_id,
      {
        business_twitter_access_token: cardOwner.business_twitter_access_token,
        business_twitter_access_token_secret:
          cardOwner.business_twitter_access_token_secret,
      }
    );

    const placeholderEngagements: any[] = [];

    // Save likes in parallel
    const likeEngagements = likes.map((like) => ({
      user_id: like.id,
      tweet_id: BigInt(campaignWithUser.id),
      engagement_type: 'like',
      engagement_timestamp: new Date(),
      updated_at: new Date(),
      payment_status: payment_status.UNPAID,
      is_valid_timing: true,
    }));

    // Save retweets in parallel
    const retweetEngagements = retweets.map((retweet) => ({
      user_id: retweet.id,
      tweet_id: BigInt(campaignWithUser.id),
      engagement_type: 'retweet',
      engagement_timestamp: new Date(),
      updated_at: new Date(),
      payment_status: payment_status.UNPAID,
      is_valid_timing: true,
    }));

    const allEngagements = [...likeEngagements, ...retweetEngagements];

    try {
      await engagementModel.createManyEngagements(allEngagements);
      placeholderEngagements.push(...allEngagements);
    } catch (error) {
      logger.err(
        `Failed to save like/retweet engagements: ${(error as Error).message}`
      );
    }

    // Log completion
    await campaignLogger.saveLog({
      campaignId: Number(campaignId),
      status: 'ENGAGEMENT_COLLECTION_COMPLETED',
      message: `Completed like and retweet collection. Total engagements: ${placeholderEngagements.length}`,
      level: CampaignLogLevel.SUCCESS,
      eventType: CampaignLogEventType.SYSTEM_EVENT,
      data: {
        level: CampaignLogLevel.SUCCESS,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        metadata: {
          totalEngagements: {
            totalLikes: likes.length,
            totalRetweets: retweets.length,
          },
          engagementTypes: ['like', 'retweet'],
        },
      },
    });

    logger.info(
      `[OnCloseEngagement] Completed like and retweet collection for campaign ${campaignId}`
    );

    const scheduler = await SchedulerQueue.getInstance();
    await scheduler.addJob(
      CampaignScheduledEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY,
      {
        eventName:
          CampaignScheduledEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY,
        data: {
          campaignId: eventData.campaignId,
          type: campaignWithUser?.type as CampaignTypes,
          createdAt: new Date(),
        },
        executeAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes later
      },
      {
        attempts: 1, // NO RETRIES - engagement data collection should not retry to avoid duplicates
        removeOnFail: true, // Remove failed jobs immediately
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.err(
      `[OnCloseEngagement] Error processing like and retweet collection: ${errorMsg}`
    );

    if (campaignLogger) {
      await campaignLogger.logError(
        Number(eventData.campaignId),
        error as Error,
        'like_retweet_collection'
      );
    }
  }
};

/**
 * Process quote and reply engagement data collection
 */
export const processQuoteAndReplyCollection = async (
  job: TaskSchedulerJobType<CampaignScheduledEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY>
): Promise<void> => {
  const prisma = await createPrismaClient();
  const engagementModel = new CampaignTweetEngagementsModel(prisma);
  const campaignLogger = await CampaignLogEventHandler.create(prisma);
  const campaignCardModel = new CampaignTwitterCardModel(prisma);

  try {
    if (!prisma || !engagementModel || !campaignLogger) {
      throw new Error('Services not properly initialized');
    }

    const campaignId = job.data.campaignId;
    logger.info(
      `[OnCloseEngagement] Processing quote and reply collection for campaign ${campaignId}`
    );

    // CRITICAL: Check if engagement collection already completed to prevent duplicate execution
    const existingEngagements = await prisma.campaign_tweetengagements.count({
      where: {
        tweet_id: BigInt(campaignId),
        engagement_type: {
          in: ['quote', 'reply'],
        },
      },
    });

    if (existingEngagements > 0) {
      logger.warn(
        `[OnCloseEngagement] Quote/reply engagements already collected for campaign ${campaignId} ` +
          `(${existingEngagements} records found). Skipping duplicate execution.`
      );
      await campaignLogger.saveLog({
        campaignId: Number(campaignId),
        status: 'ENGAGEMENT_COLLECTION_SKIPPED',
        message: `Skipped duplicate engagement collection (${existingEngagements} existing records)`,
        level: CampaignLogLevel.WARNING,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        data: {
          level: CampaignLogLevel.WARNING,
          eventType: CampaignLogEventType.SYSTEM_EVENT,
          metadata: {
            existingEngagements,
            reason: 'Idempotency check - already processed',
          },
        },
      });

      // Still publish the next event to continue the flow
      const campaignWithUser = await campaignCardModel.getCampaignsWithUserData(
        campaignId
      );
      if (campaignWithUser) {
        if (campaignWithUser.campaign_type === campaign_type.awareness) {
          publishEvent(
            CampaignEvents.CAMPAIGN_CLOSING_RECALCULATE_REWARDS_RATES,
            {
              campaignId,
            }
          );
        } else {
          publishEvent(CampaignEvents.CAMPAIGN_CLOSING_FIND_QUEST_WINNERS, {
            campaignId,
          });
        }
      }
      return; // Exit early
    }

    await campaignLogger.saveLog({
      campaignId: Number(campaignId),
      status: 'ENGAGEMENT_COLLECTION_STARTED',
      message: 'Started collecting quote and reply engagement data',
      level: CampaignLogLevel.INFO,
      eventType: CampaignLogEventType.SYSTEM_EVENT,
      data: {
        level: CampaignLogLevel.INFO,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        metadata: {
          engagementTypes: ['quote', 'reply'],
        },
      },
    });

    const campaignWithUser = await campaignCardModel.getCampaignsWithUserData(
      campaignId
    );

    if (!campaignWithUser) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    if (!campaignWithUser.tweet_id) {
      throw new Error(`Campaign ${campaignId} has no tweet_id`);
    }

    const cardOwner = campaignWithUser.user_user;
    if (
      !cardOwner.business_twitter_access_token ||
      !cardOwner.business_twitter_access_token_secret
    ) {
      throw new Error('User does not have valid Twitter tokens');
    }

    const closeTime = campaignWithUser.campaign_close_time ?? new Date();
    const { quotes, replies } = await collectQuotesAndRepliesWithUsers(
      campaignWithUser.tweet_id,
      {
        business_twitter_access_token: cardOwner.business_twitter_access_token,
        business_twitter_access_token_secret:
          cardOwner.business_twitter_access_token_secret,
      },
      closeTime,
      {
        fetchQuotes: false,
        fetchReplies: true,
      }
    );

    // counters
    let botDetectedCount = 0;
    let validEngagementCount = 0;

    const toEngagement = (
      tweet: TweetV2,
      usersMap: Map<string, UserV2>,
      type: 'quote' | 'reply'
    ) => {
      const authorId = String(tweet.author_id ?? '');
      const createdAt = tweet.created_at
        ? new Date(String(tweet.created_at))
        : new Date();
      const isValidTiming = createdAt.getTime() <= closeTime.getTime();

      let isBotEngagement = false;

      const user = usersMap.get(authorId);
      if (user) {
        const botMetrics = detectBotEngagement(user);
        isBotEngagement = !!botMetrics.isBotEngagement;
        if (isBotEngagement) {
          botDetectedCount++;
          logger.info(
            `[OnCloseEngagement] Bot detected in ${type}: ${getBotDetectionSummary(
              botMetrics
            )} - User: ${authorId}`
          );
        } else if (isValidTiming) {
          // count valid only if it's not a bot and occurred before close time
          validEngagementCount++;
        }
      }

      if (!isValidTiming) {
        logger.info(
          `[OnCloseEngagement] Engagement after campaign close time for campaign ${
            campaignWithUser.id
          } - tweet ${String(
            tweet.id ?? authorId
          )} createdAt=${createdAt.toISOString()} closeTime=${closeTime.toISOString()}`
        );
      }

      return {
        user_id: authorId,
        tweet_id: BigInt(campaignWithUser.id),
        engagement_type: type,
        engagement_timestamp: createdAt,
        updated_at: new Date(),
        payment_status: payment_status.UNPAID,
        is_valid_timing: isValidTiming,
        is_bot_engagement: isBotEngagement,
        content: tweet.text || null, // Save the quoted/reply content
      };
    };

    const quoteEngagements = (quotes.tweets || []).map((t) =>
      toEngagement(t, quotes.users, 'quote')
    );

    const replyEngagements = (replies.tweets || []).map((t) =>
      toEngagement(t, replies.users, 'reply')
    );

    const allEngagements = [...quoteEngagements, ...replyEngagements];

    try {
      if (allEngagements.length > 0) {
        await engagementModel.createManyEngagements(allEngagements);
      }
    } catch (saveErr) {
      logger.err(
        `Failed to save quote/reply engagements: ${(saveErr as Error).message}`
      );
    }

    const completionMsg =
      `Completed quote and reply collection. ` +
      `Quotes: ${quotes.tweets.length}, Replies: ${replies.tweets.length}, ` +
      `Bots detected: ${botDetectedCount}, Valid: ${validEngagementCount}`;

    await campaignLogger.saveLog({
      campaignId: Number(campaignId),
      status: 'ENGAGEMENT_COLLECTION_COMPLETED',
      message: completionMsg,
      level: CampaignLogLevel.SUCCESS,
      eventType: CampaignLogEventType.SYSTEM_EVENT,
      data: {
        level: CampaignLogLevel.SUCCESS,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        metadata: {
          quotesCollected: quotes.tweets.length,
          repliesCollected: replies.tweets.length,
          botDetectedCount,
          validEngagementCount,
        },
      },
    });

    logger.info(
      `[OnCloseEngagement] Completed quote and reply collection for campaign ${campaignId}`
    );

    if (campaignWithUser.campaign_type === campaign_type.awareness) {
      publishEvent(CampaignEvents.CAMPAIGN_CLOSING_RECALCULATE_REWARDS_RATES, {
        campaignId,
      });
    } else {
      publishEvent(CampaignEvents.CAMPAIGN_CLOSING_FIND_QUEST_WINNERS, {
        campaignId,
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.err(
      `[OnCloseEngagement] Error processing quote and reply collection: ${errorMsg}`
    );

    if (campaignLogger) {
      await campaignLogger.logError(
        Number(job.data.campaignId),
        error as Error,
        'quote_reply_collection'
      );
    }

    throw error;
  }
};
