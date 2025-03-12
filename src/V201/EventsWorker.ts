import {
  handleCampaignPublishTransaction,
  publshCampaignContentHandler,
  publshCampaignErrorHandler,
  publishCampaignSecondContent,
} from '@V201/modules/campaigns';
import PrismaClientManager from '@V201/PrismaClient';
import { EventPayloadMap } from '@V201/types';
import { BalanceEvents, CampaignEvents } from './AppEvents';
import { consumeFromQueue } from './redisQueue';
import Logger from 'jet-logger';
import { safeStringifyData } from './Modules/common';

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

    case CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT:
      const secondContentPayload =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT];
      publishCampaignSecondContent(secondContentPayload);
      break;

    // handle event CAMPAIGN_PUBLISH_ERROR event
    case CampaignEvents.CAMPAIGN_PUBLISH_ERROR:
      const errorPayload =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_ERROR];
      publshCampaignErrorHandler(errorPayload);
      break;

    case CampaignEvents.CAMPAIGN_DRAFT_SUCCESS:
      const draftPayload =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_DRAFT_SUCCESS];
      Logger.info(
        `Campaign Drafted Successfully with payload ${safeStringifyData(
          draftPayload
        )}`
      );
      break;

    // User Balance updates

    case BalanceEvents.CAMPAIGNER_FUNGIBLE_BALANCE_UPDATE:
      const balanceUpdatePayload =
        payload as EventPayloadMap[BalanceEvents.CAMPAIGNER_FUNGIBLE_BALANCE_UPDATE];
      Logger.info(
        `Campaigner Fungible Balance Updated with payload ${safeStringifyData(
          balanceUpdatePayload
        )}`
      );
      //  send sse event to the client regard the balance update
      break;

    case BalanceEvents.CAMPAIGNER_HABR_BALANCE_UPDATE:
      const hbarBalanceUpdatePayload =
        payload as EventPayloadMap[BalanceEvents.CAMPAIGNER_HABR_BALANCE_UPDATE];
      Logger.info(
        `Campaigner HBAR Balance Updated with payload ${safeStringifyData(
          hbarBalanceUpdatePayload
        )}`

        //  send sse event to the client regard the balance update
      );
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

console.log('Starting event consumer...');

consumeFromQueue('event-queue', async (event) => {
  event = JSON.parse(event);
  if (!event || !event.eventId || !event.eventType) {
    console.error('Invalid event format:', event);
    return;
  }
  await processEvent(event.eventId, event.eventType, event.payload);
});
