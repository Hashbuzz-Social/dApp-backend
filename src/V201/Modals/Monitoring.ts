import { PrismaClient, campaignstatus } from '@prisma/client';

class MonitoringModel {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  /**
   * Get campaigns that are stuck in processing states past their end time
   * Using campaigns that are still in progress states after their expiry
   */
  async getStuckCampaigns() {
    try {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      return await this.prisma.campaign_twittercard.findMany({
        where: {
          AND: [
            {
              OR: [
                { card_status: campaignstatus.CampaignStarted },
                { card_status: campaignstatus.CampaignRunning },
                { card_status: campaignstatus.RewardDistributionInProgress }
              ]
            },
            {
              campaign_expiry: {
                lt: thirtyMinutesAgo
              }
            }
          ]
        },
        select: {
          id: true,
          card_status: true,
          campaign_expiry: true,
          campaign_start_time: true,
          campaign_close_time: true,
          name: true,
          tweet_text: true
        },
        orderBy: {
          campaign_expiry: 'asc'
        }
      });
    } catch (error) {
      console.error('Error fetching stuck campaigns:', error);
      throw new Error('Could not fetch stuck campaigns.');
    }
  }

  /**
   * Get campaigns by status for monitoring
   */
  async getCampaignsByStatus(statuses: campaignstatus[]) {
    try {
      return await this.prisma.campaign_twittercard.findMany({
        where: {
          card_status: {
            in: statuses
          }
        },
        select: {
          id: true,
          card_status: true,
          campaign_start_time: true,
          campaign_expiry: true,
          campaign_close_time: true
        }
      });
    } catch (error) {
      throw new Error('Could not fetch campaigns by status.');
    }
  }

  /**
   * Update campaign status - used for stuck campaign recovery
   */
  async updateCampaignStatus(id: bigint, status: campaignstatus) {
    try {
      return await this.prisma.campaign_twittercard.update({
        where: { id },
        data: {
          card_status: status
        }
      });
    } catch (error) {
      throw new Error('Could not update campaign status.');
    }
  }

  /**
   * Get token balance records for sync monitoring
   */
  async getTokenBalances() {
    try {
      return await this.prisma.user_balances.findMany({
        include: {
          whiteListedTokens: {
            select: {
              token_symbol: true,
              token_id: true,
              name: true
            }
          }
        },
        orderBy: {
          updated_at: 'desc'
        },
        take: 100 // Limit to recent records for monitoring
      });
    } catch (error) {
      throw new Error('Could not fetch token balances.');
    }
  }

  /**
   * Get recent campaign logs for monitoring
   */
  async getRecentCampaignLogs(limit = 50) {
    try {
      return await this.prisma.campaignLog.findMany({
        orderBy: {
          timestamp: 'desc'
        },
        take: limit,
        select: {
          id: true,
          campaign_id: true,
          status: true,
          message: true,
          timestamp: true
        }
      });
    } catch (error) {
      throw new Error('Could not fetch recent campaign logs.');
    }
  }

  /**
   * Get campaign statistics for monitoring dashboard
   */
  async getCampaignStatistics() {
    try {
      const [total, approved, running, distributingRewards, completed, failed] = await Promise.all([
        this.prisma.campaign_twittercard.count(),
        this.prisma.campaign_twittercard.count({
          where: { card_status: campaignstatus.CampaignApproved }
        }),
        this.prisma.campaign_twittercard.count({
          where: { card_status: campaignstatus.CampaignRunning }
        }),
        this.prisma.campaign_twittercard.count({
          where: { card_status: campaignstatus.RewardDistributionInProgress }
        }),
        this.prisma.campaign_twittercard.count({
          where: { card_status: campaignstatus.RewardsDistributed }
        }),
        this.prisma.campaign_twittercard.count({
          where: { card_status: campaignstatus.InternalError }
        })
      ]);

      return {
        total,
        approved,
        running,
        distributingRewards,
        completed,
        failed
      };
    } catch (error) {
      throw new Error('Could not fetch campaign statistics.');
    }
  }

  /**
   * Check database connection health
   */
  async checkDatabaseHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export { MonitoringModel };
