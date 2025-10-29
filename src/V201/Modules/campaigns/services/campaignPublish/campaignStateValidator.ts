import { campaign_twittercard, campaignstatus, user_user, PrismaClient } from '@prisma/client';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';

export enum CampaignPublishState {
  NOT_STARTED = 'NOT_STARTED',
  FIRST_TWEET_PUBLISHED = 'FIRST_TWEET_PUBLISHED',
  SMART_CONTRACT_FAILED = 'SMART_CONTRACT_FAILED',
  SMART_CONTRACT_COMPLETED = 'SMART_CONTRACT_COMPLETED',
  SECOND_TWEET_FAILED = 'SECOND_TWEET_FAILED',
  FULLY_PUBLISHED = 'FULLY_PUBLISHED',
  ERROR_STATE = 'ERROR_STATE',
}

export interface CampaignStateInfo {
  currentState: CampaignPublishState;
  canRetry: boolean;
  nextAction: string;
  errorMessage?: string;
  resumeFromStep?: string;
  campaign: campaign_twittercard & { user_user?: user_user };
  campaignLogs?: Array<{
    id: string;
    timestamp: Date;
    status: string;
    message: string;
    data?: any;
  }>;
}

export class CampaignPublishStateValidator {
  private prisma: PrismaClient | null = null;

  constructor() {
    this.initializePrisma();
  }

  private async initializePrisma() {
    this.prisma = await createPrismaClient();
  }

  /**
   * Fetch campaign logs for debugging purposes
   */
  private async getCampaignLogs(campaignId: number) {
    if (!this.prisma) {
      await this.initializePrisma();
    }

    if (!this.prisma) {
      return [];
    }

    try {
      const logs = await this.prisma.campaignLog.findMany({
        where: {
          campaign_id: BigInt(campaignId),
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 10, // Get last 10 log entries
      });

      return logs.map((log) => ({
        id: log.id.toString(),
        timestamp: log.timestamp,
        status: log.status,
        message: log.message,
        data: log.data,
      }));
    } catch (error) {
      const errorStack =
        error instanceof Error
          ? error.stack || 'No stack trace available'
          : 'No stack trace available';
      logger.err(
        `Failed to fetch campaign logs for campaign ${String(
          campaignId
        )}: ${String(error)}`
      );
      logger.err(`Stack trace: ${errorStack}`);
      return [];
    }
  }

  /**
   * Helper method to create ERROR_STATE response with campaign logs
   */
  private async createErrorStateWithLogs(
    campaignId: number,
    errorMessage: string,
    nextAction: string,
    campaign: campaign_twittercard & { user_user?: user_user },
    logPrefix: string
  ): Promise<CampaignStateInfo> {
    // Fetch campaign logs for debugging
    const campaignLogs = await this.getCampaignLogs(campaignId);

    // Log to console for immediate debugging
    logger.err(`Campaign ${String(campaign.id)} ${logPrefix}`);
    if (campaignLogs.length > 0) {
      logger.info(
        `Campaign ${String(campaign.id)} has ${campaignLogs.length} log entries`
      );
      campaignLogs.slice(0, 3).forEach((log, index) => {
        logger.info(
          `Log ${index + 1}: [${log.status}] ${
            log.message
          } (${log.timestamp.toISOString()})`
        );
      });
    } else {
      logger.info(`Campaign ${String(campaign.id)} has no log entries`);
    }

    delete campaign.user_user; // Remove user data for privacy

    return {
      currentState: CampaignPublishState.ERROR_STATE,
      canRetry: false,
      nextAction,
      errorMessage,
      campaign,
      campaignLogs,
    };
  }

  /**
   * Analyzes the current state of a campaign and determines what action should be taken
   */
  async analyzeCampaignState(
    campaignId: number,
    userId: number | bigint
  ): Promise<CampaignStateInfo> {
    try {
      if (!this.prisma) {
        await this.initializePrisma();
      }

      if (!this.prisma) {
        throw new Error('Failed to initialize database connection');
      }

      const campaign = await new CampaignTwitterCardModel(
        this.prisma
      ).getCampaignsWithOwnerData(campaignId);

      if (!campaign || !campaign.user_user) {
        throw new Error('Campaign not found or missing owner data');
      }

      // Validate ownership
      if (campaign.user_user.id !== userId) {
        throw new Error('User is not authorized to access this campaign');
      }

      // Analyze the current state based on campaign data
      const stateInfo = await this.determineCurrentState(campaign);

      logger.info(
        `Campaign ${String(campaign.id)} state analysis: ${
          stateInfo.currentState
        }`
      );

      return stateInfo;
    } catch (error) {
      const errorStack =
        error instanceof Error
          ? error.stack || 'No stack trace available'
          : 'No stack trace available';
      logger.err(
        `Error analyzing campaign state: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      logger.err(`Stack trace: ${errorStack}`);
      throw error;
    }
  }

  /**
   * Determines the current state of the campaign based on its data
   */
  private async determineCurrentState(
    campaign: campaign_twittercard & { user_user?: user_user }
  ): Promise<CampaignStateInfo> {
    const {
      card_status,
      tweet_id,
      contract_id,
      last_thread_tweet_id,
      approve,
    } = campaign;

    // Campaign is already running - nothing to do
    if (card_status === campaignstatus.CampaignRunning) {
      return {
        currentState: CampaignPublishState.FULLY_PUBLISHED,
        canRetry: false,
        nextAction: 'Campaign is already running',
        campaign,
      };
    }

    // Campaign is not approved - cannot proceed
    if (!approve) {
      return await this.createErrorStateWithLogs(
        Number(campaign.id),
        'Campaign requires admin approval before publishing',
        'Wait for admin approval',
        campaign,
        'ERROR_STATE: Not approved by admin'
      );
    }

    // Campaign has not been published at all
    if (
      card_status === campaignstatus.ApprovalPending ||
      card_status === campaignstatus.CampaignApproved
    ) {
      // Check if it was partially published but status not updated
      if (tweet_id && !contract_id && !last_thread_tweet_id) {
        // First tweet exists but no contract - smart contract failed
        return {
          currentState: CampaignPublishState.SMART_CONTRACT_FAILED,
          canRetry: true,
          nextAction: 'Resume from smart contract transaction',
          resumeFromStep: 'SMART_CONTRACT',
          campaign,
        };
      }

      if (tweet_id && contract_id && !last_thread_tweet_id) {
        // First tweet and contract exist but no second tweet - second tweet failed
        return {
          currentState: CampaignPublishState.SECOND_TWEET_FAILED,
          canRetry: true,
          nextAction: 'Resume from second tweet publication',
          resumeFromStep: 'SECOND_TWEET',
          campaign,
        };
      }

      if (!tweet_id && !last_thread_tweet_id) {
        // Nothing published - start fresh
        return {
          currentState: CampaignPublishState.NOT_STARTED,
          canRetry: true,
          nextAction: 'Start campaign publishing from beginning',
          resumeFromStep: 'FIRST_TWEET',
          campaign,
        };
      }

      // Edge case - inconsistent state
      return await this.createErrorStateWithLogs(
        Number(campaign.id),
        'Campaign data is in an inconsistent state',
        'Contact support - campaign in inconsistent state',
        campaign,
        `ERROR_STATE: Inconsistent data - tweet_id: ${
          tweet_id || 'null'
        }, contract_id: ${contract_id || 'null'}, last_thread_tweet_id: ${
          last_thread_tweet_id || 'null'
        }, status: ${card_status}`
      );
    }

    // Campaign is in started state - check what's missing
    if (card_status === campaignstatus.CampaignStarted) {
      if (!tweet_id) {
        return {
          currentState: CampaignPublishState.NOT_STARTED,
          canRetry: true,
          nextAction: 'Start campaign publishing from first tweet',
          resumeFromStep: 'FIRST_TWEET',
          campaign,
        };
      }

      if (tweet_id && !contract_id) {
        return {
          currentState: CampaignPublishState.SMART_CONTRACT_FAILED,
          canRetry: true,
          nextAction: 'Resume from smart contract transaction',
          resumeFromStep: 'SMART_CONTRACT',
          campaign,
        };
      }

      if (tweet_id && contract_id && !last_thread_tweet_id) {
        return {
          currentState: CampaignPublishState.SECOND_TWEET_FAILED,
          canRetry: true,
          nextAction: 'Resume from second tweet publication',
          resumeFromStep: 'SECOND_TWEET',
          campaign,
        };
      }

      // All components exist but status not updated to running
      if (tweet_id && contract_id && last_thread_tweet_id) {
        return {
          currentState: CampaignPublishState.FULLY_PUBLISHED,
          canRetry: true,
          nextAction: 'Update campaign status to running',
          resumeFromStep: 'FINALIZE',
          campaign,
        };
      }
    }

    // Campaign is in error state or other status
    return await this.createErrorStateWithLogs(
      Number(campaign.id),
      `Campaign is in ${card_status} status`,
      'Check campaign status and contact support if needed',
      campaign,
      `ERROR_STATE: Invalid status - ${card_status}`
    );
  }

  /**
   * Validates if a campaign can be published or resumed based on its current state
   */
  async validateCampaignForPublish(
    campaignId: number,
    userId: number | bigint
  ): Promise<{
    canProceed: boolean;
    stateInfo: CampaignStateInfo;
    validationMessage: string;
  }> {
    try {
      const stateInfo = await this.analyzeCampaignState(campaignId, userId);

      // Check if campaign can proceed
      const canProceed =
        stateInfo.canRetry ||
        stateInfo.currentState === CampaignPublishState.FULLY_PUBLISHED;

      let validationMessage = '';
      if (!canProceed) {
        validationMessage =
          stateInfo.errorMessage ||
          'Campaign cannot be published in current state';
      } else if (
        stateInfo.currentState === CampaignPublishState.FULLY_PUBLISHED
      ) {
        validationMessage = 'Campaign is already published and running';
      } else {
        validationMessage = `Campaign can be resumed from: ${stateInfo.nextAction}`;
      }

      return {
        canProceed,
        stateInfo,
        validationMessage,
      };
    } catch (error) {
      const errorStack =
        error instanceof Error
          ? error.stack || 'No stack trace available'
          : 'No stack trace available';
      logger.err(
        `Validation error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      logger.err(`Stack trace: ${errorStack}`);
      throw error;
    }
  }

  /**
   * Gets the appropriate event to publish based on campaign state
   */
  getResumeEventForState(state: CampaignPublishState): string | null {
    switch (state) {
      case CampaignPublishState.NOT_STARTED:
        return 'CAMPAIGN_PUBLISH_CONTENT';
      case CampaignPublishState.SMART_CONTRACT_FAILED:
        return 'CAMPAIGN_PUBLISH_DO_SM_TRANSACTION';
      case CampaignPublishState.SECOND_TWEET_FAILED:
        return 'CAMPAIGN_PUBLISH_SECOND_CONTENT';
      case CampaignPublishState.FULLY_PUBLISHED:
        return null; // Already complete
      default:
        return null;
    }
  }
}

export default CampaignPublishStateValidator;
