import { PrismaClient, Prisma, campaign_tweetengagements, payment_status } from '@prisma/client';
import logger from 'jet-logger';

/**
 * Interface for creating new tweet engagement records
 */
export interface CreateTweetEngagementData {
  user_id: string;
  tweet_id: bigint;
  engagement_type: string;
  updated_at?: Date;
  engagement_timestamp?: Date;
  exprired_at?: Date;
  payment_status?: payment_status;
  is_valid_timing?: boolean;
}

/**
 * Interface for updating tweet engagement records
 */
export interface UpdateTweetEngagementData {
  user_id?: string;
  engagement_type?: string;
  updated_at?: Date;
  engagement_timestamp?: Date;
  exprired_at?: Date;
  payment_status?: payment_status;
  is_valid_timing?: boolean;
}

/**
 * Interface for engagement search filters
 */
export interface EngagementSearchFilters {
  user_id?: string;
  tweet_id?: bigint;
  engagement_type?: string;
  payment_status?: payment_status;
  is_valid_timing?: boolean;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Model class for handling campaign_tweetengagements database operations
 */
class CampaignTweetEngagementsModel {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  /**
   * Create a new tweet engagement record
   */
  async createEngagement(
    data: CreateTweetEngagementData
  ): Promise<campaign_tweetengagements> {
    try {
      const engagementData: Prisma.campaign_tweetengagementsCreateInput = {
        user_id: data.user_id,
        engagement_type: data.engagement_type,
        updated_at: data.updated_at || new Date(),
        engagement_timestamp: data.engagement_timestamp || new Date(),
        exprired_at: data.exprired_at,
        payment_status: data.payment_status || payment_status.UNPAID,
        is_valid_timing: data.is_valid_timing ?? true,
        campaign_twittercard: {
          connect: { id: data.tweet_id },
        },
      };

      const result = await this.prisma.campaign_tweetengagements.create({
        data: engagementData,
        include: {
          campaign_twittercard: {
            select: {
              id: true,
              tweet_id: true,
              name: true,
              card_status: true,
            },
          },
        },
      });

      logger.info(
        `Created tweet engagement record: ${result.id} for user ${data.user_id}`
      );
      return result;
    } catch (error) {
      logger.err(
        `Error creating tweet engagement: ${(error as Error).message}`
      );
      throw new Error(
        `Could not create tweet engagement: ${(error as Error).message}`
      );
    }
  }

  /**
   * Create multiple tweet engagement records in a single transaction
   */
  async createManyEngagements(dataArray: CreateTweetEngagementData[]): Promise<{
    count: number;
    successful: campaign_tweetengagements[];
    failed: Array<{ data: CreateTweetEngagementData; error: string }>;
  }> {
    const successful: campaign_tweetengagements[] = [];
    const failed: Array<{ data: CreateTweetEngagementData; error: string }> =
      [];

    try {
      // Use a transaction to ensure all operations are atomic
      await this.prisma.$transaction(async (prisma) => {
        for (const data of dataArray) {
          try {
            const engagementData: Prisma.campaign_tweetengagementsCreateInput =
              {
                user_id: data.user_id,
                engagement_type: data.engagement_type,
                updated_at: data.updated_at || new Date(),
                engagement_timestamp: data.engagement_timestamp || new Date(),
                exprired_at: data.exprired_at,
                payment_status: data.payment_status || payment_status.UNPAID,
                is_valid_timing: data.is_valid_timing ?? true,
                campaign_twittercard: {
                  connect: { id: data.tweet_id },
                },
              };

            const result = await prisma.campaign_tweetengagements.create({
              data: engagementData,
              include: {
                campaign_twittercard: {
                  select: {
                    id: true,
                    tweet_id: true,
                    name: true,
                    card_status: true,
                  },
                },
              },
            });

            successful.push(result);
          } catch (error) {
            const errorMessage = (error as Error).message;
            logger.err(
              `Error creating engagement for user ${data.user_id}: ${errorMessage}`
            );
            failed.push({
              data,
              error: errorMessage,
            });
          }
        }
      });

      logger.info(
        `Created ${successful.length} tweet engagement records successfully, ${failed.length} failed`
      );

      return {
        count: successful.length,
        successful,
        failed,
      };
    } catch (error) {
      logger.err(
        `Error in createManyEngagements transaction: ${
          (error as Error).message
        }`
      );
      throw new Error(
        `Could not create multiple tweet engagements: ${
          (error as Error).message
        }`
      );
    }
  }

  /**
   * Bulk create multiple engagements using Prisma's createMany (faster but less detailed error handling)
   */
  async bulkCreateEngagements(dataArray: CreateTweetEngagementData[]): Promise<{
    count: number;
    createdIds?: bigint[];
  }> {
    try {
      // Transform the data for bulk insert
      const engagementDataArray = dataArray.map((data) => ({
        user_id: data.user_id,
        tweet_id: data.tweet_id,
        engagement_type: data.engagement_type,
        updated_at: data.updated_at || new Date(),
        engagement_timestamp: data.engagement_timestamp || new Date(),
        exprired_at: data.exprired_at,
        payment_status: data.payment_status || payment_status.UNPAID,
        is_valid_timing: data.is_valid_timing ?? true,
      }));

      const result = await this.prisma.campaign_tweetengagements.createMany({
        data: engagementDataArray,
        skipDuplicates: true, // Skip records that would cause unique constraint violations
      });

      logger.info(`Bulk created ${result.count} tweet engagement records`);

      return {
        count: result.count,
      };
    } catch (error) {
      logger.err(
        `Error in bulk create engagements: ${(error as Error).message}`
      );
      throw new Error(
        `Could not bulk create tweet engagements: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get engagement by ID
   */
  async getEngagementById(
    id: bigint
  ): Promise<campaign_tweetengagements | null> {
    try {
      return await this.prisma.campaign_tweetengagements.findUnique({
        where: { id },
        include: {
          campaign_twittercard: {
            select: {
              id: true,
              tweet_id: true,
              name: true,
              card_status: true,
              owner_id: true,
            },
          },
        },
      });
    } catch (error) {
      logger.err(
        `Error fetching engagement by ID ${id}: ${(error as Error).message}`
      );
      throw new Error(
        `Could not fetch engagement by ID: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get engagements by campaign (tweet) ID
   */
  async getEngagementsByCampaign(
    tweetId: bigint,
    filters?: Partial<EngagementSearchFilters>
  ): Promise<campaign_tweetengagements[]> {
    try {
      const where: Prisma.campaign_tweetengagementsWhereInput = {
        tweet_id: tweetId,
        ...(filters?.user_id && { user_id: filters.user_id }),
        ...(filters?.engagement_type && {
          engagement_type: filters.engagement_type,
        }),
        ...(filters?.payment_status && {
          payment_status: filters.payment_status,
        }),
        ...(filters?.is_valid_timing !== undefined && {
          is_valid_timing: filters.is_valid_timing,
        }),
        ...((filters?.startDate || filters?.endDate) && {
          engagement_timestamp: {
            ...(filters.startDate && { gte: filters.startDate }),
            ...(filters.endDate && { lte: filters.endDate }),
          },
        }),
      };

      return await this.prisma.campaign_tweetengagements.findMany({
        where,
        include: {
          campaign_twittercard: {
            select: {
              id: true,
              tweet_id: true,
              name: true,
              card_status: true,
            },
          },
        },
        orderBy: { engagement_timestamp: 'desc' },
      });
    } catch (error) {
      logger.err(
        `Error fetching engagements for campaign ${tweetId}: ${
          (error as Error).message
        }`
      );
      throw new Error(
        `Could not fetch engagements for campaign: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get engagements by user ID
   */
  async getEngagementsByUser(
    userId: string,
    filters?: Partial<EngagementSearchFilters>
  ): Promise<campaign_tweetengagements[]> {
    try {
      const where: Prisma.campaign_tweetengagementsWhereInput = {
        user_id: userId,
        ...(filters?.tweet_id && { tweet_id: filters.tweet_id }),
        ...(filters?.engagement_type && {
          engagement_type: filters.engagement_type,
        }),
        ...(filters?.payment_status && {
          payment_status: filters.payment_status,
        }),
        ...(filters?.is_valid_timing !== undefined && {
          is_valid_timing: filters.is_valid_timing,
        }),
        ...((filters?.startDate || filters?.endDate) && {
          engagement_timestamp: {
            ...(filters.startDate && { gte: filters.startDate }),
            ...(filters.endDate && { lte: filters.endDate }),
          },
        }),
      };

      return await this.prisma.campaign_tweetengagements.findMany({
        where,
        include: {
          campaign_twittercard: {
            select: {
              id: true,
              tweet_id: true,
              name: true,
              card_status: true,
              owner_id: true,
            },
          },
        },
        orderBy: { engagement_timestamp: 'desc' },
      });
    } catch (error) {
      logger.err(
        `Error fetching engagements for user ${userId}: ${
          (error as Error).message
        }`
      );
      throw new Error(
        `Could not fetch engagements for user: ${(error as Error).message}`
      );
    }
  }

  /**
   * Update engagement record
   */
  async updateEngagement(
    id: bigint,
    data: UpdateTweetEngagementData
  ): Promise<campaign_tweetengagements> {
    try {
      const updateData: Prisma.campaign_tweetengagementsUpdateInput = {
        ...(data.user_id && { user_id: data.user_id }),
        ...(data.engagement_type && { engagement_type: data.engagement_type }),
        ...(data.updated_at && { updated_at: data.updated_at }),
        ...(data.engagement_timestamp && {
          engagement_timestamp: data.engagement_timestamp,
        }),
        ...(data.exprired_at && { exprired_at: data.exprired_at }),
        ...(data.payment_status && { payment_status: data.payment_status }),
        ...(data.is_valid_timing !== undefined && {
          is_valid_timing: data.is_valid_timing,
        }),
      };

      const result = await this.prisma.campaign_tweetengagements.update({
        where: { id },
        data: updateData,
        include: {
          campaign_twittercard: {
            select: {
              id: true,
              tweet_id: true,
              name: true,
              card_status: true,
            },
          },
        },
      });

      logger.info(`Updated tweet engagement record: ${id}`);
      return result;
    } catch (error) {
      logger.err(
        `Error updating engagement ${id}: ${(error as Error).message}`
      );
      throw new Error(
        `Could not update engagement: ${(error as Error).message}`
      );
    }
  }

  /**
   * Update payment status for multiple engagements
   */
  async updatePaymentStatus(
    engagementIds: bigint[],
    paymentStatus: payment_status
  ): Promise<number> {
    try {
      const result = await this.prisma.campaign_tweetengagements.updateMany({
        where: {
          id: { in: engagementIds },
        },
        data: {
          payment_status: paymentStatus,
          updated_at: new Date(),
        },
      });

      logger.info(
        `Updated payment status for ${result.count} engagements to ${paymentStatus}`
      );
      return result.count;
    } catch (error) {
      logger.err(`Error updating payment status: ${(error as Error).message}`);
      throw new Error(
        `Could not update payment status: ${(error as Error).message}`
      );
    }
  }

  /**
   * Delete engagement record
   */
  async deleteEngagement(id: bigint): Promise<boolean> {
    try {
      await this.prisma.campaign_tweetengagements.delete({
        where: { id },
      });

      logger.info(`Deleted tweet engagement record: ${id}`);
      return true;
    } catch (error) {
      logger.err(
        `Error deleting engagement ${id}: ${(error as Error).message}`
      );
      throw new Error(
        `Could not delete engagement: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get engagement statistics for a campaign
   */
  async getEngagementStats(tweetId: bigint): Promise<{
    total: number;
    byType: Record<string, number>;
    byPaymentStatus: Record<string, number>;
    validTimingCount: number;
    invalidTimingCount: number;
  }> {
    try {
      const engagements = await this.prisma.campaign_tweetengagements.findMany({
        where: { tweet_id: tweetId },
        select: {
          engagement_type: true,
          payment_status: true,
          is_valid_timing: true,
        },
      });

      const stats = {
        total: engagements.length,
        byType: {} as Record<string, number>,
        byPaymentStatus: {} as Record<string, number>,
        validTimingCount: 0,
        invalidTimingCount: 0,
      };

      engagements.forEach((engagement) => {
        // Count by engagement type
        stats.byType[engagement.engagement_type] =
          (stats.byType[engagement.engagement_type] || 0) + 1;

        // Count by payment status
        stats.byPaymentStatus[engagement.payment_status] =
          (stats.byPaymentStatus[engagement.payment_status] || 0) + 1;

        // Count by timing validity
        if (engagement.is_valid_timing) {
          stats.validTimingCount++;
        } else {
          stats.invalidTimingCount++;
        }
      });

      return stats;
    } catch (error) {
      logger.err(
        `Error fetching engagement stats for campaign ${tweetId}: ${
          (error as Error).message
        }`
      );
      throw new Error(
        `Could not fetch engagement stats: ${(error as Error).message}`
      );
    }
  }

  /**
   * Check if engagement exists for user and campaign
   */
  async checkEngagementExists(
    userId: string,
    tweetId: bigint,
    engagementType: string
  ): Promise<boolean> {
    try {
      const count = await this.prisma.campaign_tweetengagements.count({
        where: {
          user_id: userId,
          tweet_id: tweetId,
          engagement_type: engagementType,
        },
      });

      return count > 0;
    } catch (error) {
      logger.err(
        `Error checking engagement existence: ${(error as Error).message}`
      );
      return false;
    }
  }

  /**
   * Get unpaid engagements for reward distribution
   */
  async getUnpaidEngagements(
    tweetId?: bigint,
    limit?: number
  ): Promise<campaign_tweetengagements[]> {
    try {
      const where: Prisma.campaign_tweetengagementsWhereInput = {
        payment_status: payment_status.UNPAID,
        is_valid_timing: true,
        ...(tweetId && { tweet_id: tweetId }),
      };

      return await this.prisma.campaign_tweetengagements.findMany({
        where,
        include: {
          campaign_twittercard: {
            select: {
              id: true,
              tweet_id: true,
              name: true,
              card_status: true,
              owner_id: true,
              like_reward: true,
              retweet_reward: true,
              quote_reward: true,
              comment_reward: true,
            },
          },
        },
        orderBy: { engagement_timestamp: 'asc' },
        ...(limit && { take: limit }),
      });
    } catch (error) {
      logger.err(
        `Error fetching unpaid engagements: ${(error as Error).message}`
      );
      throw new Error(
        `Could not fetch unpaid engagements: ${(error as Error).message}`
      );
    }
  }
}

export default CampaignTweetEngagementsModel;
