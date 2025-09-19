import { getHCSService, HCSMessageType, HCSMessage, HederaConsensusService } from '../services/hedera-consensus-service';
import { EventPayloadMap } from './Types/eventPayload';
import { CampaignEvents } from './AppEvents';
import { publishEvent } from './eventPublisher';
import logger from 'jet-logger';

/**
 * Enhanced event publisher that integrates with Hedera Consensus Service
 * Provides immutable audit trails for critical business events
 */
export class HCSEventPublisher {
  private static instance: HCSEventPublisher | null = null;
  private hcsService: HederaConsensusService | null = null;
  private initialized = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  static getInstance(): HCSEventPublisher {
    if (!HCSEventPublisher.instance) {
      HCSEventPublisher.instance = new HCSEventPublisher();
    }
    return HCSEventPublisher.instance;
  }

  /**
   * Initialize HCS integration
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.hcsService = await getHCSService();
      await this.hcsService.initializeDefaultTopics();
      this.initialized = true;
      logger.info('HCS Event Publisher initialized successfully');
    } catch (error) {
      logger.warn(`HCS Event Publisher initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw - allow graceful degradation
    }
  }

  /**
   * Publish event with optional HCS logging
   */
  async publishEvent<K extends keyof EventPayloadMap>(
    eventType: K,
    payload: EventPayloadMap[K],
    options?: {
      useHCS?: boolean;
      hcsTopic?: string;
      priority?: 'low' | 'normal' | 'high';
    }
  ): Promise<{ eventId: number | null; hcsTransactionId?: string }> {
    // Always publish to regular event system
    const eventId = await publishEvent(eventType, payload);

    let hcsTransactionId: string | undefined;

    // Optionally publish to HCS for audit trail
    if (options?.useHCS && this.initialized && this.hcsService) {
      try {
        const hcsMessage = this.createHCSMessage(eventType, payload);
        const topicName = options.hcsTopic || this.getDefaultTopicForEvent(eventType);

        if (topicName) {
          hcsTransactionId = await this.hcsService.submitMessage(topicName, hcsMessage);
          logger.info(`Event published to HCS: ${eventType} -> ${hcsTransactionId ?? 'undefined'}`);
        }
      } catch (hcsError) {
        logger.warn(`Failed to publish event to HCS: ${hcsError instanceof Error ? hcsError.message : String(hcsError)}`);
        // Don't fail the entire operation if HCS fails
      }
    }

    return { eventId: eventId ? Number(eventId) : null, hcsTransactionId };
  }

  /**
   * Publish campaign lifecycle event with automatic HCS logging
   */
  async publishCampaignEvent<K extends keyof EventPayloadMap>(
    eventType: K,
    payload: EventPayloadMap[K]
  ): Promise<{ eventId: number | null; hcsTransactionId?: string }> {
    return this.publishEvent(eventType, payload, {
      useHCS: true,
      hcsTopic: 'campaign-lifecycle',
    });
  }

  /**
   * Publish engagement tracking event with HCS verification
   */
  async publishEngagementEvent(
    campaignId: bigint,
    engagementData: {
      tweetId: string;
      metrics: {
        likes: number;
        retweets: number;
        quotes: number;
        comments: number;
        totalEngagements: number;
        uniqueEngagers: number;
      };
      collectedAt: Date;
    }
  ): Promise<string | undefined> {
    if (!this.initialized || !this.hcsService) {
      logger.warn('HCS not initialized - skipping engagement event');
      return undefined;
    }

    try {
      const hcsMessage: HCSMessage = {
        messageType: HCSMessageType.ENGAGEMENT_TRACKED,
        timestamp: new Date().toISOString(),
        version: '1.0',
        campaignId,
        data: {
          tweetId: engagementData.tweetId,
          metrics: engagementData.metrics,
          collectedAt: engagementData.collectedAt.toISOString(),
          source: 'x-api-engagement-tracker',
        },
      };

      const transactionId = await this.hcsService.submitMessage('engagement-tracking', hcsMessage);
      logger.info(`Engagement metrics published to HCS: ${transactionId}`);
      return transactionId;
    } catch (error) {
      logger.warn(`Failed to publish engagement to HCS: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  /**
   * Publish reward distribution event with HCS audit trail
   */
  async publishRewardEvent(
    campaignId: bigint,
    userId: bigint,
    rewardData: {
      amount: number;
      tokenType: 'HBAR' | 'FUNGIBLE';
      tokenId?: string;
      transactionId?: string;
      engagementType: string;
      calculationDetails: Record<string, any>;
    }
  ): Promise<string | undefined> {
    if (!this.initialized || !this.hcsService) {
      return undefined;
    }

    try {
      const hcsMessage: HCSMessage = {
        messageType: HCSMessageType.REWARD_DISTRIBUTED,
        timestamp: new Date().toISOString(),
        version: '1.0',
        campaignId,
        userId,
        transactionId: rewardData.transactionId,
        data: {
          ...rewardData,
          distributedAt: new Date().toISOString(),
        },
      };

      const transactionId = await this.hcsService.submitMessage('reward-distribution', hcsMessage);
      logger.info(`Reward distribution published to HCS: ${transactionId}`);
      return transactionId;
    } catch (error) {
      logger.warn(`Failed to publish reward to HCS: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  /**
   * Publish user action event for security audit
   */
  async publishUserActionEvent(
    userId: bigint,
    action: string,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string | undefined> {
    if (!this.initialized || !this.hcsService) {
      return undefined;
    }

    try {
      const hcsMessage: HCSMessage = {
        messageType: HCSMessageType.USER_ACTION,
        timestamp: new Date().toISOString(),
        version: '1.0',
        userId,
        data: {
          action,
          details,
          ipAddress,
          userAgent,
          timestamp: new Date().toISOString(),
        },
      };

      const transactionId = await this.hcsService.submitMessage('user-actions', hcsMessage);
      logger.info(`User action published to HCS: ${transactionId}`);
      return transactionId;
    } catch (error) {
      logger.warn(`Failed to publish user action to HCS: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  /**
   * Publish transaction record to HCS
   */
  async publishTransactionRecord(
    transactionId: string,
    transactionType: string,
    details: Record<string, any>,
    campaignId?: bigint,
    userId?: bigint
  ): Promise<string | undefined> {
    if (!this.initialized || !this.hcsService) {
      return undefined;
    }

    try {
      const hcsMessage: HCSMessage = {
        messageType: HCSMessageType.TRANSACTION_RECORD,
        timestamp: new Date().toISOString(),
        version: '1.0',
        campaignId,
        userId,
        transactionId,
        data: {
          transactionType,
          details,
          recordedAt: new Date().toISOString(),
        },
      };

      const hcsTransactionId = await this.hcsService.submitMessage('transaction-records', hcsMessage);
      logger.info(`Transaction record published to HCS: ${hcsTransactionId}`);
      return hcsTransactionId;
    } catch (error) {
      logger.warn(`Failed to publish transaction record to HCS: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  /**
   * Query HCS messages for audit reporting
   */
  async queryAuditTrail(
    topicName: string,
    startTime?: Date,
    endTime?: Date,
    limit?: number
  ): Promise<HCSMessage[]> {
    if (!this.initialized || !this.hcsService) {
      return [];
    }

    try {
      return await this.hcsService.queryMessages(topicName, startTime, endTime, limit);
    } catch (error) {
      logger.err(`Failed to query HCS audit trail: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Get campaign audit trail from HCS
   */
  async getCampaignAuditTrail(
    campaignId: bigint,
    startTime?: Date,
    endTime?: Date
  ): Promise<HCSMessage[]> {
    const messages = await this.queryAuditTrail('campaign-lifecycle', startTime, endTime, 1000);
    return messages.filter(msg => msg.campaignId === campaignId);
  }

  /**
   * Get user activity audit trail from HCS
   */
  async getUserAuditTrail(
    userId: bigint,
    startTime?: Date,
    endTime?: Date
  ): Promise<HCSMessage[]> {
    const messages = await this.queryAuditTrail('user-actions', startTime, endTime, 1000);
    return messages.filter(msg => msg.userId === userId);
  }

  /**
   * Create HCS message from event payload
   */
  private createHCSMessage<K extends keyof EventPayloadMap>(
    eventType: K,
    payload: EventPayloadMap[K]
  ): HCSMessage {
    const hcsMessageType = this.mapEventToHCSMessageType(eventType);

    return {
      messageType: hcsMessageType,
      timestamp: new Date().toISOString(),
      version: '1.0',
      campaignId: this.extractCampaignId(payload),
      userId: this.extractUserId(payload),
      data: {
        eventType,
        payload,
        source: 'hashbuzz-backend',
      },
    };
  }

  /**
   * Map internal event types to HCS message types
   */
  private mapEventToHCSMessageType(eventType: keyof EventPayloadMap): HCSMessageType {
    const mapping: Partial<Record<keyof EventPayloadMap, HCSMessageType>> = {
      [CampaignEvents.CAMPAIGN_DRAFT_SUCCESS]: HCSMessageType.CAMPAIGN_CREATED,
      [CampaignEvents.CAMPAIGN_PUBLISH_CONTENT]: HCSMessageType.CAMPAIGN_PUBLISHED,
      [CampaignEvents.CAMPAIGN_CLOSED]: HCSMessageType.CAMPAIGN_CLOSED,
      [CampaignEvents.CAMPAIGN_RATE_UPDATED]: HCSMessageType.RATE_UPDATED,
      [CampaignEvents.CAMPAIGN_BUDGET_REFUND]: HCSMessageType.BUDGET_REFUND,
      [CampaignEvents.CAMPAIGN_PUBLISH_ERROR]: HCSMessageType.ERROR_EVENT,
      [CampaignEvents.CAMPAIGN_CLOSING_ERROR]: HCSMessageType.ERROR_EVENT,
    };

    return mapping[eventType] || HCSMessageType.USER_ACTION;
  }

  /**
   * Get default HCS topic for event type
   */
  private getDefaultTopicForEvent(eventType: keyof EventPayloadMap): string | null {
    if (eventType.toString().includes('CAMPAIGN_')) {
      return 'campaign-lifecycle';
    }
    if (eventType.toString().includes('REWARD_') || eventType.toString().includes('BALANCE_')) {
      return 'reward-distribution';
    }
    if (eventType.toString().includes('TRANSACTION_')) {
      return 'transaction-records';
    }
    if (eventType.toString().includes('ERROR_')) {
      return 'error-logs';
    }
    return 'user-actions';
  }

  /**
   * Extract campaign ID from event payload
   */
  private extractCampaignId(payload: any): bigint | undefined {
    if (typeof payload === 'object' && payload) {
      const campaignId = payload.campaignId || payload.campaign_id || payload.card?.id;
      return typeof campaignId === 'bigint' ? campaignId : undefined;
    }
    return undefined;
  }

  /**
   * Extract user ID from event payload
   */
  private extractUserId(payload: any): bigint | undefined {
    if (typeof payload === 'object' && payload) {
      const userId = payload.userId || payload.user_id || payload.cardOwner?.id;
      return typeof userId === 'bigint' ? userId : undefined;
    }
    return undefined;
  }

  /**
   * Get initialization status
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export singleton instance and convenience functions
export const hcsEventPublisher = HCSEventPublisher.getInstance();

/**
 * Convenience function for publishing events with HCS integration
 */
export const publishEventWithHCS = async <K extends keyof EventPayloadMap>(
  eventType: K,
  payload: EventPayloadMap[K],
  useHCS = false
) => {
  const publisher = HCSEventPublisher.getInstance();
  await publisher.init();
  return publisher.publishEvent(eventType, payload, { useHCS });
};

export default HCSEventPublisher;
