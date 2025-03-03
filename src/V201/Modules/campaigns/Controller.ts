import { DraftCampaignBody, PubishCampaignBody } from '@V201/types';
import { Request, Response } from 'express';
import { draftCampaign } from './services';

class CampaignController {


  // Method to create a new campaign
  async draftCampaign(
    req: Request<{}, {}, DraftCampaignBody>,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.currentUser?.id; // Assuming user ID is available in the request object
      const campaignBody = req.body;

      if (!userId) {
        throw new Error('User ID not found');
      }

      const newCampaign = await draftCampaign(campaignBody, userId);

      return res.created(newCampaign, 'Campaign drafted successfully');
    } catch (error) {
      throw new Error('Failed to draft campaign');
    }
  }

  // Method to start publishing Campaign
  async startPublishingCampaign(
    req: Request<{}, {}, PubishCampaignBody, {}>,
    res: Response
  ): Promise<void> {
    const userId = req.currentUser?.id; // Assuming user ID is available in the request object
    const campaignId = req.body.campaignId;

    if (!userId) {
      throw new Error('User ID not found');
    }



    // Assuming publishCampaign is a service method that publishes the campaign

    return res.accepted({}, 'Campaign is being published');
  }


}

export default new CampaignController();
