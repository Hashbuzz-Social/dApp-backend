import {
  handleCampaignPublishTransaction,
  publishCampaignSecondContent,
  publshCampaignContentHandler,
  publshCampaignErrorHandler,
} from '@V201/modules/campaigns';
import type { EventPayloadMap } from '@V201/types';
import Logger from 'jet-logger';
import { BalanceEvents, CampaignEvents } from './AppEvents';
import { safeStringifyData } from './Modules/common';
import { consumeFromQueue } from './redisQueue';
import { EnhancedEventSystem } from './enhancedEventSystem';

/**
 * Enhanced event processor with better error handling and retry logic
 */
const processEvent = async (
  eventId: number,
  eventType: string,
  payload: any
) => {
  return EnhancedEventSystem.processEvent(
    BigInt(eventId),
    eventType,
    payload,
    async (eventType: string, payload: any) => {
      Logger.info(`Processing event ${String(eventType)} - payload: ${safeStringifyData(payload)}`);

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
          //  send sse event to the client regard the balance update
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

          //  send sse event to the client regard the balance update
          break;
        }

        default:
          Logger.warn(`Unhandled event type: ${eventType}`);
          break;
      }
    }
  );
};

// Enhanced event consumer with graceful error handling
Logger.info('Starting enhanced event consumer...');

let isShuttingDown = false;

const startEventConsumer = () => {
  const abortController = new AbortController();

  consumeFromQueue('event-queue', (event) => {
    if (isShuttingDown) {
      Logger.info('Shutting down, skipping event processing');
      return;
    }

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
        const success = await processEvent(eventId, String(raw.eventType), raw.payload);

        if (success) {
          Logger.info(`Successfully processed event ${String(raw.eventType)} (ID: ${eventId})`);
        }
      } catch (err) {
        Logger.err(`Critical error processing event: ${String(err)}`);
      }
    })();
  }, { signal: abortController.signal });

  return abortController;
};

// Start the consumer
const abortController = startEventConsumer();

// Graceful shutdown handling
const gracefulShutdown = () => {
  Logger.info('Shutting down event consumer gracefully...');
  isShuttingDown = true;
  abortController.abort();

  setTimeout(() => {
    Logger.info('Event consumer shutdown complete');
    process.exit(0);
  }, 5000); // Give 5 seconds for current events to finish
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('uncaughtException', (error) => {
  Logger.err(`Uncaught exception in event worker: ${error.message}`);
  gracefulShutdown();
});
process.on('unhandledRejection', (reason) => {
  Logger.err(`Unhandled promise rejection in event worker: ${String(reason)}`);
  gracefulShutdown();
});

// Periodic stats logging
setInterval(() => {
  (async () => {
    try {
      const stats = await EnhancedEventSystem.getEventStats();
      Logger.info(`Event Stats - Pending: ${stats.pending}, Dead Letter: ${stats.deadLetter}`);

      // Auto-reprocess dead letter events if there aren't too many
      if (stats.deadLetter > 0 && stats.deadLetter <= 5) {
        const reprocessed = await EnhancedEventSystem.reprocessDeadLetterEvents(3);
        if (reprocessed > 0) {
          Logger.info(`Auto-reprocessed ${reprocessed} dead letter events`);
        }
      }
    } catch (error) {
      Logger.err(`Error getting event stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}, 30000); // Every 30 seconds

export { processEvent, EnhancedEventSystem };
