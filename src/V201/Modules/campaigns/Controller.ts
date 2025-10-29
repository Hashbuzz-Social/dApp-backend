import { DraftCampaignBody, PubishCampaignBody } from '@V201/types';
import { Request, Response } from 'express';
import { convertBigIntToString } from '../../../utils/bigintSerializer';
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
        const errorResponse = {
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
        };
        // Use utility to safely handle any BigInt values
        return res.status(400).json(convertBigIntToString(errorResponse));
      }

      // Success response with detailed information
      const responseMessage =
        publishResult.action === 'already_running'
          ? 'Campaign is already published and running'
          : publishResult.action === 'resumed'
          ? 'Campaign publishing resumed successfully'
          : 'Campaign publishing started successfully';

      return res.accepted(
        convertBigIntToString({
          campaignId,
          userId: userId.toString(), // Convert BigInt to string
          action: publishResult.action,
          currentState: publishResult.stateInfo?.currentState,
          message: publishResult.message,
        }),
        responseMessage
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const errorResponse = {
        success: false,
        message: `Failed to publish campaign: ${errorMessage}`,
        action: 'error',
        details: {
          campaignId,
          userId: userId.toString(), // Convert BigInt to string
          error: errorMessage,
        },
      };
      return res.status(500).json(convertBigIntToString(errorResponse));
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

  /**
   * GET /api/v201/campaigns/admin/list
   * Get all campaigns (admin only)
   */
  async getAllCampaigns(req: Request, res: Response): Promise<Response | void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string | undefined;
      const campaignType = req.query.campaignType as string | undefined;

      const skip = (page - 1) * limit;

      const prisma = await import('@shared/prisma').then((m) => m.default());

      // Build where clause
      const where: any = {};
      if (status) {
        where.card_status = status;
      }
      if (campaignType) {
        where.type = campaignType;
      }

      const [campaigns, totalCount] = await Promise.all([
        prisma.campaign_twittercard.findMany({
          where,
          skip,
          take: limit,
          orderBy: { id: 'desc' },
          include: {
            user_user: {
              select: {
                id: true,
                name: true,
                personal_twitter_handle: true,
                hedera_wallet_id: true,
              },
            },
          },
        }),
        prisma.campaign_twittercard.count({ where }),
      ]);

      const serializedCampaigns = campaigns.map((campaign) =>
        convertBigIntToString(campaign)
      );

      return res.success(
        {
          campaigns: serializedCampaigns,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit),
          },
        },
        'Campaigns retrieved successfully'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return res.badRequest(`Failed to get campaigns: ${errorMessage}`);
    }
  }

  /**
   * GET /api/v201/campaigns/admin/:campaignId/logs
   * Get campaign timeline logs (admin only)
   */
  async getCampaignLogs(req: Request, res: Response): Promise<Response | void> {
    try {
      const campaignId = BigInt(req.params.campaignId);

      const prisma = await import('@shared/prisma').then((m) => m.default());

      // Get campaign with logs
      const campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: campaignId },
        include: {
          campaignLogs: {
            orderBy: { timestamp: 'asc' },
          },
          user_user: {
            select: {
              id: true,
              name: true,
              personal_twitter_handle: true,
              hedera_wallet_id: true,
            },
          },
        },
      });

      if (!campaign) {
        return res.notFound('Campaign not found', String(campaignId));
      }

      const serializedCampaign = convertBigIntToString(campaign);

      return res.success(
        serializedCampaign,
        'Campaign logs retrieved successfully'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return res.badRequest(`Failed to get campaign logs: ${errorMessage}`);
    }
  }
}

export default new CampaignController();
