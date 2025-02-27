import express from 'express';
import CampaignController from './Controller';



const router = express.Router();

// Route to get camcampaignRouterpaign stats
router.get('/all', CampaignController.getCampaignStats);

// Route to create a new campaign
router.post('/draft', CampaignController.createCampaign);

router.post('/publish', CampaignController.createCampaign);

router.post('/stop',    CampaignController.createCampaign);

router.patch('/:campaignId',  CampaignController. updateCampaign ); // update content till campaign is in draft state.

export default router;