import { Router } from 'express';
import asyncHandler from '@shared/asyncHandler';
import userInfo from '@middleware/userInfo';
import admin from '@middleware/admin';
import CampaignMonitoringController from './CampaignMonitoringController';

const router = Router();

/**
 * Campaign Monitoring & Event Revival Routes
 * Admin-only endpoints for campaign health monitoring and event retry
 */

/**
 * GET /api/v2/campaigns/:id/monitor
 * Get comprehensive campaign status with logs, events, and health
 */
router.get(
  '/:id/monitor',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(admin.isAdmin),
  asyncHandler(CampaignMonitoringController.getCampaignStatus.bind(CampaignMonitoringController))
);

/**
 * POST /api/v2/campaigns/:id/resume
 * Resume/retry campaign from last failed step
 * Retries all dead letter events for this campaign
 */
router.post(
  '/:id/resume',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(admin.isAdmin),
  asyncHandler(CampaignMonitoringController.resumeCampaign.bind(CampaignMonitoringController))
);

/**
 * POST /api/v2/campaigns/events/:eventId/retry
 * Retry a specific dead letter event by ID
 */
router.post(
  '/events/:eventId/retry',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(admin.isAdmin),
  asyncHandler(CampaignMonitoringController.retryEvent.bind(CampaignMonitoringController))
);

export default router;
