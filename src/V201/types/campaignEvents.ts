/**
 * Campaign Event Types and Interfaces for Hybrid HCS + WebSocket System
 *
 * This file defines the TypeScript interfaces for:
 * - HCS Campaign Events (major milestones)
 * - WebSocket Event Payloads (real-time updates)
 * - Campaign Snapshot Data Structures
 */

import { campaignstatus } from '@prisma/client';

// ================================
// HCS Campaign Event Types
// ================================

export enum HCSCampaignEventType {
  CAMPAIGN_PUBLISHED = 'CAMPAIGN_PUBLISHED',
  CAMPAIGN_CLOSED = 'CAMPAIGN_CLOSED',
  REWARD_DISTRIBUTED = 'REWARD_DISTRIBUTED',
  CAMPAIGN_ARCHIVED = 'CAMPAIGN_ARCHIVED'
}

export interface HCSBaseEvent {
  eventType: HCSCampaignEventType;
  campaignId: string;
  topicId: string;
  timestamp: number;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  version: string; // Event schema version
}

// Campaign Snapshot Data Structure
export interface CampaignSnapshot {
  // Core Campaign Data
  campaign: {
    id: string;
    title: string;
    description: string;
    status: campaignstatus;
    createdAt: Date;
    publishedAt?: Date;
    closedAt?: Date;
    archivedAt?: Date;
    userId: string;
    budgetAmount: string;
    budgetTokenId?: string;
    targetEngagement: number;
    actualEngagement: number;
    hashtagsUsed: string[];
    mediaUrls?: string[];
    firstTweetId?: string;
    secondTweetId?: string;
    twitterScheduledJobId?: string;
    campaignCloseJobId?: string;
    rewardDistributionJobId?: string;
  };

  // User Data
  user: {
    id: string;
    username: string;
    email: string;
    twitterUsername?: string;
    walletAddress?: string;
    createdAt: Date;
  };

  // Financial Data
  financial: {
    totalBudget: string;
    remainingBudget: string;
    distributedRewards: string;
    tokenId?: string;
    tokenSymbol?: string;
    hbarAmount?: string;
  };

  // Engagement Metrics
  engagement: {
    totalParticipants: number;
    totalLikes: number;
    totalRetweets: number;
    totalComments: number;
    engagementRate: number;
    topParticipants: Array<{
      userId: string;
      username: string;
      engagementScore: number;
      rewardAmount: string;
    }>;
  };

  // System Metadata
  metadata: {
    snapshotCreatedAt: Date;
    dataVersion: string;
    systemVersion: string;
    checksumHash: string; // For data integrity
  };
}

// Specific HCS Event Interfaces
export interface HCSCampaignPublishedEvent extends HCSBaseEvent {
  eventType: HCSCampaignEventType.CAMPAIGN_PUBLISHED;
  data: {
    snapshot: CampaignSnapshot;
    publishDetails: {
      firstTweetId: string;
      firstTweetUrl: string;
      secondTweetId: string;
      secondTweetUrl: string;
      scheduledCloseTime: Date;
      estimatedDuration: number; // hours
    };
  };
}

export interface HCSCampaignClosedEvent extends HCSBaseEvent {
  eventType: HCSCampaignEventType.CAMPAIGN_CLOSED;
  data: {
    snapshot: CampaignSnapshot;
    closeDetails: {
      actualDuration: number; // hours
      finalEngagementMetrics: {
        totalLikes: number;
        totalRetweets: number;
        totalComments: number;
        uniqueParticipants: number;
      };
      participantData: Array<{
        userId: string;
        username: string;
        twitterHandle: string;
        engagementScore: number;
        calculatedReward: string;
        walletAddress?: string;
      }>;
    };
  };
}

export interface HCSRewardDistributedEvent extends HCSBaseEvent {
  eventType: HCSCampaignEventType.REWARD_DISTRIBUTED;
  data: {
    snapshot: CampaignSnapshot;
    distributionDetails: {
      totalRecipientsCount: number;
      totalAmountDistributed: string;
      tokenId?: string;
      hederaTransactionIds: string[];
      distributionTimestamp: Date;
      successfulDistributions: number;
      failedDistributions: number;
      distributionResults: Array<{
        recipientUserId: string;
        recipientWallet: string;
        rewardAmount: string;
        transactionId?: string;
        status: 'SUCCESS' | 'FAILED' | 'PENDING';
        errorMessage?: string;
      }>;
    };
  };
}

export interface HCSCampaignArchivedEvent extends HCSBaseEvent {
  eventType: HCSCampaignEventType.CAMPAIGN_ARCHIVED;
  data: {
    snapshot: CampaignSnapshot;
    archiveDetails: {
      finalStatistics: {
        totalLifetimeDuration: number; // hours
        totalParticipants: number;
        totalEngagement: number;
        totalRewardsDistributed: string;
        roi: number; // return on investment percentage
      };
      historicalData: {
        engagementOverTime: Array<{
          timestamp: Date;
          cumulativeLikes: number;
          cumulativeRetweets: number;
          cumulativeComments: number;
        }>;
      };
    };
  };
}

export type HCSCampaignEvent =
  | HCSCampaignPublishedEvent
  | HCSCampaignClosedEvent
  | HCSRewardDistributedEvent
  | HCSCampaignArchivedEvent;

// ================================
// WebSocket Event Types
// ================================

export enum WebSocketEventType {
  CAMPAIGN_STATUS_UPDATE = 'CAMPAIGN_STATUS_UPDATE',
  CAMPAIGN_PUBLISHED_SUCCESS = 'CAMPAIGN_PUBLISHED_SUCCESS',
  BALANCE_UPDATE = 'BALANCE_UPDATE',
  CAMPAIGN_ENGAGEMENT_UPDATE = 'CAMPAIGN_ENGAGEMENT_UPDATE',
  REWARD_DISTRIBUTION_UPDATE = 'REWARD_DISTRIBUTION_UPDATE',
  SYSTEM_NOTIFICATION = 'SYSTEM_NOTIFICATION'
}

export interface WebSocketBasePayload {
  type: WebSocketEventType;
  userId: string;
  timestamp: number;
  requestId?: string; // For request correlation
}

// Campaign Status Update (Real-time status transitions)
export interface CampaignStatusUpdatePayload extends WebSocketBasePayload {
  type: WebSocketEventType.CAMPAIGN_STATUS_UPDATE;
  data: {
    campaignId: string;
    oldStatus: campaignstatus;
    newStatus: campaignstatus;
    statusChangeReason?: string;
    estimatedTimeToNext?: number; // seconds until next status change
    progressPercentage?: number;
  };
}

// Campaign Published Success (Immediate feedback)
export interface CampaignPublishedSuccessPayload extends WebSocketBasePayload {
  type: WebSocketEventType.CAMPAIGN_PUBLISHED_SUCCESS;
  data: {
    campaignId: string;
    campaignTitle: string;
    firstTweetUrl: string;
    secondTweetUrl: string;
    estimatedCloseTime: Date;
    budgetAmount: string;
    targetEngagement: number;
  };
}

// Balance Update (Real-time balance changes)
export interface BalanceUpdatePayload extends WebSocketBasePayload {
  type: WebSocketEventType.BALANCE_UPDATE;
  data: {
    balanceType: 'HBAR' | 'TOKEN';
    tokenId?: string;
    tokenSymbol?: string;
    oldBalance: string;
    newBalance: string;
    changeAmount: string;
    changeReason: 'CAMPAIGN_DEDUCTION' | 'REWARD_RECEIVED' | 'TOPUP' | 'WITHDRAWAL' | 'OTHER';
    relatedCampaignId?: string;
    transactionId?: string;
  };
}

// Campaign Engagement Update (Real-time engagement metrics)
export interface CampaignEngagementUpdatePayload extends WebSocketBasePayload {
  type: WebSocketEventType.CAMPAIGN_ENGAGEMENT_UPDATE;
  data: {
    campaignId: string;
    engagementMetrics: {
      totalLikes: number;
      totalRetweets: number;
      totalComments: number;
      uniqueParticipants: number;
      engagementRate: number;
    };
    progressToTarget: number; // percentage
    estimatedReward?: string;
  };
}

// Reward Distribution Update
export interface RewardDistributionUpdatePayload extends WebSocketBasePayload {
  type: WebSocketEventType.REWARD_DISTRIBUTION_UPDATE;
  data: {
    campaignId: string;
    distributionStatus: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    processedCount: number;
    totalCount: number;
    userRewardAmount?: string;
    distributionProgress: number; // percentage
    estimatedCompletionTime?: Date;
  };
}

// System Notification
export interface SystemNotificationPayload extends WebSocketBasePayload {
  type: WebSocketEventType.SYSTEM_NOTIFICATION;
  data: {
    notificationType: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
    title: string;
    message: string;
    actionRequired?: boolean;
    actionUrl?: string;
    autoHide?: boolean;
    hideAfterMs?: number;
  };
}

export type WebSocketEventPayload =
  | CampaignStatusUpdatePayload
  | CampaignPublishedSuccessPayload
  | BalanceUpdatePayload
  | CampaignEngagementUpdatePayload
  | RewardDistributionUpdatePayload
  | SystemNotificationPayload;

// ================================
// Database Schema Types
// ================================

export interface CampaignHCSEvent {
  id: string;
  campaignId: string;
  eventType: HCSCampaignEventType;
  topicId: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  eventData: any; // JSON data
  checksumHash: string;
  createdAt: Date;
  processedAt?: Date;
  isVerified: boolean;
}

// ================================
// Service Response Types
// ================================

export interface HCSPublishResult {
  success: boolean;
  topicId?: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  transactionId?: string;
  error?: string;
  retryCount?: number;
}

export interface WebSocketBroadcastResult {
  success: boolean;
  sentToUserIds: string[];
  failedUserIds: string[];
  totalConnections: number;
  error?: string;
}

// ================================
// Configuration Types
// ================================

export interface HCSConfig {
  defaultTopicId?: string;
  maxRetries: number;
  retryDelayMs: number;
  enableEncryption: boolean;
  encryptionKey?: string;
  maxMessageSize: number;
}

export interface WebSocketConfig {
  enableEncryption: boolean;
  encryptionKey?: string;
  heartbeatIntervalMs: number;
  connectionTimeoutMs: number;
  maxReconnectAttempts: number;
}
