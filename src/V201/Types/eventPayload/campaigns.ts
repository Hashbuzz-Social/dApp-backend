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

export type CampaignExpiryJobPayload = {
  userId: number | bigint;
  cardId: number | bigint;
  type: CampaignTypes;
  createdAt: Date;
  expiryAt: Date;
};

export type V201EngagementDataCollectionPayload = {
  userId: number | bigint;
  cardId: number | bigint;
  type: CampaignTypes;
  createdAt: Date;
  collectionAttempts: number;
  maxAttempts: number;
};

export type CampaignClosedPayload = {
  campaignId: number | bigint;
  userId: number | bigint;
  actualEngagers: number;
  expectedEngagers: number;
  closedAt: Date;
};

export type CampaignBudgetRefundPayload = {
  campaignId: number | bigint;
  userId: number | bigint;
  refundAmount: number;
  reason: string;
};

export type CampaignRateUpdatedPayload = {
  campaignId: number | bigint;
  userId: number | bigint;
  oldRate: number;
  newRate: number;
  reason: string;
};

export type CampaignClosingErrorPayload = {
  campaignId: number | bigint;
  userId: number | bigint;
  error: string;
  stage: string;
};
