import { DraftCampaignBody, PubishCampaignBody } from '@V201/types';
import { Request, Response } from 'express';
import { draftCampaign } from './services';
import SmartCampaignPublishService from './services/campaignPublish/smartCampaignPublishService';

class CampaignController {
  private smartPublishService: SmartCampaignPublishService;

  constructor() {
    this.smartPublishService = new SmartCampaignPublishService();
  }

  // Method to create a new campaign
  async draftCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.currentUser?.id;
      const campaignBody = req.body as DraftCampaignBody;

      if (!userId) {
        throw new Error('User ID not found');
      }

      const newCampaign = await draftCampaign(campaignBody, userId);

      return res.created(newCampaign, 'Campaign drafted successfully');
    } catch (error) {
      throw new Error('Failed to draft campaign');
    }
  }

  // Method to start publishing Campaign with smart retry logic
  async startPublishingCampaign(
    req: Request,
    res: Response
  ): Promise<Response | void> {
    const userId = req.currentUser?.id;
    const body = req.body as PubishCampaignBody;
    const campaignId = Number(body.campaignId);

    if (!userId) {
      throw new Error('User ID not found');
    }

    try {
      // Use smart publish service that handles retries and state validation
      const publishResult =
        await this.smartPublishService.publishOrResumeCampaign(
          campaignId,
          userId
        );

      if (!publishResult.success) {
        // Return specific error information
        return res.status(400).json({
          success: false,
          message: publishResult.message,
          stateInfo: publishResult.stateInfo,
          action: publishResult.action,
          details: {
            campaignId,
            currentState: publishResult.stateInfo?.currentState,
            canRetry: publishResult.stateInfo?.canRetry,
            nextAction: publishResult.stateInfo?.nextAction,
          },
        });
      }

      // Success response with detailed information
      const responseMessage =
        publishResult.action === 'already_running'
          ? 'Campaign is already published and running'
          : publishResult.action === 'resumed'
          ? 'Campaign publishing resumed successfully'
          : 'Campaign publishing started successfully';

      return res.accepted(
        {
          campaignId,
          userId,
          action: publishResult.action,
          currentState: publishResult.stateInfo?.currentState,
          message: publishResult.message,
        },
        responseMessage
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return res.status(500).json({
        success: false,
        message: `Failed to publish campaign: ${errorMessage}`,
        action: 'error',
        details: {
          campaignId,
          userId,
          error: errorMessage,
        },
      });
    }
  }

  // Method to get campaign state information for debugging
  async getCampaignState(
    req: Request,
    res: Response
  ): Promise<Response | void> {
    const userId = req.currentUser?.id;
    const campaignId = parseInt(req.params.campaignId);

    if (!userId) {
      throw new Error('User ID not found');
    }

    if (!campaignId || isNaN(campaignId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID',
      });
    }

    try {
      const stateInfo = await this.smartPublishService.getCampaignStateInfo(
        campaignId,
        userId
      );

      return res.json({
        success: true,
        stateInfo,
        details: {
          campaignId,
          currentState: stateInfo.currentState,
          canRetry: stateInfo.canRetry,
          nextAction: stateInfo.nextAction,
          errorMessage: stateInfo.errorMessage,
          resumeFromStep: stateInfo.resumeFromStep,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return res.status(500).json({
        success: false,
        message: `Failed to get campaign state: ${errorMessage}`,
      });
    }
  }
}

export default new CampaignController();
