import { Request, Response } from 'express';
import MonitoringService, { TokenSyncStatus } from '../services/healthCheck';
import { completeCampaignOperation } from '@services/campaign-service';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';

/**
 * V201 Monitoring Controller
 * Provides health checks and monitoring endpoints for the V201 system
 */
class MonitoringController {
  /**
   * GET /api/v201/monitoring/health/bullmq
   * Check BullMQ queue health and job statistics
   */
  async getBullMQHealth(req: Request, res: Response) {
    try {
      const healthStatus = await MonitoringService.checkBullMQHealth();

      const status = healthStatus.isConnected ? 200 : 503;

      res.status(status).json({
        success: healthStatus.isConnected,
        data: healthStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`BullMQ health check failed: ${errorMsg}`);

      res.status(500).json({
        success: false,
        error: 'Internal server error during BullMQ health check',
        details: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * GET /api/v201/monitoring/health/system
   * Check overall system health (BullMQ, Database, Redis)
   */
  async getSystemHealth(req: Request, res: Response) {
    try {
      const systemHealth = await MonitoringService.checkSystemHealth();

      const isHealthy =
        systemHealth.bullmq.isConnected &&
        systemHealth.database.connected &&
        systemHealth.redis.connected;

      const status = isHealthy ? 200 : 503;

      res.status(status).json({
        success: isHealthy,
        data: {
          ...systemHealth,
          overall: {
            healthy: isHealthy,
            services: {
              bullmq: systemHealth.bullmq.isConnected ? 'healthy' : 'unhealthy',
              database: systemHealth.database.connected ? 'healthy' : 'unhealthy',
              redis: systemHealth.redis.connected ? 'healthy' : 'unhealthy',
            },
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`System health check failed: ${errorMsg}`);

      res.status(500).json({
        success: false,
        error: 'Internal server error during system health check',
        details: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * GET /api/v201/monitoring/campaigns/stuck
   * Find campaigns that are stuck and should have been processed
   */
  async getStuckCampaigns(req: Request, res: Response) {
    try {
      const stuckCampaigns = await MonitoringService.findStuckCampaigns();

      res.status(200).json({
        success: true,
        data: {
          count: stuckCampaigns.length,
          campaigns: stuckCampaigns,
          summary: {
            overdue_close: stuckCampaigns.filter(c => c.type === 'overdue_close').length,
            overdue_expiry: stuckCampaigns.filter(c => c.type === 'overdue_expiry').length,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`Failed to get stuck campaigns: ${errorMsg}`);

      res.status(500).json({
        success: false,
        error: 'Internal server error while fetching stuck campaigns',
        details: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * POST /api/v201/monitoring/campaigns/stuck/process
   * Manually process stuck campaigns
   */
  async processStuckCampaigns(req: Request, res: Response) {
    try {
      const stuckCampaigns = await MonitoringService.findStuckCampaigns();

      if (stuckCampaigns.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No stuck campaigns found',
          data: { processed: 0, failed: 0 },
          timestamp: new Date().toISOString(),
        });
      }

      const results = {
        processed: 0,
        failed: 0,
        details: [] as Array<{ campaignId: string; status: 'success' | 'failed'; error?: string }>,
      };

      const prisma = await createPrismaClient();

      for (const stuckCampaign of stuckCampaigns) {
        try {
          // Get the full campaign data
          const campaign = await prisma.campaign_twittercard.findUnique({
            where: { id: stuckCampaign.id },
            include: { user_user: true },
          });

          if (campaign) {
            await completeCampaignOperation(campaign);
            results.processed++;
            results.details.push({
              campaignId: campaign.id.toString(),
              status: 'success',
            });
            logger.info(`✅ Processed stuck campaign: ${campaign.id}`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.failed++;
          results.details.push({
            campaignId: stuckCampaign.id.toString(),
            status: 'failed',
            error: errorMsg,
          });
          logger.err(`❌ Failed to process stuck campaign ${stuckCampaign.id}: ${errorMsg}`);
        }
      }

      res.status(200).json({
        success: true,
        message: `Processed ${results.processed} campaigns, ${results.failed} failed`,
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`Failed to process stuck campaigns: ${errorMsg}`);

      res.status(500).json({
        success: false,
        error: 'Internal server error while processing stuck campaigns',
        details: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * GET /api/v201/monitoring/tokens/sync-status
   * Check token synchronization status between local DB and network
   */
  async getTokenSyncStatus(req: Request, res: Response) {
    try {
      const syncStatus = await MonitoringService.checkTokenSyncStatus();

      const status = syncStatus.syncStatus === 'error' ? 503 : 200;

      res.status(status).json({
        success: syncStatus.syncStatus !== 'error',
        data: syncStatus,
        recommendations: this.getTokenSyncRecommendations(syncStatus),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`Failed to get token sync status: ${errorMsg}`);

      res.status(500).json({
        success: false,
        error: 'Internal server error while checking token sync status',
        details: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Generate recommendations based on token sync status
   */
  private getTokenSyncRecommendations(syncStatus: TokenSyncStatus) {
    const recommendations = [];

    if (syncStatus.syncStatus === 'out_of_sync') {
      if (syncStatus.missingInLocal.length > 0) {
        recommendations.push(`${syncStatus.missingInLocal.length} tokens exist on network but not in local database`);
      }
      if (syncStatus.missingInNetwork.length > 0) {
        recommendations.push(`${syncStatus.missingInNetwork.length} tokens exist locally but not on network`);
      }
      recommendations.push('Consider running token synchronization to update local database');
    }

    if (syncStatus.syncStatus === 'never_synced') {
      recommendations.push('Token synchronization has never been run - consider initial sync');
    }

    if (syncStatus.syncStatus === 'error') {
      recommendations.push('Network connection or API error - check network connectivity and API endpoints');
    }

    return recommendations;
  }
}

export default new MonitoringController();
