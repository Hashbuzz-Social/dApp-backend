import {
  campaign_twittercard,
  campaignstatus,
  PrismaClient,
  user_user,
} from '@prisma/client';
import { closeFungibleAndNFTCampaign } from '@services/contract-service';
import { closeCampaignSMTransaction } from '@services/transaction-service';
import createPrismaClient from '@shared/prisma';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import logger from 'jet-logger';
import { publishEvent } from 'src/V201/eventPublisher';
import { CampaignEvents } from '../../../../AppEvents';
import {
  CampaignLogEventHandler,
  CampaignLogLevel,
  CampaignLogEventType,
} from '../campaignLogs';

export class CampaignClosingService {
  private prisma: PrismaClient | null = null;
  private campaignLogger: CampaignLogEventHandler | null = null;

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

  async closeCampaign(campaign: campaign_twittercard): Promise<{
    success: boolean;
    message: string;
    campaignId: number | bigint;
  }> {
    try {
      await this.ensureInitialized();

      if (!this.prisma || !this.campaignLogger) {
        throw new Error('Services not properly initialized');
      }

      // Log campaign closing start
      await this.campaignLogger.saveLog({
        campaignId: campaign.id,
        status: 'CLOSING_STARTED',
        message: `Campaign closing process initiated for ${
          campaign.type || 'unknown'
        } campaign`,
        level: CampaignLogLevel.INFO,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        data: {
          level: CampaignLogLevel.INFO,
          eventType: CampaignLogEventType.SYSTEM_EVENT,
          metadata: {
            campaignType: campaign.type,
            contractId: campaign.contract_id,
          },
        },
      });

      const campaignCardModal = new CampaignTwitterCardModel(this.prisma);
      const campaignWithUser = await campaignCardModal.getCampaignsWithUserData(
        campaign.id
      );
      const campaignOwner = campaignWithUser?.user_user;

      if (!this.hasValidAccessTokens(campaignOwner)) {
        const error = new Error(
          'Campaign owner has invalid Twitter access tokens'
        );
        await this.campaignLogger.logError(
          campaign.id,
          error,
          'token_validation'
        );
        throw error;
      }

      if (campaign.type === 'HBAR') {
        await this.closeHBARCampaign(campaign);
      } else if (campaign.type === 'FUNGIBLE') {
        await this.closeFungibleCampaign(campaign);
      }

      // Log successful completion
      await this.campaignLogger.logCampaignEnded(
        campaign.id,
        'successfully_closed',
        { campaignType: campaign.type, contractId: campaign.contract_id }
      );

      return {
        success: true,
        message: 'V201 campaign closed successfully',
        campaignId: campaign.id,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(`[V201] Failed to close campaign ${campaign.id}: ${errorMsg}`);
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
    publishEvent(
      CampaignEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET,
      { campaignId: campaign.id }
    );
  }

  private async closeFungibleCampaign(
    campaign: campaign_twittercard
  ): Promise<void> {
    await this.executeSmartContractClosing(campaign, 'FUNGIBLE');
    await this.updateCampaignToClosedAwaitingData(campaign);
    publishEvent(
      CampaignEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET,
      { campaignId: campaign.id }
    );
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

      // Log smart contract closing start
      if (this.campaignLogger) {
        await this.campaignLogger.saveLog({
          campaignId: campaign.id,
          status: 'SMART_CONTRACT_CLOSING',
          message: `Starting ${type} smart contract closing for contract ${contractId}`,
          level: CampaignLogLevel.INFO,
          eventType: CampaignLogEventType.SYSTEM_EVENT,
          data: {
            level: CampaignLogLevel.INFO,
            eventType: CampaignLogEventType.SYSTEM_EVENT,
            metadata: { contractId, type },
          },
        });
      }

      if (type === 'HBAR') {
        await closeCampaignSMTransaction(contractId);
      } else {
        await closeFungibleAndNFTCampaign(contractId);
      }

      if (campaign.contract_id) {
        // Note: In-memory status update removed as requested
      }

      // Log successful smart contract closing
      if (this.campaignLogger) {
        await this.campaignLogger.saveLog({
          campaignId: campaign.id,
          status: 'SMART_CONTRACT_CLOSED',
          message: `Successfully closed ${type} smart contract for contract ${contractId}`,
          level: CampaignLogLevel.SUCCESS,
          eventType: CampaignLogEventType.SYSTEM_EVENT,
          data: {
            level: CampaignLogLevel.SUCCESS,
            eventType: CampaignLogEventType.SYSTEM_EVENT,
            metadata: { contractId, type },
          },
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Log smart contract error
      if (this.campaignLogger) {
        await this.campaignLogger.logError(
          campaign.id,
          error as Error,
          'smart_contract_closing'
        );
      }

      logger.err(
        `[V201] Smart contract transaction failed for campaign ${campaign.id}: ${errorMsg}`
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
        logger.err('Services not initialized for error handling');
        return;
      }

      // Log the closing error to CampaignLog database
      await this.campaignLogger.saveLog({
        campaignId: campaign.id,
        status: 'CLOSING_ERROR',
        message: `Campaign closing failed: ${errorMsg}`,
        level: CampaignLogLevel.ERROR,
        eventType: CampaignLogEventType.ERROR_OCCURRED,
        data: {
          level: CampaignLogLevel.ERROR,
          eventType: CampaignLogEventType.ERROR_OCCURRED,
          error: {
            code: 'CAMPAIGN_CLOSING_ERROR',
            message: errorMsg,
          },
          metadata: {
            campaignType: campaign.type,
            contractId: campaign.contract_id,
            context: 'campaign_closing_process',
          },
        },
      });

      // Update campaign status to error
      await new CampaignTwitterCardModel(this.prisma).updateCampaign(
        campaign.id,
        {
          card_status: campaignstatus.InternalError,
        }
      );

      // Log status update
      await this.campaignLogger.saveLog({
        campaignId: campaign.id,
        status: 'STATUS_UPDATED',
        message:
          'Campaign status updated to InternalError due to closing failure',
        level: CampaignLogLevel.WARNING,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        data: {
          level: CampaignLogLevel.WARNING,
          eventType: CampaignLogEventType.SYSTEM_EVENT,
          metadata: {
            newStatus: 'InternalError',
            reason: 'closing_error',
          },
        },
      });

      // Update in-memory status if contract ID exists
      if (campaign.contract_id) {
        // Note: In-memory status update removed as requested
      }
    } catch (error) {
      const nestedErrorMsg =
        error instanceof Error ? error.message : String(error);
      logger.err(
        `[V201] Failed to handle closing error for campaign ${campaign.id}: ${nestedErrorMsg}. Original error: ${errorMsg}`
      );

      // Try to log the nested error as well if campaign logger is available
      if (this.campaignLogger) {
        try {
          await this.campaignLogger.saveLog({
            campaignId: campaign.id,
            status: 'ERROR_HANDLING_FAILED',
            message: `Failed to handle closing error: ${nestedErrorMsg}`,
            level: CampaignLogLevel.ERROR,
            eventType: CampaignLogEventType.ERROR_OCCURRED,
            data: {
              level: CampaignLogLevel.ERROR,
              eventType: CampaignLogEventType.ERROR_OCCURRED,
              error: {
                code: 'ERROR_HANDLING_FAILURE',
                message: nestedErrorMsg,
              },
              metadata: {
                originalError: errorMsg,
                context: 'error_handling_process',
              },
            },
          });
        } catch (logError) {
          logger.err(
            `Failed to log error handling failure: ${String(logError)}`
          );
        }
      }
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

      // Log status update
      await this.campaignLogger.saveLog({
        campaignId: campaign.id,
        status: 'STATUS_UPDATED',
        message: 'Campaign status updated to RewardDistributionInProgress',
        level: CampaignLogLevel.SUCCESS,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        data: {
          level: CampaignLogLevel.SUCCESS,
          eventType: CampaignLogEventType.SYSTEM_EVENT,
          metadata: {
            newStatus: 'RewardDistributionInProgress',
            reason: 'campaign_closed_awaiting_data',
          },
        },
      });

      // Note: In-memory status update removed as requested
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Log the error
      if (this.campaignLogger) {
        await this.campaignLogger.logError(
          campaign.id,
          error as Error,
          'update_campaign_to_closed_awaiting_data'
        );
      }

      logger.err(
        `[V201] Failed to update campaign to closed-awaiting-data status for ${campaign.id}: ${errorMsg}`
      );
      throw error;
    }
  }
}

export default CampaignClosingService;
