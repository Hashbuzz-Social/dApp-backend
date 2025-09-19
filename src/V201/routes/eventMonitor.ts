import { Router } from 'express';
import asyncHandler from '@shared/asyncHandler';
import EventMonitorController from '../Modules/eventMonitor/BasicController';

const router = Router();

// Get event system statistics
router.get('/stats', asyncHandler(EventMonitorController.getEventStats.bind(EventMonitorController)));

// Get recent event activity
router.get('/activity', asyncHandler(EventMonitorController.getEventActivity.bind(EventMonitorController)));

// Get dead letter events
router.get('/dead-letter', asyncHandler(EventMonitorController.getDeadLetterEvents.bind(EventMonitorController)));

// Reprocess dead letter events
router.post('/dead-letter/reprocess', asyncHandler(EventMonitorController.reprocessDeadLetterEvents.bind(EventMonitorController)));

// Health check endpoint
router.get('/health', asyncHandler(EventMonitorController.healthCheck.bind(EventMonitorController)));

export default router;
