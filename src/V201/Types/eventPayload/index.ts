import { BalanceEvents } from '@V201/events/balances';
import { CampaignEvents, CampaignScheduledEvents } from '@V201/events/campaign';
import {
  CampaignerFuncgibleBalanceUpdatePayload,
  CampaignerHbarBalUpdatePayload,
} from './balance';
import {
  CampaignCloseJobPayload,
  CampaignClosingErrorPayload,
  CampaignDraftPayLoad,
  CampaignExpiryJobPayload,
  CampaignPublishErrorPayLoad,
  CampaignPublishPayLoad,
  CollectEngagementLikeAndRetweetPayload,
  V201EngagementDataCollectionPayload,
} from './campaigns';

export type EventPayloadMap = {
  // Campaign publish events
  [CampaignEvents.CAMPAIGN_PUBLISH_CONTENT]: CampaignPublishPayLoad;
  [CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION]: CampaignPublishPayLoad;
  [CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT]: CampaignPublishPayLoad;

  // Campaign Draft events
  [CampaignEvents.CAMPAIGN_DRAFT_SUCCESS]: CampaignDraftPayLoad;

  // Campaign Close events
  [CampaignEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET]: {
    campaignId: number | bigint;
  };
  [CampaignEvents.CAMPAIGN_CLOSING_RECALCULATE_REWARDS_RATES]: {
    campaignId: number | bigint;
  };

  [CampaignEvents.CAMPAIGN_CLOSING_DISTRIBUTE_AUTO_REWARDS]: {
    campaignId: number | bigint;
  };

  [CampaignEvents.CAMPAIGN_CLOSING_ERROR]: CampaignClosingErrorPayload;

  [BalanceEvents.CAMPAIGNER_HABR_BALANCE_UPDATE]: CampaignerHbarBalUpdatePayload;
  [BalanceEvents.CAMPAIGNER_FUNGIBLE_BALANCE_UPDATE]: CampaignerFuncgibleBalanceUpdatePayload;

  // Error Handling
  [CampaignEvents.CAMPAIGN_PUBLISH_ERROR]: CampaignPublishErrorPayLoad;

  // Quest specific events
  [CampaignEvents.CAMPAIGN_CLOSING_FIND_QUEST_WINNERS]: {
    campaignId: number | bigint;
  };
};

export type ScheduledJobPayloadMap = {
  [CampaignScheduledEvents.CAMPAIGN_CLOSE_OPERATION]: CampaignCloseJobPayload;
  [CampaignScheduledEvents.CAMPAIGN_EXPIRATION_OPERATION]: CampaignExpiryJobPayload;
  [CampaignScheduledEvents.V201_ENGAGEMENT_DATA_COLLECTION]: V201EngagementDataCollectionPayload;
  [CampaignScheduledEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY]: CollectEngagementLikeAndRetweetPayload;
};
