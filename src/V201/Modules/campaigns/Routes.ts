import userInfo from '@middleware/userInfo';
import express from 'express';
import {
  storeMediaToS3,
  tempStoreMediaOnDisk,
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

export default campaignRouter;
