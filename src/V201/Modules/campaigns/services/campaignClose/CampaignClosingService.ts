import {
  campaign_twittercard,
  campaign_type,
  campaignstatus,
  PrismaClient,
  user_user,
} from '@prisma/client';
import { closeFungibleAndNFTCampaign } from '@services/contract-service';
import { closeCampaignSMTransaction } from '@services/transaction-service';
import createPrismaClient from '@shared/prisma';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import logger from 'jet-logger';
import { publishEvent } from '../../../../eventPublisher';
import { CampaignEvents, CampaignScheduledEvents } from '../../../../AppEvents';
import {
  CampaignLogEventHandler,
  CampaignLogLevel,
  CampaignLogEventType,
} from '../campaignLogs';
import SchedulerQueue from '../../../../schedulerQueue';
import { CampaignTypes } from '@services/CampaignLifeCycleBase';

interface ExecutionStep {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  timestamp: Date;
  message?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export class CampaignClosingService {
  private prisma: PrismaClient | null = null;
  private campaignLogger: CampaignLogEventHandler | null = null;
  private executionSteps: ExecutionStep[] = [];

  private async initializePrisma(): Promise<PrismaClient> {
    if (!this.prisma) {
      this.prisma = await createPrismaClient();
    }
    return this.prisma;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.prisma) {
      await this.initializePrisma();
    }
    if (!this.campaignLogger && this.prisma) {
      this.campaignLogger = await CampaignLogEventHandler.create(this.prisma);
    }
  }

  private addStep(
    step: string,
    status: 'success' | 'failed' | 'skipped',
    message?: string,
    error?: string,
    metadata?: Record<string, unknown>
  ): void {
    this.executionSteps.push({
      step,
      status,
      timestamp: new Date(),
      message,
      error,
      metadata,
    });
  }

  private async logExecutionSummary(campaignId: bigint): Promise<void> {
    if (!this.campaignLogger) return;

    const successCount = this.executionSteps.filter(
      (s) => s.status === 'success'
    ).length;
    const failedCount = this.executionSteps.filter(
      (s) => s.status === 'failed'
    ).length;
    const skippedCount = this.executionSteps.filter(
      (s) => s.status === 'skipped'
    ).length;

    const finalStatus = failedCount > 0 ? 'FAILED' : 'SUCCESS';
    const level =
      failedCount > 0 ? CampaignLogLevel.ERROR : CampaignLogLevel.SUCCESS;

    await this.campaignLogger.saveLog({
      campaignId,
      status: finalStatus,
      message: `Campaign closing completed - ${successCount} successful, ${failedCount} failed, ${skippedCount} skipped`,
      level,
      eventType: CampaignLogEventType.SYSTEM_EVENT,
      data: {
        level,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        metadata: {
          executionHistory: this.executionSteps,
          summary: {
            totalSteps: this.executionSteps.length,
            successful: successCount,
            failed: failedCount,
            skipped: skippedCount,
          },
        },
      },
    });
  }

  async closeCampaign(campaign: campaign_twittercard): Promise<{
    success: boolean;
    message: string;
    campaignId: number | bigint;
  }> {
    // Reset execution steps for new closure
    this.executionSteps = [];

    try {
      await this.ensureInitialized();

      if (!this.prisma || !this.campaignLogger) {
        throw new Error('Services not properly initialized');
      }

      this.addStep('initialization', 'success', 'Services initialized');

      // Validate campaign owner tokens
      const campaignCardModal = new CampaignTwitterCardModel(this.prisma);
      const campaignWithUser = await campaignCardModal.getCampaignsWithUserData(
        campaign.id
      );
      const campaignOwner = campaignWithUser?.user_user;

      if (!this.hasValidAccessTokens(campaignOwner)) {
        this.addStep(
          'token_validation',
          'failed',
          'Invalid Twitter access tokens'
        );
        await this.logExecutionSummary(campaign.id);
        throw new Error('Campaign owner has invalid Twitter access tokens');
      }

      this.addStep('token_validation', 'success', 'Tokens validated');

      // Execute campaign type specific closing
      if (campaign.type === 'HBAR') {
        await this.closeHBARCampaign(campaign);
      } else if (campaign.type === 'FUNGIBLE') {
        await this.closeFungibleCampaign(campaign);
      } else {
        this.addStep(
          'campaign_type_check',
          'skipped',
          `Unknown campaign type: ${campaign.type || 'unknown'}`
        );
      }

      // Log final execution summary
      await this.logExecutionSummary(campaign.id);

      return {
        success: true,
        message: 'Campaign closed successfully',
        campaignId: campaign.id,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`Failed to close campaign ${campaign.id}: ${errorMsg}`);

      this.addStep('campaign_closure', 'failed', errorMsg);
      await this.handleClosingError(campaign, errorMsg);

      return {
        success: false,
        message: `Campaign closure failed: ${errorMsg}`,
        campaignId: campaign.id,
      };
    }
  }

  private async closeHBARCampaign(
    campaign: campaign_twittercard
  ): Promise<void> {
    await this.executeSmartContractClosing(campaign, 'HBAR');
    await this.updateCampaignToClosedAwaitingData(campaign);
    this.addStep(
      'publish_event',
      'success',
      'Engagement collection event published'
    );
    if (campaign.campaign_type === campaign_type.awareness) {
      publishEvent(
        CampaignEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET,
        { campaignId: campaign.id }
      );
    } else {
      const scheduler = await SchedulerQueue.getInstance();
      await scheduler.addJob(
        CampaignScheduledEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY,
        {
          eventName:
            CampaignScheduledEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY,
          data: {
            campaignId: campaign.id,
            type: campaign?.type as CampaignTypes,
            createdAt: new Date(),
          },
          executeAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes later
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 60000, // 1 minute
          },
        }
      );
    }
  }

  private async closeFungibleCampaign(
    campaign: campaign_twittercard
  ): Promise<void> {
    await this.executeSmartContractClosing(campaign, 'FUNGIBLE');
    await this.updateCampaignToClosedAwaitingData(campaign);
    this.addStep(
      'publish_event',
      'success',
      'Engagement collection event published'
    );
    if (campaign.campaign_type === campaign_type.awareness) {
      publishEvent(
        CampaignEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET,
        { campaignId: campaign.id }
      );
    } else {
      const scheduler = await SchedulerQueue.getInstance();
      await scheduler.addJob(
        CampaignScheduledEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY,
        {
          eventName:
            CampaignScheduledEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY,
          data: {
            campaignId: campaign.id,
            type: campaign?.type as CampaignTypes,
            createdAt: new Date(),
          },
          executeAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes later
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 60000, // 1 minute
          },
        }
      );
    }
  }

  private async executeSmartContractClosing(
    campaign: campaign_twittercard,
    type: 'HBAR' | 'FUNGIBLE'
  ): Promise<void> {
    try {
      const contractId = campaign.contract_id;
      if (!contractId) {
        throw new Error('Campaign contract ID is missing');
      }

      this.addStep(
        'smart_contract_closing',
        'success',
        `Closing ${type} contract`,
        undefined,
        { contractId, type }
      );

      if (type === 'HBAR') {
        await closeCampaignSMTransaction(contractId);
      } else {
        await closeFungibleAndNFTCampaign(contractId);
      }

      this.addStep(
        'smart_contract_closed',
        'success',
        `${type} contract closed successfully`,
        undefined,
        { contractId }
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.addStep(
        'smart_contract_closing',
        'failed',
        'Smart contract transaction failed',
        errorMsg,
        { type, contractId: campaign.contract_id }
      );
      logger.err(
        `Smart contract transaction failed for campaign ${campaign.id}: ${errorMsg}`
      );
      throw new Error(`Smart contract transaction failed: ${errorMsg}`);
    }
  }

  private hasValidAccessTokens(owner?: user_user): boolean {
    return !!(
      owner &&
      owner.business_twitter_access_token &&
      owner.business_twitter_access_token_secret
    );
  }

  private async handleClosingError(
    campaign: campaign_twittercard,
    errorMsg: string
  ): Promise<void> {
    try {
      await this.ensureInitialized();

      if (!this.prisma || !this.campaignLogger) {
        const errorMsg = 'Services not initialized for error handling';
        logger.err(errorMsg);
        throw new Error(errorMsg);
      }

      // Update campaign status to error
      await new CampaignTwitterCardModel(this.prisma).updateCampaign(
        campaign.id,
        {
          card_status: campaignstatus.InternalError,
        }
      );

      this.addStep(
        'error_handling',
        'success',
        'Campaign status updated to InternalError',
        undefined,
        { newStatus: 'InternalError' }
      );

      // Log final execution summary with error
      await this.logExecutionSummary(campaign.id);
    } catch (error) {
      const nestedErrorMsg =
        error instanceof Error ? error.message : String(error);
      logger.err(
        `Failed to handle closing error for campaign ${campaign.id}: ${nestedErrorMsg}. Original error: ${errorMsg}`
      );
    }
  }

  private async updateCampaignToClosedAwaitingData(
    campaign: campaign_twittercard
  ): Promise<void> {
    try {
      await this.ensureInitialized();

      if (!this.prisma || !this.campaignLogger) {
        throw new Error('Services not properly initialized');
      }

      // Update campaign status
      await new CampaignTwitterCardModel(this.prisma).updateCampaign(
        campaign.id,
        {
          card_status: campaignstatus.RewardDistributionInProgress,
        }
      );

      this.addStep(
        'status_update',
        'success',
        'Status updated to RewardDistributionInProgress'
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.addStep(
        'status_update',
        'failed',
        'Failed to update status',
        errorMsg
      );
      logger.err(
        `Failed to update campaign status for ${campaign.id}: ${errorMsg}`
      );
      throw error;
    }
  }
}

export default CampaignClosingService;
