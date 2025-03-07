import {
  handleCampaignPublishTransaction,
  publshCampaignContentHandler,
} from '@V201/modules/campaigns';
import PrismaClientManager from '@V201/PrismaClient';
import { EventPayloadMap } from '@V201/types';
import { CampaignEvents } from './AppEvents';
import { consumeFromQueue } from './redisQueue';

const processEvent = async <T extends keyof EventPayloadMap>(
  eventId: number | bigint,
  eventType: T,
  payload: EventPayloadMap[T]
) => {
  console.log(`Processing event ${eventType}`, payload);

  switch (eventType) {
    // handle event CAMPAIGN_PUBLISH_CONTENT event
    case CampaignEvents.CAMPAIGN_PUBLISH_CONTENT:
      const publishContentPayload =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_CONTENT];
      publshCampaignContentHandler(publishContentPayload);
      break;

    // handle event CAMPAIGN_PUBLISH_DO_SM_TRANSACTION event
    case CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION:
      const trnsactionPayload =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION];
      handleCampaignPublishTransaction(trnsactionPayload);
      break;

    // handle event CAMPAIGN_PUBLISH_ERROR event
    case CampaignEvents.CAMPAIGN_PUBLISH_ERROR:
      const { error } =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_ERROR];
      console.error('Error processing event:', error);
      break;

    default:
      break;
  }
  const prisma = await PrismaClientManager.getInstance();
  await prisma.eventOutBox.delete({
    where: {
      event_type: eventType,
      id: eventId,
    },
  });
};

consumeFromQueue('event-queue', async (event) => {
  await processEvent(event.eventId, event.eventType, event.payload);
});
