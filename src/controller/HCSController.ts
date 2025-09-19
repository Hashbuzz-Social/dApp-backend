import { Request, Response } from 'express';
import { hcsEventPublisher } from '../V201/hcsEventPublisher';
import { getHCSService } from '../services/hedera-consensus-service';
import { asyncHandler } from '@shared/asyncHandler';
import logger from 'jet-logger';
import statusCodes from 'http-status-codes';

/**
 * Controller for Hedera Consensus Service audit trails and data retrieval
 */
export class HCSController {
  /**
   * Get campaign audit trail from HCS
   */
  static getCampaignAuditTrail = asyncHandler(
    async (req: Request, res: Response) => {
      try {
        const { campaignId } = req.params;
        const { startDate, endDate, limit = 100 } = req.query;

        if (!campaignId || isNaN(Number(campaignId))) {
          return res.status(statusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Valid campaign ID is required',
          });
        }

        await hcsEventPublisher.init();

        const startTime = startDate ? new Date(startDate as string) : undefined;
        const endTime = endDate ? new Date(endDate as string) : undefined;
        const maxRecords = Math.min(Number(limit), 1000); // Cap at 1000 records

        const auditTrail = await hcsEventPublisher.getCampaignAuditTrail(
          BigInt(campaignId),
          startTime,
          endTime
        );

        const limitedResults = auditTrail.slice(0, maxRecords);

        res.status(statusCodes.OK).json({
          success: true,
          data: {
            campaignId: Number(campaignId),
            totalRecords: auditTrail.length,
            returnedRecords: limitedResults.length,
            startDate: startTime?.toISOString(),
            endDate: endTime?.toISOString(),
            auditTrail: limitedResults,
          },
          message: 'Campaign audit trail retrieved successfully',
        });
      } catch (error) {
        logger.err(
          `Error retrieving campaign audit trail: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Failed to retrieve campaign audit trail',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Get user activity audit trail from HCS
   */
  static getUserAuditTrail = asyncHandler(
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const { startDate, endDate, limit = 100 } = req.query;

        if (!userId || isNaN(Number(userId))) {
          return res.status(statusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Valid user ID is required',
          });
        }

        await hcsEventPublisher.init();

        const startTime = startDate ? new Date(startDate as string) : undefined;
        const endTime = endDate ? new Date(endDate as string) : undefined;
        const maxRecords = Math.min(Number(limit), 1000);

        const auditTrail = await hcsEventPublisher.getUserAuditTrail(
          BigInt(userId),
          startTime,
          endTime
        );

        const limitedResults = auditTrail.slice(0, maxRecords);

        res.status(statusCodes.OK).json({
          success: true,
          data: {
            userId: Number(userId),
            totalRecords: auditTrail.length,
            returnedRecords: limitedResults.length,
            startDate: startTime?.toISOString(),
            endDate: endTime?.toISOString(),
            auditTrail: limitedResults,
          },
          message: 'User audit trail retrieved successfully',
        });
      } catch (error) {
        logger.err(
          `Error retrieving user audit trail: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Failed to retrieve user audit trail',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Get HCS topic information and statistics
   */
  static getHCSTopicInfo = asyncHandler(
    async (req: Request, res: Response) => {
      try {
        const { topicName } = req.params;

        if (!topicName) {
          return res.status(statusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Topic name is required',
          });
        }

        const hcsService = await getHCSService();
        const topicInfo = await hcsService.getTopicInfo(topicName);
        const availableTopics = hcsService.getAvailableTopics();

        res.status(statusCodes.OK).json({
          success: true,
          data: {
            topicName,
            topicInfo: {
              topicId: topicInfo.topicId?.toString(),
              topicMemo: topicInfo.topicMemo,
              runningHash: topicInfo.runningHash?.toString(),
              sequenceNumber: String(topicInfo.sequenceNumber || 0),
              expirationTime: topicInfo.expirationTime?.toDate()?.toISOString(),
              autoRenewPeriod: String(topicInfo.autoRenewPeriod?.seconds || 0),
            },
            availableTopics,
          },
          message: 'HCS topic information retrieved successfully',
        });
      } catch (error) {
        logger.err(
          `Error retrieving HCS topic info: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Failed to retrieve HCS topic information',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Query messages from a specific HCS topic
   */
  static queryHCSMessages = asyncHandler(
    async (req: Request, res: Response) => {
      try {
        const { topicName } = req.params;
        const { startDate, endDate, limit = 100 } = req.query;

        if (!topicName) {
          return res.status(statusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Topic name is required',
          });
        }

        await hcsEventPublisher.init();

        const startTime = startDate ? new Date(startDate as string) : undefined;
        const endTime = endDate ? new Date(endDate as string) : undefined;
        const maxRecords = Math.min(Number(limit), 1000);

        const messages = await hcsEventPublisher.queryAuditTrail(
          topicName,
          startTime,
          endTime,
          maxRecords
        );

        res.status(statusCodes.OK).json({
          success: true,
          data: {
            topicName,
            totalMessages: messages.length,
            startDate: startTime?.toISOString(),
            endDate: endTime?.toISOString(),
            messages,
          },
          message: 'HCS messages retrieved successfully',
        });
      } catch (error) {
        logger.err(
          `Error querying HCS messages: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Failed to query HCS messages',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Get engagement verification data from HCS
   */
  static getEngagementVerification = asyncHandler(
    async (req: Request, res: Response) => {
      try {
        const { campaignId, tweetId } = req.params;
        const { startDate, endDate } = req.query;

        if (!campaignId || isNaN(Number(campaignId))) {
          return res.status(statusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Valid campaign ID is required',
          });
        }

        await hcsEventPublisher.init();

        const startTime = startDate ? new Date(startDate as string) : undefined;
        const endTime = endDate ? new Date(endDate as string) : undefined;

        const engagementMessages = await hcsEventPublisher.queryAuditTrail(
          'engagement-tracking',
          startTime,
          endTime,
          500
        );

        // Filter messages for this campaign and optionally tweet
        const filteredMessages = engagementMessages.filter((msg) => {
          const matchesCampaign = msg.campaignId === BigInt(campaignId);
          const matchesTweet = !tweetId || msg.data.tweetId === tweetId;
          return matchesCampaign && matchesTweet;
        });

        res.status(statusCodes.OK).json({
          success: true,
          data: {
            campaignId: Number(campaignId),
            tweetId,
            totalVerificationRecords: filteredMessages.length,
            startDate: startTime?.toISOString(),
            endDate: endTime?.toISOString(),
            verificationData: filteredMessages.map((msg) => ({
              timestamp: msg.timestamp,
              transactionId: msg.transactionId,
              metrics: msg.data.metrics,
              collectedAt: msg.data.collectedAt,
              source: msg.data.source,
            })),
          },
          message: 'Engagement verification data retrieved successfully',
        });
      } catch (error) {
        logger.err(
          `Error retrieving engagement verification: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Failed to retrieve engagement verification data',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Get reward distribution audit trail from HCS
   */
  static getRewardAuditTrail = asyncHandler(
    async (req: Request, res: Response) => {
      try {
        const { campaignId } = req.params;
        const { userId, startDate, endDate, limit = 100 } = req.query;

        if (!campaignId || isNaN(Number(campaignId))) {
          return res.status(statusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Valid campaign ID is required',
          });
        }

        await hcsEventPublisher.init();

        const startTime = startDate ? new Date(startDate as string) : undefined;
        const endTime = endDate ? new Date(endDate as string) : undefined;
        const maxRecords = Math.min(Number(limit), 1000);

        const rewardMessages = await hcsEventPublisher.queryAuditTrail(
          'reward-distribution',
          startTime,
          endTime,
          maxRecords
        );

        // Filter messages for this campaign and optionally user
        const filteredMessages = rewardMessages.filter((msg) => {
          const matchesCampaign = msg.campaignId === BigInt(campaignId);
          const matchesUser = !userId || msg.userId === BigInt(userId as string);
          return matchesCampaign && matchesUser;
        });

        const totalRewardAmount = filteredMessages.reduce((sum, msg) => {
          const amount = typeof msg.data.amount === 'number' ? msg.data.amount : 0;
          return sum + amount;
        }, 0);

        res.status(statusCodes.OK).json({
          success: true,
          data: {
            campaignId: Number(campaignId),
            userId: userId ? Number(userId) : undefined,
            totalRewardRecords: filteredMessages.length,
            totalRewardAmount,
            startDate: startTime?.toISOString(),
            endDate: endTime?.toISOString(),
            rewardDistributions: filteredMessages.map((msg) => ({
              timestamp: msg.timestamp,
              userId: msg.userId?.toString(),
              amount: msg.data.amount,
              tokenType: msg.data.tokenType,
              tokenId: msg.data.tokenId,
              engagementType: msg.data.engagementType,
              transactionId: msg.data.transactionId,
              calculationDetails: msg.data.calculationDetails,
              distributedAt: msg.data.distributedAt,
            })),
          },
          message: 'Reward audit trail retrieved successfully',
        });
      } catch (error) {
        logger.err(
          `Error retrieving reward audit trail: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Failed to retrieve reward audit trail',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );
}

export default HCSController;
