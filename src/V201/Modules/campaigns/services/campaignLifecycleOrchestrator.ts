import XEngagementTracker from './xEngagementTracker';
import logger from 'jet-logger';

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
  private engagementTracker: XEngagementTracker;

  constructor() {
    this.engagementTracker = new XEngagementTracker();
  }

  /**
   * Get current campaign status and metrics
   */
  async getCampaignStatus(campaignId: bigint): Promise<CampaignStatusInfo> {
    try {
      logger.info(`Getting status for campaign ${campaignId}`);

      const metrics = await this.engagementTracker.getCampaignMetrics(campaignId);

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
      logger.err(`Error getting campaign status: ${error instanceof Error ? error.message : String(error)}`);
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
      return await this.engagementTracker.getCampaignMetrics(campaignId);
    } catch (error) {
      logger.err(`Error getting campaign metrics: ${error instanceof Error ? error.message : String(error)}`);
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
