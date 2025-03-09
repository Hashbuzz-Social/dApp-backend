import { CampaignEvents } from '@V201/events/campaign';
import {
  CampaignPublishErrorPayLoad,
  CampaignPublishPayLoad,
  CampaignDraftPayLoad,
} from './campaigns';

export type EventPayloadMap = {
  [CampaignEvents.CAMPAIGN_PUBLISH_CONTENT]: CampaignPublishPayLoad;
  [CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION]: CampaignPublishPayLoad;
  [CampaignEvents.CAMPAIGN_PUBLISH_ERROR]: CampaignPublishErrorPayLoad;
  [CampaignEvents.CAMPAIGN_DRAFT_SUCCESS]: CampaignDraftPayLoad;
};
