import { Router, Request, Response, NextFunction } from 'express';
import MonitoringController from '../controllers/MonitoringController';
import auth from '@middleware/auth';
import admin from '@middleware/admin';

const router = Router();

// Async wrapper to handle async routes properly
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * V201 Monitoring Routes
 * All routes require admin authentication for security
 */

// Health Check Endpoints
router.get('/health/bullmq', auth.isAdminRequesting, admin.isAdmin, asyncHandler(async (req: Request, res: Response) => {
  await MonitoringController.getBullMQHealth(req, res);
}));

router.get('/health/system', auth.isAdminRequesting, admin.isAdmin, asyncHandler(async (req: Request, res: Response) => {
  await MonitoringController.getSystemHealth(req, res);
}));

// Campaign Monitoring
router.get('/campaigns/stuck', auth.isAdminRequesting, admin.isAdmin, asyncHandler(async (req: Request, res: Response) => {
  await MonitoringController.getStuckCampaigns(req, res);
}));

router.post('/campaigns/stuck/process', auth.isAdminRequesting, admin.isAdmin, asyncHandler(async (req: Request, res: Response) => {
  await MonitoringController.processStuckCampaigns(req, res);
}));

// Token Monitoring
router.get('/tokens/sync-status', auth.isAdminRequesting, admin.isAdmin, asyncHandler(async (req: Request, res: Response) => {
  await MonitoringController.getTokenSyncStatus(req, res);
}));

export default router;
