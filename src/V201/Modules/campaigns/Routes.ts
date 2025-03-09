import userInfo from '@middleware/userInfo';
import express from 'express';
import {
  storeMediaToS3,
  tempStoreMediaOnDisk,
  validateDraftCampaignBody,
  validatePublishCampaignBody,
} from 'src/V201/MiddleWare';
import CampaignController from './Controller';

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
  userInfo.getCurrentUserInfo,
  storeMediaToS3,
  CampaignController.draftCampaign
);

campaignRouter.post(
  '/publish',
  validatePublishCampaignBody,
  userInfo.getCurrentUserInfo,
  CampaignController.startPublishingCampaign
);

export default campaignRouter;
