import { CampaignEvents } from '@V201/events/campaign';
import { CampaignPublishPayLoad } from './campaigns';

export type EventPayloadMap = {
  [CampaignEvents.CAMPAIGN_PUBLISH_CONTENT]: CampaignPublishPayLoad;
};
