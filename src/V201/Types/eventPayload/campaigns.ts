import { campaign_twittercard, user_user } from '@prisma/client';
import { CampaignEvents } from '@V201/events/campaign';

export type CampaignPublishPayLoad = {
  cardOwner: user_user;
  card: campaign_twittercard;
};

export type CampaignPublishErrorPayLoad = {
  campaignMeta: { campaignId: number | bigint; userId: number | bigint };
  message: string;
  atStage: string;
  error: Error;
};
