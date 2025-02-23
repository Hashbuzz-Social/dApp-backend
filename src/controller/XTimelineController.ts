import { Request, Response } from 'express';
import { XTimelineService } from '../services/XServices/Timeline';

const xTimelineService = new XTimelineService();

export class XTimelineController {
  public static async initializeTwitterClient(req: Request, res: Response) {
    try {
      const user = req.currentUser;
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }
      await xTimelineService.initialize(user);
      res
        .status(200)
        .json({ message: 'Twitter client initialized successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  public static async getRecentTweets(req: Request, res: Response) {
    try {
      const userId = req.currentUser?.id?.toString();
      const count = parseInt(req.query.count as string) || 5;
      const tweets = await xTimelineService.getRecentTweets(count);
      res.status(200).json(tweets);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
