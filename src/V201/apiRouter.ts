import { Router } from "express";
import { campaignRouter, monitoringRoutes, questRouter } from './Modules';
import userInfo from '@middleware/userInfo';
import asyncHandler from '@shared/asyncHandler';

const router = Router();

// websocket route placeholder: clients should connect directly to the WS server
router.use('/websocket', (_req, res) => res.status(204).send());

router.use('/campaign', campaignRouter);
router.use(
  '/monitoring',
  asyncHandler(userInfo.getCurrentUserInfo),
  monitoringRoutes
);
router.use('/quest', questRouter);

export default router;
