import userInfo from '@middleware/userInfo';
import asyncHandler from '@shared/asyncHandler';
import express from 'express';
import {
    multerErrorHandler,
    storeMediaToS3,
    tempStoreMediaOnDisk,
} from '../../MiddleWare';
import QuestController from './Controller';

/**
 * @swagger
 * tags:
 *   name: Quest Campaigns
 *   description: API endpoints for managing quest-based campaigns
 */

/**
 * Express router to mount quest campaign related functions on.
 * @type {Router}
 */
const questRouter = express.Router();

/**
 * @route POST /v2/quest/draft
 * @desc Create a new quest campaign draft
 * @access Private
 */
questRouter.post(
  '/draft',
  tempStoreMediaOnDisk,
  multerErrorHandler,
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(storeMediaToS3),
  asyncHandler(QuestController.draftQuestCampaign.bind(QuestController))
);

/**
 * @route POST /v2/quest/publish
 * @desc Publish a quest campaign
 * @access Private
 */
questRouter.post(
  '/publish',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(QuestController.publishQuestCampaign.bind(QuestController))
);

/**
 * @route GET /v2/quest/:questId/state
 * @desc Get quest campaign state information
 * @access Private
 */
questRouter.get(
  '/:questId/state',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(QuestController.getQuestState.bind(QuestController))
);

/**
 * @route GET /v2/quest/:questId/submissions
 * @desc Get all submissions for a quest campaign
 * @access Private
 */
questRouter.get(
  '/:questId/submissions',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(QuestController.getQuestSubmissions.bind(QuestController))
);

/**
 * @route POST /v2/quest/:questId/grade
 * @desc Grade quest submissions and distribute rewards
 * @access Private
 */
questRouter.post(
  '/:questId/grade',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(QuestController.gradeQuestSubmissions.bind(QuestController))
);

/**
 * @route POST /v2/quest/:questId/close
 * @desc Manually close a quest campaign
 * @access Private
 */
questRouter.post(
  '/:questId/close',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(QuestController.closeQuestCampaign.bind(QuestController))
);

/**
 * @route GET /v2/quest/all
 * @desc Get all quest campaigns for current user
 * @access Private
 */
questRouter.get(
  '/all',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(QuestController.getAllQuestCampaigns.bind(QuestController))
);

/**
 * @route GET /v2/quest/:questId
 * @desc Get specific quest campaign details
 * @access Private
 */
questRouter.get(
  '/:questId',
  asyncHandler(userInfo.getCurrentUserInfo),
  asyncHandler(QuestController.getAllQuestCampaigns.bind(QuestController))
);

export default questRouter;
