import { publshCampaignContentHandler } from '@V201/modules/campaigns';
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
    case CampaignEvents.CAMPAIGN_PUBLISH_CONTENT:
      const { cardOwner, card } =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_CONTENT];
      publshCampaignContentHandler(cardOwner, card);
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
