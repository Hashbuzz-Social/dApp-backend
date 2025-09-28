import logger from 'jet-logger';
import { publishToQueue } from '../../../redisQueue';
import twitterAPI from '@shared/twitterAPI';
import { PrismaClient } from '@prisma/client';

interface EngagementMetrics {
  likes: number;
  retweets: number;
  quotes: number;
  comments: number;
  totalEngagements: number;
  uniqueEngagers: number;
}

interface EngagementRecord {
  tweet_id: bigint;
  user_id: string;
  engagement_type: 'like' | 'retweet' | 'quote' | 'comment';
  updated_at: Date;
  payment_status: 'UNPAID' | 'PAID' | 'SUSPENDED';
  is_valid_timing?: boolean;
}

interface CampaignTrackingJob {
  campaignId: string;
  tweetId: string;
  userId: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  collectionType: 'periodic' | 'final';
}

/**
 * Service for tracking engagement on X (Twitter) with queue-based processing
 * Integrates with existing Redis queue system
 */
export class XApiEngagementTracker {
  private prisma: PrismaClient;
  private apiBaseUrl = 'https://api.twitter.com/2';

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Start tracking engagement for a campaign by scheduling collection jobs
   */
  async startCampaignTracking(
    campaignId: bigint,
    tweetId: string,
    userId: bigint,
    durationHours = 24
  ): Promise<void> {
    try {
      const startTime = new Date();
      const endTime = new Date(
        startTime.getTime() + durationHours * 60 * 60 * 1000
      );

      // Create tracking job for Redis queue
      const trackingJob: CampaignTrackingJob = {
        campaignId: campaignId.toString(),
        tweetId,
        userId: userId.toString(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        isActive: true,
        collectionType: 'periodic',
      };

      // Initialize engagement tracking in database
      await this.initializeCampaignEngagement(campaignId, tweetId);

      // Schedule periodic collection jobs (every 30 minutes to respect rate limits)
      const collectionInterval = 30 * 60 * 1000; // 30 minutes
      const totalCollections = Math.ceil(
        (durationHours * 60 * 60 * 1000) / collectionInterval
      );

      for (let i = 0; i < totalCollections; i++) {
        const delayMs = i * collectionInterval;
        const collectionJob = {
          ...trackingJob,
          collectionType: 'periodic',
          scheduledFor: new Date(Date.now() + delayMs).toISOString(),
          jobId: `${campaignId}_${i}`,
        };

        // Add to engagement collection queue
        await publishToQueue('engagement_collection', collectionJob);
      }

      // Schedule final collection at campaign end
      const finalJob = {
        ...trackingJob,
        collectionType: 'final',
        scheduledFor: endTime.toISOString(),
        jobId: `${campaignId}_final`,
      };
      await publishToQueue('engagement_collection', finalJob);

      logger.info(
        `Started engagement tracking for campaign ${campaignId} with ${totalCollections} collection jobs`
      );

      // Add to campaign log in database: tracking started
      await this.prisma.campaignLog.create({
        data: {
          campaign_id: campaignId,
          status: 'tracking_started',
          message: `Engagement tracking started for tweet ${tweetId} for ${durationHours} hours.`,
          timestamp: new Date(),
          data: {
            tweetId,
            durationHours,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
          },
        },
      });
    } catch (error) {
      logger.err(
        `Error starting campaign tracking: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Initialize campaign engagement tracking in database
   */
  private async initializeCampaignEngagement(
    campaignId: bigint,
    _tweetId: string // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<void> {
    try {
      // Create or update campaign tweet stats record
      await this.prisma.campaign_tweetstats.upsert({
        where: { twitter_card_id: campaignId },
        update: {
          last_update: new Date(),
        },
        create: {
          twitter_card_id: campaignId,
          like_count: 0,
          retweet_count: 0,
          quote_count: 0,
          reply_count: 0,
          last_update: new Date(),
        },
      });

      logger.info(`Initialized engagement tracking for campaign ${campaignId}`);
    } catch (error) {
      logger.err(
        `Error initializing campaign engagement: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // If table doesn't exist, that's okay - we'll handle it gracefully
    }
  }

  /**
   * Collect engagement data from X API using existing Twitter API integration
   */
  async collectEngagementData(
    campaignId: bigint,
    tweetId: string
  ): Promise<EngagementMetrics> {
    try {
      logger.info(
        `Collecting engagement data for campaign ${campaignId}, tweet ${tweetId}`
      );

      // Get campaign owner to access their Twitter credentials
      const campaign = await this.prisma.campaign_twittercard.findUnique({
        where: { id: campaignId },
        include: {
          user_user: {
            select: {
              id: true,
              business_twitter_access_token: true,
              business_twitter_access_token_secret: true,
            },
          },
        },
      });

      if (!campaign || !campaign.user_user) {
        throw new Error(`Campaign ${campaignId} or user not found`);
      }

      const user = campaign.user_user;

      // Check if user has Twitter credentials
      if (
        !user.business_twitter_access_token ||
        !user.business_twitter_access_token_secret
      ) {
        const errorMessage = `User ${user.id} does not have Twitter credentials - cannot collect engagement data`;
        logger.err(errorMessage);
        throw new Error(errorMessage);
      }

      // Collect engagement data using existing Twitter API functions with error handling
      let likesData: unknown[] = [];
      let retweetsData: unknown[] = [];
      let quotesData: unknown[] = [];
      let repliesData: unknown[] = [];

      try {
        const results = await Promise.allSettled([
          twitterAPI.getAllUsersWhoLikedOnTweetId(tweetId, user),
          twitterAPI.getAllRetweetOfTweetId(tweetId, user),
          twitterAPI.getAllUsersWhoQuotedOnTweetId(tweetId, user),
        ]);

        likesData = results[0].status === 'fulfilled' ? results[0].value : [];
        retweetsData =
          results[1].status === 'fulfilled' ? results[1].value : [];
        quotesData = results[2].status === 'fulfilled' ? results[2].value : [];

        // Log any API failures
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const apiNames = ['likes', 'retweets', 'quotes'];
            logger.warn(
              `Failed to collect ${
                apiNames[index]
              } for tweet ${tweetId}: ${String(result.reason)}`
            );
          }
        });
      } catch (error) {
        logger.warn(
          `Error collecting basic engagement data: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      // Get replies/comments separately with error handling
      try {
        repliesData = await twitterAPI.getAllReplies(
          tweetId,
          user.business_twitter_access_token,
          user.business_twitter_access_token_secret
        );
      } catch (error) {
        logger.warn(
          `Failed to collect replies for tweet ${tweetId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        repliesData = [];
      }

      // Calculate metrics
      const metrics: EngagementMetrics = {
        likes: likesData.length,
        retweets: retweetsData.length,
        quotes: quotesData.length,
        comments: repliesData.length,
        totalEngagements: 0,
        uniqueEngagers: 0,
      };

      // Calculate unique engagers by combining all user IDs with type safety
      const allEngagers = new Set<string>();

      // Helper function to safely extract user ID from API response
      const extractUserId = (user: unknown): string | null => {
        if (user && typeof user === 'object' && 'id' in user) {
          return String((user as { id: unknown }).id);
        }
        return null;
      };

      likesData.forEach((user) => {
        const userId = extractUserId(user);
        if (userId) allEngagers.add(userId);
      });
      retweetsData.forEach((user) => {
        const userId = extractUserId(user);
        if (userId) allEngagers.add(userId);
      });
      quotesData.forEach((user) => {
        const userId = extractUserId(user);
        if (userId) allEngagers.add(userId);
      });
      repliesData.forEach((user) => {
        const userId = extractUserId(user);
        if (userId) allEngagers.add(userId);
      });

      metrics.uniqueEngagers = allEngagers.size;
      metrics.totalEngagements =
        metrics.likes + metrics.retweets + metrics.quotes + metrics.comments;

      // Store collected data and individual engagement records
      await this.storeEngagementMetrics(campaignId, metrics);
      await this.storeIndividualEngagements(
        campaignId,
        tweetId,
        likesData,
        retweetsData,
        quotesData,
        repliesData
      );

      logger.info(
        `Collected real engagement data for campaign ${campaignId}: ${JSON.stringify(
          metrics
        )}`
      );
      return metrics;
    } catch (error) {
      logger.err(
        `Error collecting engagement data from X API: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error; // Don't fallback to mock data in V201
    }
  }

  /**
   * Store engagement metrics in database using campaign_tweetstats table
   */
  private async storeEngagementMetrics(
    campaignId: bigint,
    metrics: EngagementMetrics
  ): Promise<void> {
    try {
      await this.prisma.campaign_tweetstats.update({
        where: { twitter_card_id: campaignId },
        data: {
          like_count: metrics.likes,
          retweet_count: metrics.retweets,
          quote_count: metrics.quotes,
          reply_count: metrics.comments,
          last_update: new Date(),
        },
      });

      logger.info(`Stored engagement metrics for campaign ${campaignId}`);
    } catch (error) {
      logger.err(
        `Error storing engagement metrics: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Gracefully handle if table doesn't exist
    }
  }

  /**
   * Store individual engagement records in campaign_tweetengagements table
   * This allows the existing reward system to work with our data
   */
  private async storeIndividualEngagements(
    campaignId: bigint,
    _tweetId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
    likesData: unknown[],
    retweetsData: unknown[],
    quotesData: unknown[],
    repliesData: unknown[]
  ): Promise<void> {
    try {
      const engagementRecords: EngagementRecord[] = [];

      // Helper function to safely extract user ID from API response
      const extractUserId = (user: unknown): string | null => {
        if (user && typeof user === 'object' && 'id' in user) {
          return String((user as { id: unknown }).id);
        }
        return null;
      };

      // Process likes
      likesData.forEach((user) => {
        const userId = extractUserId(user);
        if (userId) {
          engagementRecords.push({
            tweet_id: campaignId,
            user_id: userId,
            engagement_type: 'like',
            updated_at: new Date(),
            payment_status: 'UNPAID',
            is_valid_timing: true,
          });
        }
      });

      // Process retweets
      retweetsData.forEach((user) => {
        const userId = extractUserId(user);
        if (userId) {
          engagementRecords.push({
            tweet_id: campaignId,
            user_id: userId,
            engagement_type: 'retweet',
            updated_at: new Date(),
            payment_status: 'UNPAID',
            is_valid_timing: true,
          });
        }
      });

      // Process quotes
      quotesData.forEach((user) => {
        const userId = extractUserId(user);
        if (userId) {
          engagementRecords.push({
            tweet_id: campaignId,
            user_id: userId,
            engagement_type: 'quote',
            updated_at: new Date(),
            payment_status: 'UNPAID',
            is_valid_timing: true,
          });
        }
      });

      // Process comments/replies
      repliesData.forEach((user) => {
        const userId = extractUserId(user);
        if (userId) {
          engagementRecords.push({
            tweet_id: campaignId,
            user_id: userId,
            engagement_type: 'comment',
            updated_at: new Date(),
            payment_status: 'UNPAID',
            is_valid_timing: true,
          });
        }
      });

      // Store all engagement records with proper database structure
      for (const record of engagementRecords) {
        // Check if record already exists to avoid duplicates
        const existingRecord =
          await this.prisma.campaign_tweetengagements.findFirst({
            where: {
              tweet_id: record.tweet_id,
              user_id: record.user_id,
              engagement_type: record.engagement_type,
            },
          });

        if (!existingRecord) {
          // Only create if record doesn't exist
          await this.prisma.campaign_tweetengagements.create({
            data: {
              tweet_id: record.tweet_id,
              user_id: record.user_id,
              engagement_type: record.engagement_type,
              updated_at: record.updated_at,
              payment_status: record.payment_status,
              is_valid_timing: record.is_valid_timing,
            },
          });
        } else {
          // Update the existing record if needed
          await this.prisma.campaign_tweetengagements.update({
            where: { id: existingRecord.id },
            data: {
              updated_at: record.updated_at,
              is_valid_timing: record.is_valid_timing,
            },
          });
        }
      }

      logger.info(
        `Stored ${engagementRecords.length} individual engagement records for campaign ${campaignId}`
      );
    } catch (error) {
      logger.err(
        `Error storing individual engagements: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Don't fail the whole process if this fails
    }
  }
  /**
   * Get current campaign metrics from database
   */
  async getCampaignMetrics(
    campaignId: bigint
  ): Promise<EngagementMetrics | null> {
    try {
      const stats = await this.prisma.campaign_tweetstats.findUnique({
        where: { twitter_card_id: campaignId },
      });

      if (!stats) {
        return null;
      }

      // Calculate total engagements and unique engagers from the stats
      const totalEngagements =
        (stats.like_count || 0) +
        (stats.retweet_count || 0) +
        (stats.quote_count || 0) +
        (stats.reply_count || 0);

      // Get actual unique engagers count from engagement records
      const uniqueEngagers =
        await this.prisma.campaign_tweetengagements.findMany({
          where: {
            tweet_id: campaignId,
            payment_status: 'UNPAID',
          },
          select: {
            user_id: true,
          },
          distinct: ['user_id'],
        });

      const uniqueEngagersCount = uniqueEngagers.length;

      return {
        likes: stats.like_count || 0,
        retweets: stats.retweet_count || 0,
        quotes: stats.quote_count || 0,
        comments: stats.reply_count || 0,
        totalEngagements,
        uniqueEngagers: uniqueEngagersCount,
      };
    } catch (error) {
      logger.err(
        `Error getting campaign metrics: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * Process engagement collection job from queue
   */
  async processEngagementCollection(
    jobData: CampaignTrackingJob
  ): Promise<void> {
    try {
      const campaignId = BigInt(jobData.campaignId);

      // Check if tracking is still active
      const currentTime = new Date();
      const endTime = new Date(jobData.endTime);

      if (currentTime > endTime && jobData.collectionType !== 'final') {
        logger.info(
          `Skipping expired collection job for campaign ${campaignId}`
        );
        return;
      }

      // Collect current engagement data
      const metrics = await this.collectEngagementData(
        campaignId,
        jobData.tweetId
      );

      // If this is the final collection, trigger campaign closing
      if (jobData.collectionType === 'final') {
        logger.info(
          `Final collection for campaign ${campaignId}, triggering close`
        );
        await this.triggerCampaignClosing(campaignId, metrics);
      }

      logger.info(
        `Processed ${jobData.collectionType} engagement collection for campaign ${campaignId}`
      );
    } catch (error) {
      logger.err(
        `Error processing engagement collection: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Trigger campaign closing with collected metrics
   */
  private async triggerCampaignClosing(
    campaignId: bigint,
    metrics: EngagementMetrics
  ): Promise<void> {
    try {
      logger.info(`Triggering campaign closing for campaign ${campaignId}`);

      // Import and use campaign closing service
      const { processCampaignClosing } = await import('./campaignClosing');

      const closingData = {
        campaignId: Number(campaignId),
        actualEngagers: metrics.uniqueEngagers,
        totalEngagements: metrics.totalEngagements,
        engagementBreakdown: {
          comments: metrics.comments,
          retweets: metrics.retweets,
          likes: metrics.likes,
          quotes: metrics.quotes,
        },
      };

      // Get campaign owner from database
      const campaign = await this.prisma.campaign_twittercard.findUnique({
        where: { id: campaignId },
        select: { owner_id: true },
      });

      if (campaign) {
        await processCampaignClosing(closingData, BigInt(campaign.owner_id));
        logger.info(`Triggered campaign closing for campaign ${campaignId}`);
      }
    } catch (error) {
      logger.err(
        `Error triggering campaign closing: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  /**
   * Stop tracking for a campaign
   */
  async stopCampaignTracking(
    campaignId: bigint
  ): Promise<EngagementMetrics | null> {
    try {
      const finalMetrics = await this.getCampaignMetrics(campaignId);

      logger.info(`Stopped tracking for campaign ${campaignId}`);
      return finalMetrics;
    } catch (error) {
      logger.err(
        `Error stopping campaign tracking: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }
}

export default XApiEngagementTracker;
