
import { CampaignEvents } from '@V201/events/campaign';
import { EventPayloadMap } from '@V201/types';
import logger from 'jet-logger';
  

// handler error for the campaign publish
export const publshCampaignErrorHandler = async ({
    error,
    campaignMeta,
    atStage,
  }: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_ERROR]): Promise<void> => {
    logger.err(
      `Error in campaign publish event at stage ${atStage}:${error.message}`
    );
    // handle error
  };
  