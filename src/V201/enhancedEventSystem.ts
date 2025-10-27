import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import { EventPayloadMap } from './Types/eventPayload';
import { eventBus } from './eventBus';
import { publishToQueue } from './redisQueue';
import { safeStringifyData } from './Modules/common';

// Enhanced event statuses for better tracking
export enum EventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETRY = 'RETRY',
  DEAD_LETTER = 'DEAD_LETTER',
}

export interface EnhancedEvent {
  id: bigint;
  eventType: keyof EventPayloadMap;
  payload: any;
  status: EventStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  error?: string;
}

export class EnhancedEventSystem {
  // No retry logic - all failed events go directly to dead letter

  /**
   * Enhanced event publishing with better error handling and status tracking
   */
  static async publishEvent<K extends keyof EventPayloadMap>(
    eventType: K,
    payload: EventPayloadMap[K],
    options?: {
      maxRetries?: number;
      priority?: 'low' | 'normal' | 'high';
      delayMs?: number;
    }
  ): Promise<bigint | null> {
    const prisma = await createPrismaClient();

    try {
      // Save event with PENDING status
      const savedEvent = await prisma.eventOutBox.create({
        data: {
          event_type: eventType as string,
          payload: safeStringifyData({
            ...payload,
            _metadata: {
              // No retries - events that fail go directly to dead letter
              maxRetries: 0,
              priority: options?.priority ?? 'normal',
              delayMs: options?.delayMs ?? 0,
              createdAt: new Date().toISOString(),
            },
          }),
          // Add status field (requires schema update)
          // status: EventStatus.PENDING,
          // retry_count: 0
        },
      });

      // Emit to in-memory event bus for immediate subscribers
      eventBus.emit(eventType, payload);

      // Publish to Redis queue for async processing
      await publishToQueue('event-queue', {
        eventType,
        payload,
        eventId: savedEvent.id,
        priority: options?.priority ?? 'normal',
      });

      logger.info(`Event published: ${eventType} (ID: ${savedEvent.id})`);
      return savedEvent.id;
    } catch (error) {
      const publishErrorMessage =
        error instanceof Error ? error.message : String(error);
      const publishErrorStack =
        error instanceof Error
          ? error.stack || 'No stack trace available'
          : 'No stack trace available';

      logger.err(
        `Failed to publish event ${eventType}: ${publishErrorMessage}`
      );
      logger.err(`Publish error stack trace: ${publishErrorStack}`);
      return null;
    }
  }

  /**
   * Enhanced event processing with retry logic and status updates
   */
  static async processEvent(
    eventId: bigint,
    eventType: string,
    payload: any,
    processorFn: (eventType: string, payload: any) => Promise<void>
  ): Promise<boolean> {
    try {
      // Update status to PROCESSING (requires schema update)
      // await this.updateEventStatus(eventId, EventStatus.PROCESSING);

      // Process the event
      await processorFn(eventType, payload);

      // Mark as completed and cleanup
      await this.completeEvent(eventId);

      logger.info(
        `Event processed successfully: ${eventType} (ID: ${eventId})`
      );
      return true;
    } catch (error) {
      const eventErrorMessage =
        error instanceof Error ? error.message : String(error);
      const eventErrorStack =
        error instanceof Error
          ? error.stack || 'No stack trace available'
          : 'No stack trace available';

      logger.err(
        `Error processing event ${eventType} (ID: ${eventId}): ${eventErrorMessage}`
      );
      logger.err(`Stack trace: ${eventErrorStack}`);

      // Check if this event type should never be retried
      if (this.isNoRetryEvent(eventType)) {
        logger.warn(
          `Event ${eventType} (ID: ${eventId}) is configured for NO RETRY. Moving to dead letter.`
        );
        await this.moveToDeadLetter(
          eventId,
          eventType,
          payload,
          error as Error
        );
        return false;
      }

      // ALL ERRORS go directly to dead letter - no retries
      const deadLetterErrorMessage =
        error instanceof Error ? error.message : String(error);
      const deadLetterErrorStack =
        error instanceof Error
          ? error.stack || 'No stack trace available'
          : 'No stack trace available';

      logger.warn(
        `Event ${eventType} (ID: ${eventId}) failed. Moving to dead letter for manual review. Error: ${deadLetterErrorMessage}`
      );
      logger.err(`Full stack trace: ${deadLetterErrorStack}`);

      await this.moveToDeadLetter(eventId, eventType, payload, error as Error);

      return false;
    }
  }

  /**
   * Check if event type should never be retried
   * These events collect engagement data and should not retry to avoid duplicate/inconsistent data
   */
  private static isNoRetryEvent(eventType: string): boolean {
    const noRetryEvents = [
      'CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_LIKE_AND_RETWEET',
      'CAMPAIGN_CLOSING_COLLECT_ENGAGEMENT_DATA_QUOTE_AND_REPLY',
    ];
    return noRetryEvents.includes(eventType);
  }

  /**
   * Detect if error is a Twitter rate limit error
   */
  private static isTwitterRateLimitError(errorMessage: string): boolean {
    return (
      errorMessage.includes('TWITTER_RATE_LIMITED') ||
      errorMessage.includes('429') ||
      errorMessage.includes('Rate limit exceeded') ||
      errorMessage.includes('Too Many Requests')
    );
  }

  /**
   * Detect if error is a smart contract error
   */
  private static isSmartContractError(errorMessage: string): boolean {
    return (
      errorMessage.includes('Failed to add campaign to contract') ||
      errorMessage.includes('Contract ID is undefined') ||
      errorMessage.includes('Failed to update contract state')
    );
  }

  /**
   * Move failed events to dead letter queue
   */
  private static async moveToDeadLetter(
    eventId: bigint,
    eventType: string,
    payload: any,
    error: Error
  ): Promise<void> {
    const prisma = await createPrismaClient();

    try {
      // Create dead letter record
      await prisma.eventOutBox.update({
        where: { id: eventId },
        data: {
          event_type: `DEAD_LETTER_${eventType}`,
          // Use safeStringifyData to handle BigInt and similar types reliably
          payload: safeStringifyData({
            originalEventType: eventType,
            originalPayload: payload,
            error: error.message,
            movedAt: new Date().toISOString(),
          }),
        },
      });

      logger.warn(
        `Event moved to dead letter queue: ${eventType} (ID: ${eventId})`
      );

      // Optionally notify administrators about dead letter events
      // await this.notifyDeadLetterEvent(eventId, eventType, error);
    } catch (err) {
      logger.err(
        `Failed to move event ${eventId} to dead letter queue: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Safely complete and cleanup an event
   */
  private static async completeEvent(eventId: bigint): Promise<void> {
    const prisma = await createPrismaClient();

    try {
      await prisma.eventOutBox.delete({
        where: { id: eventId },
      });
    } catch (error) {
      logger.err(
        `Failed to cleanup completed event ${eventId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get event processing statistics
   */
  static async getEventStats(): Promise<{
    pending: number;
    completed: number;
    failed: number;
    deadLetter: number;
  }> {
    const prisma = await createPrismaClient();

    try {
      const [pending, deadLetter] = await Promise.all([
        prisma.eventOutBox.count({
          where: {
            NOT: {
              event_type: {
                startsWith: 'DEAD_LETTER_',
              },
            },
          },
        }),
        prisma.eventOutBox.count({
          where: {
            event_type: {
              startsWith: 'DEAD_LETTER_',
            },
          },
        }),
      ]);

      return {
        pending,
        completed: 0, // Would need additional tracking
        failed: 0, // Would need additional tracking
        deadLetter,
      };
    } catch (error) {
      logger.err(
        `Failed to get event stats: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return { pending: 0, completed: 0, failed: 0, deadLetter: 0 };
    }
  }

  /**
   * Reprocess dead letter events (for MANUAL recovery only)
   * WARNING: This should only be used for manual recovery by administrators.
   * Automatic reprocessing of dead letter events can create infinite error loops.
   * Use with caution and only after fixing the underlying issue that caused the dead letter.
   */
  static async reprocessDeadLetterEvents(limit = 10): Promise<number> {
    const prisma = await createPrismaClient();

    try {
      const deadLetterEvents = await prisma.eventOutBox.findMany({
        where: {
          event_type: {
            startsWith: 'DEAD_LETTER_',
          },
        },
        take: limit,
      });

      let reprocessedCount = 0;

      for (const event of deadLetterEvents) {
        try {
          const payloadData = JSON.parse(event.payload as string);
          const originalEventType = payloadData.originalEventType;
          const originalPayload = payloadData.originalPayload;

          // Republish the event (no retries, will go to dead letter again if it fails)
          const newEventId = await this.publishEvent(
            originalEventType,
            originalPayload
          );

          if (newEventId) {
            // Remove from dead letter queue
            await prisma.eventOutBox.delete({
              where: { id: event.id },
            });
            reprocessedCount++;
          }
        } catch (err) {
          logger.err(
            `Failed to reprocess dead letter event ${event.id}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }

      logger.info(`Reprocessed ${reprocessedCount} dead letter events`);
      return reprocessedCount;
    } catch (error) {
      logger.err(
        `Failed to reprocess dead letter events: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return 0;
    }
  }
}

export default EnhancedEventSystem;
