import { campaign_twittercard, user_user } from '@prisma/client';
import { CampaignTypes } from '@services/CampaignLifeCycleBase';

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

export type CampaignDraftPayLoad = {
  campaignId: number | bigint;
  userId: number | bigint;
  createdAt: Date;
  budget: number;
  type: CampaignTypes;
};

export type CampaignCloseJobPayload = {
  userId: number | bigint;
  cardId: number | bigint;
  type: CampaignTypes;
  createdAt: Date;
  tweetId: string;
};
