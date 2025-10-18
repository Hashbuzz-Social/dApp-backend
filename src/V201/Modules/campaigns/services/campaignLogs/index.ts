import { PrismaClient, CampaignLog } from '@prisma/client';
import logger from 'jet-logger';
import createPrismaClient from '@shared/prisma';

/**
 * Log levels for campaign events
 */
export enum CampaignLogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
  DEBUG = 'DEBUG'
}

/**
 * Campaign log event types
 */
export enum CampaignLogEventType {
  CAMPAIGN_CREATED = 'CAMPAIGN_CREATED',
  CAMPAIGN_APPROVED = 'CAMPAIGN_APPROVED',
  CAMPAIGN_DECLINED = 'CAMPAIGN_DECLINED',
  CAMPAIGN_STARTED = 'CAMPAIGN_STARTED',
  CAMPAIGN_PAUSED = 'CAMPAIGN_PAUSED',
  CAMPAIGN_RESUMED = 'CAMPAIGN_RESUMED',
  CAMPAIGN_ENDED = 'CAMPAIGN_ENDED',
  TWEET_PUBLISHED = 'TWEET_PUBLISHED',
  ENGAGEMENT_DETECTED = 'ENGAGEMENT_DETECTED',
  REWARD_CALCULATED = 'REWARD_CALCULATED',
  REWARD_DISTRIBUTED = 'REWARD_DISTRIBUTED',
  BUDGET_UPDATED = 'BUDGET_UPDATED',
  STATS_UPDATED = 'STATS_UPDATED',
  ERROR_OCCURRED = 'ERROR_OCCURRED',
  API_CALL = 'API_CALL',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PAYMENT_PROCESSED = 'PAYMENT_PROCESSED',
  SYSTEM_EVENT = 'SYSTEM_EVENT'
}

/**
 * Interface for campaign log entry
 */
export interface CampaignLogEntry {
  campaignId: bigint | number;
  status: string;
  message: string;
  level?: CampaignLogLevel;
  eventType?: CampaignLogEventType;
  data?: Record<string, any>;
  timestamp?: Date;
}

/**
 * Interface for structured log data
 */
export interface CampaignLogData {
  level: CampaignLogLevel;
  eventType: CampaignLogEventType;
  userId?: bigint | number;
  tweetId?: string;
  amount?: number;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

/**
 * Campaign Log Event Handler Class
 */
export class CampaignLogEventHandler {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Static factory method to create handler with async Prisma client
   */
  static async create(prisma?: PrismaClient): Promise<CampaignLogEventHandler> {
    const client = prisma || await createPrismaClient();
    return new CampaignLogEventHandler(client);
  }

  /**
   * Save a log entry to the database
   */
  async saveLog(entry: CampaignLogEntry): Promise<CampaignLog> {
    try {
      const campaignId = typeof entry.campaignId === 'bigint'
        ? entry.campaignId
        : BigInt(entry.campaignId);

      const logData: CampaignLogData = {
        level: entry.level || CampaignLogLevel.INFO,
        eventType: entry.eventType || CampaignLogEventType.SYSTEM_EVENT,
        ...entry.data
      };

      const logEntry = await this.prisma.campaignLog.create({
        data: {
          campaign_id: campaignId,
          timestamp: entry.timestamp || new Date(),
          status: entry.status,
          message: entry.message,
          data: logData as any
        }
      });

      logger.info(`Campaign log saved: ${entry.eventType || 'SYSTEM_EVENT'} for campaign ${campaignId.toString()}`);
      return logEntry;
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.err(`Failed to save campaign log: ${errorMsg}`);
      throw new Error(`Failed to save campaign log: ${errorMsg}`);
    }
  }

  /**
   * Log errors
   */
  async logError(
    campaignId: bigint | number,
    error: Error,
    context: string
  ): Promise<CampaignLog> {
    return this.saveLog({
      campaignId,
      status: 'ERROR',
      message: `Error in ${context}: ${error.message}`,
      level: CampaignLogLevel.ERROR,
      eventType: CampaignLogEventType.ERROR_OCCURRED,
      data: {
        level: CampaignLogLevel.ERROR,
        eventType: CampaignLogEventType.ERROR_OCCURRED,
        error: {
          code: error.name,
          message: error.message,
          stack: error.stack
        },
        metadata: { context }
      }
    });
  }

  /**
   * Log campaign end
   */
  async logCampaignEnded(
    campaignId: bigint | number,
    endReason: string,
    finalStats: Record<string, any>
  ): Promise<CampaignLog> {
    return this.saveLog({
      campaignId,
      status: 'ENDED',
      message: `Campaign ended: ${endReason}`,
      level: CampaignLogLevel.SUCCESS,
      eventType: CampaignLogEventType.CAMPAIGN_ENDED,
      data: {
        level: CampaignLogLevel.SUCCESS,
        eventType: CampaignLogEventType.CAMPAIGN_ENDED,
        metadata: { endReason, finalStats }
      }
    });
  }
}

export default CampaignLogEventHandler;
