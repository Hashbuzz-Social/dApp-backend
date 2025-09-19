import { Queue } from 'bullmq';
import { parseRedisURL } from '@V201/modules/common';
import { getConfig } from '@appConfig';
import { CampaignSheduledEvents } from '@V201/events/campaign';
import createPrismaClient from '@shared/prisma';
import { MonitoringModel } from '@V201/Modals/Monitoring';
import logger from 'jet-logger';
import { campaignstatus } from '@prisma/client';

export interface BullMQHealthStatus {
  isConnected: boolean;
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  error?: string;
}

export interface SystemHealthStatus {
  bullmq: BullMQHealthStatus;
  database: {
    connected: boolean;
    error?: string;
  };
  redis: {
    connected: boolean;
    error?: string;
  };
}

export interface StuckCampaignInfo {
  id: bigint;
  name: string | null;
  card_status: campaignstatus;
  campaign_close_time: Date | null;
  campaign_expiry: Date | null;
  owner_id: bigint;
  stuckDuration: string; // Human readable duration
  type: 'overdue_close' | 'overdue_expiry';
}

export interface TokenSyncStatus {
  localTokenCount: number;
  networkTokenCount?: number;
  lastSyncTime?: Date;
  syncStatus: 'synced' | 'out_of_sync' | 'never_synced' | 'error';
  missingInLocal: string[];
  missingInNetwork: string[];
  error?: string;
}

class MonitoringService {
  private async getMonitoringModel(): Promise<MonitoringModel> {
    const prisma = await createPrismaClient();
    return new MonitoringModel(prisma);
  }
  /**
   * Check BullMQ queue health and job statistics
   */
  async checkBullMQHealth(): Promise<BullMQHealthStatus> {
    try {
      const config = await getConfig();
      const queue = new Queue(CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION, {
        connection: {
          host: parseRedisURL(config.db.redisServerURI).host,
          port: parseRedisURL(config.db.redisServerURI).port,
        },
      });

      const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
        queue.isPaused(),
      ]);

      await queue.close();

      return {
        isConnected: true,
        queueName: CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: isPaused,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`BullMQ health check failed: ${errorMsg}`);

      return {
        isConnected: false,
        queueName: CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Check overall system health
   */
  async checkSystemHealth(): Promise<SystemHealthStatus> {
    const bullmq = await this.checkBullMQHealth();

    // Check database connection
    let database: { connected: boolean; error?: string } = { connected: true };
    try {
      const monitoringModel = await this.getMonitoringModel();
      const dbHealth = await monitoringModel.checkDatabaseHealth();
      database = { connected: dbHealth.healthy, error: dbHealth.error };
    } catch (error) {
      database = {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Check Redis connection (separate from BullMQ)
    let redis: { connected: boolean; error?: string } = { connected: true };
    try {
      const config = await getConfig();
      const { createClient } = await import('redis');
      const redisClient = createClient({
        url: config.db.redisServerURI,
      });
      await redisClient.connect();
      await redisClient.ping();
      await redisClient.quit();
    } catch (error) {
      redis = {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      bullmq,
      database,
      redis,
    };
  }

  /**
   * Find campaigns that are stuck and should have been processed
   */
  async findStuckCampaigns(): Promise<StuckCampaignInfo[]> {
    try {
      const monitoringModel = await this.getMonitoringModel();
      const stuckCampaigns = await monitoringModel.getStuckCampaigns();
      const now = new Date();

      return stuckCampaigns.map((campaign) => {
        const stuckDurationMs = now.getTime() - (campaign.campaign_expiry?.getTime() || now.getTime());
        const stuckDurationHours = Math.floor(stuckDurationMs / (1000 * 60 * 60));
        const stuckDurationMinutes = Math.floor((stuckDurationMs % (1000 * 60 * 60)) / (1000 * 60));

        return {
          id: campaign.id,
          name: campaign.name,
          card_status: campaign.card_status,
          campaign_close_time: campaign.campaign_close_time,
          campaign_expiry: campaign.campaign_expiry,
          owner_id: BigInt(0), // We'll need to add this to the MonitoringModel if needed
          stuckDuration: `${stuckDurationHours}h ${stuckDurationMinutes}m`,
          type: 'overdue_expiry' as const,
        };
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`Failed to find stuck campaigns: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Check token synchronization status between local DB and network
   */
  async checkTokenSyncStatus(): Promise<TokenSyncStatus> {
    try {
      const monitoringModel = await this.getMonitoringModel();

      // Get local tokens via MonitoringModel
      const localBalances = await monitoringModel.getTokenBalances();
      const uniqueTokens = new Map();

      localBalances.forEach(balance => {
        if (balance.whiteListedTokens) {
          uniqueTokens.set(balance.whiteListedTokens.token_id, {
            token_id: balance.whiteListedTokens.token_id,
            created_at: balance.created_at,
          });
        }
      });

      const localTokens = Array.from(uniqueTokens.values());

      const result: TokenSyncStatus = {
        localTokenCount: localTokens.length,
        lastSyncTime: localTokens.length > 0 ?
          localTokens.reduce<Date | undefined>((latest, token) =>
            token.created_at && (!latest || token.created_at > latest) ? token.created_at : latest,
            undefined
          ) : undefined,
        syncStatus: 'never_synced',
        missingInLocal: [],
        missingInNetwork: [],
      };

      try {
        // Try to get network tokens (similar to what associatedTokens.checkAvailableTokens did)
        const config = await getConfig();
        const accountId = config.network.contractAddress;

        if (accountId) {
          const NetworkHelpers = (await import('@shared/NetworkHelpers')).default;
          const networkHelpers = new NetworkHelpers(config.app.mirrorNodeURL);
          const accountData: any = await networkHelpers.getAccountDetails(accountId);
          const networkTokens: any[] = accountData.balance?.tokens || [];

          result.networkTokenCount = networkTokens.length;

          const localTokenIds = localTokens.map(t => t.token_id);
          const networkTokenIds: string[] = networkTokens.map((t: any) => String(t.token_id));

          result.missingInLocal = networkTokenIds.filter((id: string) => !localTokenIds.includes(id));
          result.missingInNetwork = localTokenIds.filter(id => !networkTokenIds.includes(id));

          if (result.missingInLocal.length === 0 && result.missingInNetwork.length === 0) {
            result.syncStatus = 'synced';
          } else {
            result.syncStatus = 'out_of_sync';
          }
        }
      } catch (networkError) {
        result.error = networkError instanceof Error ? networkError.message : String(networkError);
        result.syncStatus = 'error';
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`Failed to check token sync status: ${errorMsg}`);
      return {
        localTokenCount: 0,
        syncStatus: 'error',
        missingInLocal: [],
        missingInNetwork: [],
        error: errorMsg,
      };
    }
  }
}

export default new MonitoringService();
