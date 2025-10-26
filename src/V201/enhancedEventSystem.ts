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
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 5000;

  // Circuit breaker state tracking
  private static readonly circuitBreakerMap = new Map<
    string,
    {
      failures: number;
      lastFailure: number;
      isOpen: boolean;
    }
  >();

  /**
   * Check if circuit breaker should prevent retry for this error pattern
   */
  private static isCircuitBreakerOpen(
    eventType: string,
    errorMessage: string
  ): boolean {
    const key = `${eventType}:${errorMessage.substring(0, 50)}`;
    const circuitState = this.circuitBreakerMap.get(key);

    if (!circuitState) return false;

    const now = Date.now();
    const resetTime = 30 * 60 * 1000; // 30 minutes

    // Reset circuit breaker after timeout
    if (circuitState.isOpen && now - circuitState.lastFailure > resetTime) {
      circuitState.isOpen = false;
      circuitState.failures = 0;
      return false;
    }

    return circuitState.isOpen;
  }

  /**
   * Update circuit breaker state on failure
   */
  private static updateCircuitBreaker(
    eventType: string,
    errorMessage: string
  ): void {
    const key = `${eventType}:${errorMessage.substring(0, 50)}`;
    const circuitState = this.circuitBreakerMap.get(key) || {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
    };

    circuitState.failures++;
    circuitState.lastFailure = Date.now();

    // Open circuit breaker after 5 consecutive failures
    if (circuitState.failures >= 5) {
      circuitState.isOpen = true;
      logger.warn(
        `Circuit breaker opened for ${eventType} with error: ${errorMessage.substring(
          0,
          100
        )}`
      );
    }

    this.circuitBreakerMap.set(key, circuitState);
  }

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
          payload: JSON.stringify({
            ...payload,
            _metadata: {
              maxRetries: options?.maxRetries ?? this.MAX_RETRIES,
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
      logger.err(
        `Failed to publish event ${eventType}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
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
      logger.err(
        `Error processing event ${eventType} (ID: ${eventId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );

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

      // Check if this is a Twitter rate limit error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (this.isTwitterRateLimitError(errorMessage)) {
        logger.warn(
          `Twitter rate limit detected for event ${eventType} (ID: ${eventId}). Moving to dead letter without retry.`
        );
        await this.moveToDeadLetter(
          eventId,
          eventType,
          payload,
          error as Error
        );
        return false;
      }

      // Check if this is a smart contract failure
      if (this.isSmartContractError(errorMessage)) {
        logger.warn(
          `Smart contract error detected for event ${eventType} (ID: ${eventId}). Moving to dead letter without retry.`
        );
        await this.moveToDeadLetter(
          eventId,
          eventType,
          payload,
          error as Error
        );
        return false;
      }

      // Handle retry logic for other errors
      const shouldRetry = await this.handleEventFailure(
        eventId,
        eventType,
        payload,
        error as Error
      );

      if (shouldRetry) {
        // NO LONGER SCHEDULING RECURSIVE RETRIES VIA TIMEOUT
        // Instead, the event will be requeued through the proper event queue mechanism
        logger.info(
          `Event ${eventType} (ID: ${eventId}) will be retried via queue mechanism`
        );
      }

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
   * Handle event failure with retry logic
   */
  private static async handleEventFailure(
    eventId: bigint,
    eventType: string,
    payload: any,
    error: Error
  ): Promise<boolean> {
    const prisma = await createPrismaClient();

    try {
      const event = await prisma.eventOutBox.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        logger.warn(`Event ${eventId} not found for retry handling`);
        return false;
      }

      const payloadData = JSON.parse(event.payload as string);
      const metadata = payloadData._metadata || {};
      const retryCount = (metadata.retryCount || 0) + 1;
      const maxRetries = metadata.maxRetries || this.MAX_RETRIES;

      if (retryCount <= maxRetries) {
        // Check circuit breaker before allowing retry
        if (this.isCircuitBreakerOpen(eventType, error.message)) {
          logger.warn(
            `Circuit breaker is open for ${eventType}. Moving to dead letter without retry.`
          );
          await this.moveToDeadLetter(eventId, eventType, payload, error);
          return false;
        }

        // Update circuit breaker state
        this.updateCircuitBreaker(eventType, error.message);

        // Calculate exponential backoff delay
        const baseDelayMs = 5000; // 5 seconds
        const delayMs = Math.min(
          baseDelayMs * Math.pow(2, retryCount - 1), // Exponential backoff
          300000 // Max 5 minutes
        );

        // Update retry count and status
        await prisma.eventOutBox.update({
          where: { id: eventId },
          data: {
            payload: JSON.stringify({
              ...payloadData,
              _metadata: {
                ...metadata,
                retryCount,
                lastError: error.message,
                lastRetryAt: new Date().toISOString(),
                nextRetryAt: new Date(Date.now() + delayMs).toISOString(),
              },
            }),
          },
        });

        // Requeue the event with delay (instead of setTimeout recursion)
        const { publishToQueue } = await import('./redisQueue');
        setTimeout(() => {
          (async () => {
            try {
              await publishToQueue('event-queue', {
                eventType,
                payload: {
                  ...payload,
                  _retryAttempt: retryCount,
                },
                eventId: Number(eventId),
                priority: 'low', // Lower priority for retries
              });
              logger.info(
                'Requeued event for retry - EventType: ' +
                  eventType +
                  ', ID: ' +
                  eventId +
                  ', Attempt: ' +
                  retryCount +
                  '/' +
                  maxRetries +
                  ', Delay: ' +
                  delayMs +
                  'ms'
              );
            } catch (requeueError) {
              logger.err(
                `Failed to requeue event ${String(eventId)}: ${
                  requeueError instanceof Error
                    ? requeueError.message
                    : String(requeueError)
                }`
              );
            }
          })();
        }, delayMs);

        return true; // Should retry
      } else {
        // Move to dead letter queue
        await this.moveToDeadLetter(eventId, eventType, payload, error);
        return false; // Don't retry
      }
    } catch (err) {
      logger.err(
        `Failed to handle event failure for ${eventId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return false;
    }
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
   * Reprocess dead letter events (for recovery)
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

          // Republish the event
          const newEventId = await this.publishEvent(
            originalEventType,
            originalPayload,
            { maxRetries: 1 }
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
