import express from 'express';
import CampaignStatsController from './Controller';


const router = express.Router();

// Route to get camcampaignRouterpaign stats
router.get('/:campaignId', CampaignStatsController.getCampaignStats);

export default router;