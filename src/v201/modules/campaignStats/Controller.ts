import { Request, Response } from 'express';
// import { CampaignStatsService } from './CampaignStatsService';

export class CampaignStatsController {
    // private campaignStatsService: CampaignStatsService;

    constructor() {
        // this.campaignStatsService = new CampaignStatsService();
    }

    public async getCampaignStats(req: Request, res: Response): Promise<void> {
        try {
            // const campaignId = req.params.id;
            // const stats = await this.campaignStatsService.getStats(campaignId);
            res.status(200);
        } catch (error) {
            res.status(500).json({ message: 'Error retrieving campaign stats', error });
        }
    }

    public async updateCampaignStats(req: Request, res: Response): Promise<void> {
        try {
            const campaignId = req.params.id;
            const statsData = req.body;
            // const updatedStats = await this.campaignStatsService.updateStats(campaignId, statsData);
            res.status(200)
        } catch (error) {
            res.status(500).json({ message: 'Error updating campaign stats', error });
        }
    }
}

export default new CampaignStatsController();