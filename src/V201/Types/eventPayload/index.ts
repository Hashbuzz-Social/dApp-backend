import { CampaignEvents, CampaignSheduledEvents } from '@V201/events/campaign';
import {
  CampaignPublishErrorPayLoad,
  CampaignPublishPayLoad,
  CampaignDraftPayLoad,
  CampaignCloseJobPayload,
  CampaignExpiryJobPayload,
  V201EngagementDataCollectionPayload,
  CampaignClosedPayload,
  CampaignBudgetRefundPayload,
  CampaignRateUpdatedPayload,
  CampaignClosingErrorPayload,
} from './campaigns';
import {
  CampaignerFuncgibleBalanceUpdatePayload,
  CampaignerHbarBalUpdatePayload,
} from './balance';
import { BalanceEvents } from '@V201/events/balances';

export type EventPayloadMap = {
  // Campaign publish events
  [CampaignEvents.CAMPAIGN_PUBLISH_CONTENT]: CampaignPublishPayLoad;
  [CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION]: CampaignPublishPayLoad;
  [CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT]: CampaignPublishPayLoad;

  // Campaign Draft events
  [CampaignEvents.CAMPAIGN_DRAFT_SUCCESS]: CampaignDraftPayLoad;

  // Campaign Close events
  [CampaignEvents.CAMPAIGN_CLOSED]: CampaignClosedPayload;
  [CampaignEvents.CAMPAIGN_BUDGET_REFUND]: CampaignBudgetRefundPayload;
  [CampaignEvents.CAMPAIGN_RATE_UPDATED]: CampaignRateUpdatedPayload;
  [CampaignEvents.CAMPAIGN_CLOSING_ERROR]: CampaignClosingErrorPayload;

  [BalanceEvents.CAMPAIGNER_HABR_BALANCE_UPDATE]: CampaignerHbarBalUpdatePayload;
  [BalanceEvents.CAMPAIGNER_FUNGIBLE_BALANCE_UPDATE]: CampaignerFuncgibleBalanceUpdatePayload;

  // Error Handling
  [CampaignEvents.CAMPAIGN_PUBLISH_ERROR]: CampaignPublishErrorPayLoad;
};

export type SheduleJobPayloadMap = {
  [CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION]: CampaignCloseJobPayload;
  [CampaignSheduledEvents.CAMPAIGN_EXPIRATION_OPERATION]: CampaignExpiryJobPayload;
  [CampaignSheduledEvents.V201_ENGAGEMENT_DATA_COLLECTION]: V201EngagementDataCollectionPayload;
};
