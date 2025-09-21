import {
  handleCampaignPublishTransaction,
  publishCampaignSecondContent,
  publshCampaignContentHandler,
  publshCampaignErrorHandler,
} from '@V201/modules/campaigns';
import createPrismaClient from '@shared/prisma';
import { EventPayloadMap } from '@V201/types';
import Logger from 'jet-logger';
import { BalanceEvents, CampaignEvents } from './AppEvents';
import { safeStringifyData } from './Modules/common';
import { consumeFromQueue } from './redisQueue';
import { WebSocketNotificationService } from './services/websocket/WebSocketNotificationService';

const processEvent = async (
  eventId: number,
  eventType: string,
  payload: any
) => {
  Logger.info(
    `Processing event ${String(eventType)} - payload: ${safeStringifyData(
      payload
    )}`
  );

  switch (eventType) {
    // handle event CAMPAIGN_PUBLISH_CONTENT event
    case CampaignEvents.CAMPAIGN_PUBLISH_CONTENT: {
      const publishContentPayload =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_CONTENT];
      await publshCampaignContentHandler(publishContentPayload);
      break;
    }

    // handle event CAMPAIGN_PUBLISH_DO_SM_TRANSACTION event
    case CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION: {
      const trnsactionPayload =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION];
      await handleCampaignPublishTransaction(trnsactionPayload);
      break;
    }

    case CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT: {
      const secondContentPayload =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT];
      await publishCampaignSecondContent(secondContentPayload);
      break;
    }

    // handle event CAMPAIGN_PUBLISH_ERROR event
    case CampaignEvents.CAMPAIGN_PUBLISH_ERROR: {
      const errorPayload =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_ERROR];
      await publshCampaignErrorHandler(errorPayload);
      break;
    }

    case CampaignEvents.CAMPAIGN_DRAFT_SUCCESS: {
      const draftPayload =
        payload as EventPayloadMap[CampaignEvents.CAMPAIGN_DRAFT_SUCCESS];
      Logger.info(
        `Campaign Drafted Successfully with payload ${safeStringifyData(
          draftPayload
        )}`
      );
      break;
    }

    // User Balance updates

    case BalanceEvents.CAMPAIGNER_FUNGIBLE_BALANCE_UPDATE: {
      const balanceUpdatePayload =
        payload as EventPayloadMap[BalanceEvents.CAMPAIGNER_FUNGIBLE_BALANCE_UPDATE];
      Logger.info(
        `Campaigner Fungible Balance Updated with payload ${safeStringifyData(
          balanceUpdatePayload
        )}`
      );

      // Send WebSocket notification for balance update
      try {
        const userBalance = balanceUpdatePayload.userBalance;
        await WebSocketNotificationService.notifyBalanceUpdate(
          String(balanceUpdatePayload.userId),
          {
            balanceType: 'TOKEN',
            tokenId: balanceUpdatePayload.tokenId || undefined,
            tokenSymbol: balanceUpdatePayload.tokenId
              ? balanceUpdatePayload.tokenId.substring(0, 8) + '...'
              : 'TOKEN',
            oldBalance: '0', // Previous balance not available in current payload
            newBalance: String(userBalance.entity_balance || 0),
            changeAmount: String(userBalance.entity_balance || 0),
            changeReason: 'OTHER', // Cannot determine reason from current payload
            relatedCampaignId: undefined, // Not available in current payload
            transactionId: undefined, // Not available in current payload
          }
        );
      } catch (error) {
        Logger.err(
          'Failed to send fungible balance WebSocket notification: ' +
            String(error)
        );
      }
      break;
    }

    case BalanceEvents.CAMPAIGNER_HABR_BALANCE_UPDATE: {
      const hbarBalanceUpdatePayload =
        payload as EventPayloadMap[BalanceEvents.CAMPAIGNER_HABR_BALANCE_UPDATE];
      Logger.info(
        `Campaigner HBAR Balance Updated with payload ${safeStringifyData(
          hbarBalanceUpdatePayload
        )}`
      );

      // Send WebSocket notification for HBAR balance update
      try {
        await WebSocketNotificationService.notifyBalanceUpdate(
          String(hbarBalanceUpdatePayload.userId),
          {
            balanceType: 'HBAR',
            tokenSymbol: 'HBAR',
            oldBalance: '0', // Previous balance not available in current payload
            newBalance: String(hbarBalanceUpdatePayload.availableBalance || 0),
            changeAmount: String(
              hbarBalanceUpdatePayload.availableBalance || 0
            ),
            changeReason: 'OTHER', // Cannot determine reason from current payload
            relatedCampaignId: undefined, // Not available in current payload
            transactionId: undefined, // Not available in current payload
          }
        );
      } catch (error) {
        Logger.err(
          'Failed to send HBAR balance WebSocket notification: ' + String(error)
        );
      }
      break;
    }

    default:
      break;
  }
  const prisma = await createPrismaClient();
  // delete the outbox record by id after successful processing
  await prisma.eventOutBox.delete({
    where: { id: BigInt(eventId) },
  });
};

Logger.info('Starting event consumer...');

// Start the event consumer with proper async handling
(async () => {
  try {
    await consumeFromQueue('event-queue', (event) => {
      // event may already be parsed by safeParsedData in redisQueue
      const raw = typeof event === 'string' ? JSON.parse(event) : event;
      if (!raw || !raw.eventId || !raw.eventType) {
        Logger.err(`Invalid event format: ${safeStringifyData(raw)}`);
        return;
      }

      // spawn async handler so the queue callback stays synchronous/void
      (async () => {
        try {
          const eventId = Number(raw.eventId);
          await processEvent(eventId, String(raw.eventType), raw.payload);
        } catch (err) {
          Logger.err(`Error processing event: ${String(err)}`);
        }
      })();
    });
  } catch (error) {
    Logger.err(`Failed to start event consumer: ${String(error)}`);
  }
})();
