import {
  handleCampaignPublishTransaction,
  publishCampaignSecondContent,
  publishCampaignContentHandler,
  publshCampaignErrorHandler,
} from '@V201/modules/campaigns';
import type { EventPayloadMap } from '@V201/types';
import Logger from 'jet-logger';
import { BalanceEvents, CampaignEvents } from './AppEvents';
import { safeStringifyData } from './Modules/common';
import { consumeFromQueue } from './redisQueue';
import { EnhancedEventSystem } from './enhancedEventSystem';
import JSONBigInt from 'json-bigint';
import { processLikeAndRetweetCollection } from './Modules/campaigns/services/campaignClose/OnCloseEngagementService';
import { onCloseReCalculateRewardsRates } from './Modules/campaigns/services/campaignClose/OnCloseReCalculateRewardRates';
import { onCloseRewardServices } from './Modules/campaigns/services/campaignClose/onCloseAutoReward';

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
          await publishCampaignContentHandler(publishContentPayload);
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

        // handle events related to campaign close

        case CampaignEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET: {
          const collectEngagementPayload =
            payload as EventPayloadMap[CampaignEvents.CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET];
          Logger.info(
            `Collecting engagement like and retweet for campaign ID: ${collectEngagementPayload.campaignId}`
          );
          // Call the function to collect engagement like and retweet
          await processLikeAndRetweetCollection(collectEngagementPayload);
          break;
        }

        case CampaignEvents.CAMPAIGN_CLOSING_RECALCULATE_REWARDS_RATES: {
          const recalculateRewardsRatesPayload =
            payload as EventPayloadMap[CampaignEvents.CAMPAIGN_CLOSING_RECALCULATE_REWARDS_RATES];
          Logger.info(
            `Recalculating rewards rates for campaign ID: ${recalculateRewardsRatesPayload.campaignId}`
          );
          // Call the function to recalculate rewards rates
          await onCloseReCalculateRewardsRates(recalculateRewardsRatesPayload);
          break;
        }

        case CampaignEvents.CAMPAIGN_CLOSING_DISTRIBUTE_AUTO_REWARDS: {
          const distributeAutoRewardsPayload =
            payload as EventPayloadMap[CampaignEvents.CAMPAIGN_CLOSING_DISTRIBUTE_AUTO_REWARDS];
          Logger.info(
            `Distributing auto rewards for campaign ID: ${distributeAutoRewardsPayload.campaignId}`
          );

          await onCloseRewardServices(distributeAutoRewardsPayload);
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

  consumeFromQueue(
    'event-queue',
    (event) => {
      if (isShuttingDown) {
        Logger.info('Shutting down, skipping event processing');
        return;
      }

      // event may already be parsed by safeParsedData in redisQueue
      const raw = typeof event === 'string' ? JSONBigInt.parse(event) : event;
      if (!raw || !raw.eventId || !raw.eventType) {
        Logger.err(`Invalid event format: ${safeStringifyData(raw)}`);
        return;
      }

      // spawn async handler so the queue callback stays synchronous/void
      (async () => {
        try {
          const eventId = Number(raw.eventId);
          const success = await processEvent(
            eventId,
            String(raw.eventType),
            raw.payload
          );

          if (success) {
            Logger.info(
              `Successfully processed event ${String(
                raw.eventType
              )} (ID: ${eventId})`
            );
          }
        } catch (err) {
          Logger.err(`Critical error processing event: ${String(err)}`);
        }
      })();
    },
    { signal: abortController.signal }
  );

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

// Periodic stats logging with intelligent retry logic
setInterval(() => {
  (async () => {
    try {
      const stats = await EnhancedEventSystem.getEventStats();
      Logger.info(
        `Event Stats - Pending: ${stats.pending}, Dead Letter: ${stats.deadLetter}`
      );

      // DISABLE AUTO-REPROCESSING OF DEAD LETTER EVENTS TO PREVENT INFINITE LOOPS
      // Auto-reprocessing is disabled to prevent API quota exhaustion
      // Dead letter events should be manually reviewed and reprocessed
      if (stats.deadLetter > 0) {
        Logger.warn(
          `${stats.deadLetter} dead letter events require manual review. Auto-reprocessing is disabled.`
        );
      }

      // Only reprocess if there are very few dead letter events and enough time has passed
      // This prevents hammering failed services
      /*
      if (stats.deadLetter > 0 && stats.deadLetter <= 2) {
        const reprocessed = await EnhancedEventSystem.reprocessDeadLetterEvents(1);
        if (reprocessed > 0) {
          Logger.info(`Auto-reprocessed ${reprocessed} dead letter events`);
        }
      }
      */
    } catch (error) {
      Logger.err(
        `Error getting event stats: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  })();
}, 30000); // Every 30 seconds

export { processEvent, EnhancedEventSystem };
