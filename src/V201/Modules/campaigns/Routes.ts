import userInfo from '@middleware/userInfo';
import express from 'express';
import {
  storeMediaToS3,
  tempStoreMediaOnDisk,
  multerErrorHandler,
  validateDraftCampaignBody,
  validatePublishCampaignBody,
} from '../../MiddleWare';
import CampaignController from './Controller';
import asyncHandler from '@shared/asyncHandler';

/**
 * @swagger
 * tags:
 *   name: Campaigns
 *   description: API endpoints for managing campaigns
 */

/**
 * Express router to mount campaign related functions on.
 * @type {Router}
 */
const campaignRouter = express.Router();

// Route to create a new campaign
campaignRouter.post(
  '/draft',
  tempStoreMediaOnDisk,
  multerErrorHandler, // Handle Multer errors with user-friendly messages
  validateDraftCampaignBody,
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(storeMediaToS3),
  asyncHandler(CampaignController.draftCampaign.bind(CampaignController))
);

campaignRouter.post(
  '/publish',
  validatePublishCampaignBody,
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(CampaignController.startPublishingCampaign.bind(CampaignController))
);

// Route to get campaign state information for debugging/diagnostics
campaignRouter.get(
  '/:campaignId/state',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(CampaignController.getCampaignState.bind(CampaignController))
);

export default campaignRouter;
