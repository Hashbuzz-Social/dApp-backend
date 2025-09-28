import XEngagementTracker from './xEngagementTracker';
import logger from 'jet-logger';
import createPrismaClient from '@shared/prisma';
import { PrismaClient } from '@prisma/client';

interface CampaignStatusInfo {
  campaignId: bigint;
  status: 'tracking' | 'completed' | 'not_found';
  metrics?: {
    likes: number;
    retweets: number;
    quotes: number;
    comments: number;
    totalEngagements: number;
    uniqueEngagers: number;
  };
  lastUpdated?: Date;
}

/**
 * Simplified campaign lifecycle coordinator that works with existing services
 * The actual lifecycle management is handled by:
 * - Campaign publishing in campaignPublish/content.ts (starts engagement tracking)
 * - Scheduled campaign closing in CloseCampaign.ts (triggers reward distribution)
 * - This service just provides status and metrics information
 */
export class CampaignLifecycleOrchestrator {
  private engagementTracker: XEngagementTracker | null = null;
  private prisma: PrismaClient | null = null;

  constructor() {
    // Async initialization will happen on first use
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.prisma) {
      this.prisma = await createPrismaClient();
    }
    if (!this.engagementTracker) {
      this.engagementTracker = new XEngagementTracker(this.prisma);
    }
  }

  /**
   * Get current campaign status and metrics
   */
  async getCampaignStatus(campaignId: bigint): Promise<CampaignStatusInfo> {
    try {
      logger.info(`Getting status for campaign ${campaignId}`);

      await this.ensureInitialized();
      await this.ensureInitialized();
      const metrics = await this.engagementTracker?.getCampaignMetrics(
        campaignId
      );

      if (!metrics) {
        return {
          campaignId,
          status: 'not_found',
        };
      }

      return {
        campaignId,
        status: 'tracking',
        metrics,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.err(
        `Error getting campaign status: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {
        campaignId,
        status: 'not_found',
      };
    }
  }

  /**
   * Get engagement metrics for a campaign
   */
  async getCampaignMetrics(campaignId: bigint) {
    try {
      await this.ensureInitialized();
      return await this.engagementTracker?.getCampaignMetrics(campaignId);
    } catch (error) {
      logger.err(
        `Error getting campaign metrics: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }
}

// Singleton instance
let orchestratorInstance: CampaignLifecycleOrchestrator | null = null;

/**
 * Get singleton instance of campaign lifecycle orchestrator
 */
export const getLifecycleOrchestrator = (): CampaignLifecycleOrchestrator => {
  if (!orchestratorInstance) {
    orchestratorInstance = new CampaignLifecycleOrchestrator();
  }
  return orchestratorInstance;
};

export default CampaignLifecycleOrchestrator;
