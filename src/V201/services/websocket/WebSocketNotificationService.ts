/**
 * Enhanced WebSocket Service for Campaign and Balance Notifications
 *
 * Extends the existing WebSocket functionality to provide real-time updates
 * for campaign events and balance changes using the hybrid HCS + WebSocket approach.
 */

import Logger from 'jet-logger';
import { sendToUser } from '../../websocket/websocketManager';
import {
  WebSocketEventType,
  CampaignStatusUpdatePayload,
  CampaignPublishedSuccessPayload,
  BalanceUpdatePayload,
  CampaignEngagementUpdatePayload,
  RewardDistributionUpdatePayload,
  SystemNotificationPayload,
} from '../../types/campaignEvents';
import { campaignstatus } from '@prisma/client';

export class WebSocketNotificationService {
  /**
   * Send campaign published success notification
   */
  static async notifyCampaignPublished(
    userId: string,
    campaignData: {
      campaignId: string;
      campaignTitle: string;
      firstTweetUrl: string;
      secondTweetUrl: string;
      estimatedCloseTime: Date;
      budgetAmount: string;
      targetEngagement: number;
    }
  ): Promise<boolean> {
    try {
      const payload: CampaignPublishedSuccessPayload = {
        type: WebSocketEventType.CAMPAIGN_PUBLISHED_SUCCESS,
        userId,
        timestamp: Date.now(),
        data: campaignData,
      };

      const success = await sendToUser(
        userId,
        'CAMPAIGN_PUBLISHED_SUCCESS',
        payload.data
      );

      if (success) {
        Logger.info(
          `Campaign published notification sent to user ${userId} for campaign ${campaignData.campaignId}`
        );
      } else {
        Logger.warn(
          `Failed to send campaign published notification to user ${userId} (offline) for campaign ${campaignData.campaignId}`
        );
      }

      return success;
    } catch (error) {
      Logger.err(
        `Failed to send campaign published notification: ${String(error)}`
      );
      return false;
    }
  }

  /**
   * Send campaign status update notification
   */
  static async notifyCampaignStatusUpdate(
    userId: string,
    statusData: {
      campaignId: string;
      oldStatus: campaignstatus;
      newStatus: campaignstatus;
      statusChangeReason?: string;
      estimatedTimeToNext?: number;
      progressPercentage?: number;
    }
  ): Promise<boolean> {
    try {
      const payload: CampaignStatusUpdatePayload = {
        type: WebSocketEventType.CAMPAIGN_STATUS_UPDATE,
        userId,
        timestamp: Date.now(),
        data: statusData,
      };

      const success = await sendToUser(
        userId,
        'CAMPAIGN_STATUS_UPDATE',
        payload.data
      );

      if (success) {
        Logger.info(
          `Campaign status update sent to user ${userId} - Campaign ${statusData.campaignId}: ${statusData.oldStatus} -> ${statusData.newStatus}`
        );
      }

      return success;
    } catch (error) {
      Logger.err(`Failed to send campaign status update: ${String(error)}`);
      return false;
    }
  }

  /**
   * Send balance update notification
   */
  static async notifyBalanceUpdate(
    userId: string,
    balanceData: {
      balanceType: 'HBAR' | 'TOKEN';
      tokenId?: string;
      tokenSymbol?: string;
      oldBalance: string;
      newBalance: string;
      changeAmount: string;
      changeReason:
        | 'CAMPAIGN_DEDUCTION'
        | 'REWARD_RECEIVED'
        | 'TOPUP'
        | 'WITHDRAWAL'
        | 'OTHER';
      relatedCampaignId?: string;
      transactionId?: string;
    }
  ): Promise<boolean> {
    try {
      const payload: BalanceUpdatePayload = {
        type: WebSocketEventType.BALANCE_UPDATE,
        userId,
        timestamp: Date.now(),
        data: balanceData,
      };

      const success = await sendToUser(userId, 'BALANCE_UPDATE', payload.data);

      if (success) {
        Logger.info(
          `Balance update notification sent to user ${userId} - ${balanceData.balanceType}: ${balanceData.changeAmount} (${balanceData.changeReason})`
        );
      }

      return success;
    } catch (error) {
      Logger.err(
        `Failed to send balance update notification: ${String(error)}`
      );
      return false;
    }
  }

  /**
   * Send campaign engagement update notification
   */
  static async notifyCampaignEngagementUpdate(
    userId: string,
    engagementData: {
      campaignId: string;
      engagementMetrics: {
        totalLikes: number;
        totalRetweets: number;
        totalComments: number;
        uniqueParticipants: number;
        engagementRate: number;
      };
      progressToTarget: number;
      estimatedReward?: string;
    }
  ): Promise<boolean> {
    try {
      const payload: CampaignEngagementUpdatePayload = {
        type: WebSocketEventType.CAMPAIGN_ENGAGEMENT_UPDATE,
        userId,
        timestamp: Date.now(),
        data: engagementData,
      };

      const success = await sendToUser(
        userId,
        'CAMPAIGN_ENGAGEMENT_UPDATE',
        payload.data
      );

      if (success) {
        Logger.info(
          `Campaign engagement update sent to user ${userId} - Campaign ${engagementData.campaignId}: ${engagementData.progressToTarget}% to target`
        );
      }

      return success;
    } catch (error) {
      Logger.err(`Failed to send campaign engagement update: ${String(error)}`);
      return false;
    }
  }

  /**
   * Send reward distribution update notification
   */
  static async notifyRewardDistributionUpdate(
    userId: string,
    distributionData: {
      campaignId: string;
      distributionStatus: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
      processedCount: number;
      totalCount: number;
      userRewardAmount?: string;
      distributionProgress: number;
      estimatedCompletionTime?: Date;
    }
  ): Promise<boolean> {
    try {
      const payload: RewardDistributionUpdatePayload = {
        type: WebSocketEventType.REWARD_DISTRIBUTION_UPDATE,
        userId,
        timestamp: Date.now(),
        data: distributionData,
      };

      const success = await sendToUser(
        userId,
        'REWARD_DISTRIBUTION_UPDATE',
        payload.data
      );

      if (success) {
        Logger.info(
          `Reward distribution update sent to user ${userId} - Campaign ${distributionData.campaignId}: ` +
            `${distributionData.distributionStatus} (${distributionData.distributionProgress}%)`
        );
      }

      return success;
    } catch (error) {
      Logger.err(`Failed to send reward distribution update: ${String(error)}`);
      return false;
    }
  }

  /**
   * Send system notification
   */
  static async notifySystem(
    userId: string,
    notificationData: {
      notificationType: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
      title: string;
      message: string;
      actionRequired?: boolean;
      actionUrl?: string;
      autoHide?: boolean;
      hideAfterMs?: number;
    }
  ): Promise<boolean> {
    try {
      const payload: SystemNotificationPayload = {
        type: WebSocketEventType.SYSTEM_NOTIFICATION,
        userId,
        timestamp: Date.now(),
        data: notificationData,
      };

      const success = await sendToUser(
        userId,
        'SYSTEM_NOTIFICATION',
        payload.data
      );

      if (success) {
        Logger.info(
          `System notification sent to user ${userId} - ${notificationData.notificationType}: ${notificationData.title}`
        );
      }

      return success;
    } catch (error) {
      Logger.err(`Failed to send system notification: ${String(error)}`);
      return false;
    }
  }

  /**
   * Broadcast notification to multiple users
   */
  static async broadcast(
    userIds: string[],
    eventType: WebSocketEventType,
    data: any
  ): Promise<{
    sentToUserIds: string[];
    failedUserIds: string[];
    totalConnections: number;
  }> {
    const results = {
      sentToUserIds: [] as string[],
      failedUserIds: [] as string[],
      totalConnections: userIds.length,
    };

    const promises = userIds.map(async (userId) => {
      try {
        const success = await sendToUser(userId, eventType, data);
        if (success) {
          results.sentToUserIds.push(userId);
        } else {
          results.failedUserIds.push(userId);
        }
      } catch (error) {
        Logger.err(`Failed to send to user ${userId}: ${String(error)}`);
        results.failedUserIds.push(userId);
      }
    });

    await Promise.all(promises);

    Logger.info(
      `Broadcast completed - ${eventType}: sent to ${results.sentToUserIds.length}/${results.totalConnections}, failed: ${results.failedUserIds.length}`
    );

    return results;
  }

  /**
   * Helper method to get campaign owner notification for campaign events
   */
  static async notifyCampaignOwner(
    campaignId: string,
    eventType: WebSocketEventType,
    eventData: any
  ): Promise<boolean> {
    try {
      // In a real implementation, you'd fetch the campaign owner ID from database
      // For now, this is a placeholder that would need to be implemented
      const ownerId = await this.getCampaignOwnerId(campaignId);

      if (!ownerId) {
        Logger.warn(
          `Cannot send notification - campaign owner not found for campaign ${campaignId}`
        );
        return false;
      }

      return await sendToUser(ownerId, eventType, eventData);
    } catch (error) {
      Logger.err(`Failed to notify campaign owner: ${String(error)}`);
      return false;
    }
  }

  /**
   * Get campaign owner ID (placeholder implementation)
   */
  private static getCampaignOwnerId(
    campaignId: string
  ): Promise<string | null> {
    try {
      // This would query the database to get the campaign owner
      // Implementation would depend on your database structure
      // For now, returning null as placeholder
      Logger.info(`Getting campaign owner for ${campaignId}`);
      return Promise.resolve(null);
    } catch (error) {
      Logger.err(`Failed to get campaign owner ID: ${String(error)}`);
      return Promise.resolve(null);
    }
  }

  /**
   * Helper to send campaign success notification with proper data formatting
   */
  static async sendCampaignSuccessNotification(
    userId: string,
    campaignId: string,
    campaignTitle: string,
    tweetUrls: {
      firstTweetUrl: string;
      secondTweetUrl: string;
    },
    campaignDetails: {
      closeTime: Date;
      budget: string;
      targetEngagement: number;
    }
  ): Promise<boolean> {
    return await this.notifyCampaignPublished(userId, {
      campaignId,
      campaignTitle,
      firstTweetUrl: tweetUrls.firstTweetUrl,
      secondTweetUrl: tweetUrls.secondTweetUrl,
      estimatedCloseTime: campaignDetails.closeTime,
      budgetAmount: campaignDetails.budget,
      targetEngagement: campaignDetails.targetEngagement,
    });
  }

  /**
   * Helper to send balance deduction notification for campaign spending
   */
  static async sendCampaignBudgetDeductionNotification(
    userId: string,
    campaignId: string,
    deductedAmount: string,
    tokenInfo: {
      tokenId?: string;
      tokenSymbol: string;
    },
    oldBalance: string,
    newBalance: string
  ): Promise<boolean> {
    return await this.notifyBalanceUpdate(userId, {
      balanceType: tokenInfo.tokenId ? 'TOKEN' : 'HBAR',
      tokenId: tokenInfo.tokenId,
      tokenSymbol: tokenInfo.tokenSymbol,
      oldBalance,
      newBalance,
      changeAmount: `-${deductedAmount}`,
      changeReason: 'CAMPAIGN_DEDUCTION',
      relatedCampaignId: campaignId,
    });
  }
}
