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
const router = express.Router();

// Route to create a new campaign
router.post(
  '/draft',
  tempStoreMediaOnDisk,
  validateDraftCampaignBody,
  userInfo.getCurrentUserInfo,
  storeMediaToS3,
  CampaignController.draftCampaign
);

router.post(
  '/publish',
  validatePublishCampaignBody,
  userInfo.getCurrentUserInfo,
  CampaignController.startPublishingCampaign
);

export default router;
