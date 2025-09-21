import { CampaignEvents } from '@V201/events/campaign';
import { publishEvent } from '../../../../eventPublisher';
import logger from 'jet-logger';
import CampaignPublishStateValidator, {
  CampaignPublishState,
  CampaignStateInfo
} from './campaignStateValidator';
import { isCampaignValidForMakeRunning } from './validation';
import { campaignstatus } from '@prisma/client';

export interface PublishResponse {
  success: boolean;
  message: string;
  stateInfo?: CampaignStateInfo;
  action: 'started' | 'resumed' | 'already_running' | 'error';
}

/**
 * Enhanced campaign publishing service that handles retries and state recovery
 */
export class SmartCampaignPublishService {
  private stateValidator: CampaignPublishStateValidator;

  constructor() {
    this.stateValidator = new CampaignPublishStateValidator();
  }

  /**
   * Intelligently publishes or resumes a campaign based on its current state
   */
  async publishOrResumeCampaign(
    campaignId: number,
    userId: number | bigint
  ): Promise<PublishResponse> {
    try {
      logger.info(`Starting smart publish for campaign ${campaignId} by user ${userId}`);

      // Analyze current campaign state
      const validation = await this.stateValidator.validateCampaignForPublish(
        campaignId,
        userId
      );

      if (!validation.canProceed) {
        return {
          success: false,
          message: validation.validationMessage,
          stateInfo: validation.stateInfo,
          action: 'error'
        };
      }

      const { stateInfo } = validation;
      const { currentState, campaign } = stateInfo;

      // Handle different states
      switch (currentState) {
        case CampaignPublishState.FULLY_PUBLISHED:
          return {
            success: true,
            message: 'Campaign is already published and running',
            stateInfo,
            action: 'already_running'
          };

        case CampaignPublishState.NOT_STARTED:
          return await this.startFreshPublish(stateInfo);

        case CampaignPublishState.SMART_CONTRACT_FAILED:
          return this.resumeFromSmartContract(stateInfo);

        case CampaignPublishState.SECOND_TWEET_FAILED:
          return this.resumeFromSecondTweet(stateInfo);

        default:
          return {
            success: false,
            message: `Cannot handle campaign state: ${currentState}`,
            stateInfo,
            action: 'error'
          };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.err(`Error in smart campaign publish: ${errorMessage}`);

      return {
        success: false,
        message: `Failed to publish campaign: ${errorMessage}`,
        action: 'error'
      };
    }
  }

  /**
   * Start publishing a campaign from the beginning
   */
  private async startFreshPublish(stateInfo: CampaignStateInfo): Promise<PublishResponse> {
    try {
      const { campaign } = stateInfo;
      const cardOwner = campaign.user_user;

      if (!cardOwner) {
        throw new Error('Campaign owner data not found');
      }

      // Validate campaign for running
      const isValid = await isCampaignValidForMakeRunning(
        campaign,
        campaignstatus.CampaignRunning
      );

      if (!isValid.isValid) {
        throw new Error(isValid.message);
      }

      logger.info(`Starting fresh publish for campaign ${campaign.id}`);

      // Publish initial event
      publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_CONTENT, {
        cardOwner,
        card: campaign,
      });

      return {
        success: true,
        message: 'Campaign publishing started from the beginning',
        stateInfo,
        action: 'started'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.err(`Error in fresh publish: ${errorMessage}`);

      // Publish error event
      publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_ERROR, {
        campaignMeta: { campaignId: stateInfo.campaign.id, userId: stateInfo.campaign.owner_id },
        atStage: 'startFreshPublish',
        message: errorMessage,
        error,
      });

      throw error;
    }
  }

  /**
   * Resume campaign publish from smart contract step
   */
  private resumeFromSmartContract(stateInfo: CampaignStateInfo): PublishResponse {
    try {
      const { campaign } = stateInfo;
      const cardOwner = campaign.user_user;

      if (!cardOwner) {
        throw new Error('Campaign owner data not found');
      }

      logger.info(`Resuming campaign ${campaign.id} from smart contract step`);

      // Publish smart contract event directly
      publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION, {
        cardOwner,
        card: campaign,
      });

      return {
        success: true,
        message: 'Campaign publishing resumed from smart contract transaction',
        stateInfo,
        action: 'resumed'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.err(`Error resuming from smart contract: ${errorMessage}`);

      publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_ERROR, {
        campaignMeta: { campaignId: stateInfo.campaign.id, userId: stateInfo.campaign.owner_id },
        atStage: 'resumeFromSmartContract',
        message: errorMessage,
        error: error as Error,
      });

      throw error;
    }
  }

  /**
   * Resume campaign publish from second tweet step
   */
  private resumeFromSecondTweet(stateInfo: CampaignStateInfo): PublishResponse {
    try {
      const { campaign } = stateInfo;
      const cardOwner = campaign.user_user;

      if (!cardOwner) {
        throw new Error('Campaign owner data not found');
      }

      logger.info(`Resuming campaign ${campaign.id} from second tweet step`);

      // Publish second tweet event directly
      publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT, {
        cardOwner,
        card: campaign,
      });

      return {
        success: true,
        message: 'Campaign publishing resumed from second tweet publication',
        stateInfo,
        action: 'resumed'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.err(`Error resuming from second tweet: ${errorMessage}`);

      publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_ERROR, {
        campaignMeta: { campaignId: stateInfo.campaign.id, userId: stateInfo.campaign.owner_id },
        atStage: 'resumeFromSecondTweet',
        message: errorMessage,
        error: error as Error,
      });

      throw error;
    }
  }

  /**
   * Get detailed campaign state information for diagnostics
   */
  async getCampaignStateInfo(
    campaignId: number,
    userId: number | bigint
  ): Promise<CampaignStateInfo> {
    return await this.stateValidator.analyzeCampaignState(campaignId, userId);
  }
}

export default SmartCampaignPublishService;
