import { Router } from 'express';
import { HCSController } from '../controller/HCSController';
import { query, param } from 'express-validator';
import { checkErrResponse } from '@validator/userRoutes.validator';

const hcsRouter = Router();

/**
 * @route   GET /api/hcs/campaign/:campaignId/audit-trail
 * @desc    Get campaign audit trail from HCS
 * @access  Private
 * @params  campaignId - Campaign ID to get audit trail for
 * @query   startDate - Optional start date filter (ISO string)
 * @query   endDate - Optional end date filter (ISO string)
 * @query   limit - Optional limit for results (default 100, max 1000)
 */
hcsRouter.get(
  '/campaign/:campaignId/audit-trail',
  [
    param('campaignId').isNumeric().withMessage('Campaign ID must be a number'),
    query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
    query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  ],
  checkErrResponse,
  HCSController.getCampaignAuditTrail
);

/**
 * @route   GET /api/hcs/user/:userId/audit-trail
 * @desc    Get user activity audit trail from HCS
 * @access  Private
 * @params  userId - User ID to get audit trail for
 * @query   startDate - Optional start date filter (ISO string)
 * @query   endDate - Optional end date filter (ISO string)
 * @query   limit - Optional limit for results (default 100, max 1000)
 */
hcsRouter.get(
  '/user/:userId/audit-trail',
  [
    param('userId').isNumeric().withMessage('User ID must be a number'),
    query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
    query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  ],
  checkErrResponse,
  HCSController.getUserAuditTrail
);

/**
 * @route   GET /api/hcs/topic/:topicName/info
 * @desc    Get HCS topic information and statistics
 * @access  Private
 * @params  topicName - Name of the HCS topic
 */
hcsRouter.get(
  '/topic/:topicName/info',
  [
    param('topicName').isString().notEmpty().withMessage('Topic name is required'),
  ],
  checkErrResponse,
  HCSController.getHCSTopicInfo
);

/**
 * @route   GET /api/hcs/topic/:topicName/messages
 * @desc    Query messages from a specific HCS topic
 * @access  Private
 * @params  topicName - Name of the HCS topic
 * @query   startDate - Optional start date filter (ISO string)
 * @query   endDate - Optional end date filter (ISO string)
 * @query   limit - Optional limit for results (default 100, max 1000)
 */
hcsRouter.get(
  '/topic/:topicName/messages',
  [
    param('topicName').isString().notEmpty().withMessage('Topic name is required'),
    query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
    query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  ],
  checkErrResponse,
  HCSController.queryHCSMessages
);

/**
 * @route   GET /api/hcs/campaign/:campaignId/engagement/:tweetId?/verification
 * @desc    Get engagement verification data from HCS for a campaign
 * @access  Private
 * @params  campaignId - Campaign ID to verify engagement for
 * @params  tweetId - Optional specific tweet ID to filter by
 * @query   startDate - Optional start date filter (ISO string)
 * @query   endDate - Optional end date filter (ISO string)
 */
hcsRouter.get(
  '/campaign/:campaignId/engagement/:tweetId?/verification',
  [
    param('campaignId').isNumeric().withMessage('Campaign ID must be a number'),
    param('tweetId').optional().isString().withMessage('Tweet ID must be a string'),
    query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
    query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
  ],
  checkErrResponse,
  HCSController.getEngagementVerification
);

/**
 * @route   GET /api/hcs/campaign/:campaignId/rewards/audit-trail
 * @desc    Get reward distribution audit trail from HCS
 * @access  Private
 * @params  campaignId - Campaign ID to get reward audit trail for
 * @query   userId - Optional user ID to filter rewards for specific user
 * @query   startDate - Optional start date filter (ISO string)
 * @query   endDate - Optional end date filter (ISO string)
 * @query   limit - Optional limit for results (default 100, max 1000)
 */
hcsRouter.get(
  '/campaign/:campaignId/rewards/audit-trail',
  [
    param('campaignId').isNumeric().withMessage('Campaign ID must be a number'),
    query('userId').optional().isNumeric().withMessage('User ID must be a number'),
    query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
    query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  ],
  checkErrResponse,
  HCSController.getRewardAuditTrail
);

export default hcsRouter;
