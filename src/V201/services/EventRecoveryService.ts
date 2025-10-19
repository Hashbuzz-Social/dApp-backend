import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import { publishToQueue } from '../redisQueue';

/**
 * EventRecoveryService
 *
 * Handles recovery of orphaned events on server restart.
 * This ensures no event loss when server stops with pending events in Redis queue.
 *
 * Key Features:
 * - Recovers events stuck in PENDING status for > 5 minutes
 * - Respects max retry limits to prevent infinite loops
 * - Prevents duplicate recovery with time-based checks
 * - Non-blocking (won't prevent server startup on failure)
 * - Automatic cleanup of old completed/dead letter events
 */
export class EventRecoveryService {
  /**
   * Recover orphaned PENDING events on server startup
   *
   * This function is called during server initialization to find and re-process
   * events that were in the Redis queue when the server was stopped.
   *
   * @returns Object with recovery statistics
   */
  static async recoverPendingEvents(): Promise<{
    recovered: number;
    failed: number;
    skipped: number;
    total: number;
  }> {
    const prisma = await createPrismaClient();

    try {
      // Find events stuck in PENDING for more than 5 minutes
      // This prevents recovering events that are currently being processed
      const cutoffTime = new Date(Date.now() - 5 * 60 * 1000);

      const pendingEvents = await prisma.eventOutBox.findMany({
        where: {
          status: 'PENDING',
          created_at: { lt: cutoffTime }, // Only old events, not fresh ones
          retry_count: { lt: 3 }, // Only if not exceeded max retries
        },
        orderBy: { created_at: 'asc' }, // Process oldest first
        take: 100, // Limit to prevent overload on startup
      });

      if (pendingEvents.length === 0) {
        logger.info('✅ No orphaned events to recover');
        return { recovered: 0, failed: 0, skipped: 0, total: 0 };
      }

      logger.info(
        `🔄 Found ${pendingEvents.length} orphaned PENDING events, starting recovery...`
      );

      let recovered = 0;
      let failed = 0;
      let skipped = 0;

      for (const event of pendingEvents) {
        try {
          // Safety check: Skip if event was updated very recently
          // This prevents duplicate recovery if server restarts multiple times quickly
          if (event.updated_at) {
            const timeSinceUpdate =
              Date.now() - new Date(event.updated_at).getTime();
            if (timeSinceUpdate < 60 * 1000) {
              // Updated in last minute
              skipped++;
              logger.info(
                `⏭️  Skipping recently updated event ${event.event_type} (ID: ${event.id})`
              );
              continue;
            }
          }

          // Parse payload from database
          let payload;
          try {
            payload =
              typeof event.payload === 'string'
                ? JSON.parse(event.payload)
                : event.payload;
          } catch (parseError) {
            failed++;
            logger.err(
              `❌ Failed to parse payload for event ${event.id}: ${
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError)
              }`
            );
            continue;
          }

          // Re-publish to existing Redis queue
          // This will be picked up by the EventsWorker
          await publishToQueue('event-queue', {
            eventType: event.event_type,
            payload,
            eventId: event.id,
            priority: 'normal',
          });

          // Update retry count to track recovery attempts
          await prisma.eventOutBox.update({
            where: { id: event.id },
            data: {
              retry_count: (event.retry_count || 0) + 1,
              updated_at: new Date(),
            },
          });

          recovered++;
          logger.info(
            `✅ Recovered event ${event.event_type} (ID: ${event.id}, retry: ${
              (event.retry_count || 0) + 1
            })`
          );
        } catch (error) {
          failed++;
          logger.err(
            `❌ Failed to recover event ${event.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );

          // Update event with error information
          try {
            await prisma.eventOutBox.update({
              where: { id: event.id },
              data: {
                last_error: `Recovery failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                updated_at: new Date(),
              },
            });
          } catch (updateError) {
            logger.err(
              `Failed to update error for event ${event.id}: ${String(
                updateError
              )}`
            );
          }
        }
      }

      const summary = {
        recovered,
        failed,
        skipped,
        total: pendingEvents.length,
      };

      logger.info(
        `🔄 Recovery complete: ${recovered} recovered, ${failed} failed, ${skipped} skipped (total: ${pendingEvents.length})`
      );

      // Log warning if many failures
      if (failed > 0 && failed > recovered) {
        logger.warn(
          `⚠️  High recovery failure rate: ${failed}/${pendingEvents.length} events failed. Check logs for details.`
        );
      }

      return summary;
    } catch (error) {
      logger.err(
        `❌ Event recovery service failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Return zero stats instead of throwing - don't block server startup
      return { recovered: 0, failed: 0, skipped: 0, total: 0 };
    }
  }

  /**
   * Cleanup old completed and dead letter events (maintenance job)
   *
   * This should be run periodically (e.g., every 6 hours) to prevent
   * eventOutBox table from growing indefinitely.
   *
   * @returns Object with cleanup statistics
   */
  static async cleanupOldEvents(): Promise<{
    deletedCompleted: number;
    deletedDeadLetter: number;
  }> {
    const prisma = await createPrismaClient();

    try {
      // Delete events older than 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Delete old completed events
      const deletedCompleted = await prisma.eventOutBox.deleteMany({
        where: {
          status: 'COMPLETED',
          processed_at: { lt: thirtyDaysAgo },
        },
      });

      // Delete old dead letter events (keep failed for debugging)
      const deletedDeadLetter = await prisma.eventOutBox.deleteMany({
        where: {
          status: 'DEAD_LETTER',
          updated_at: { lt: thirtyDaysAgo },
        },
      });

      if (deletedCompleted.count > 0 || deletedDeadLetter.count > 0) {
        logger.info(
          `🗑️  Event cleanup: Deleted ${deletedCompleted.count} completed events, ${deletedDeadLetter.count} dead letter events (older than 30 days)`
        );
      }

      return {
        deletedCompleted: deletedCompleted.count,
        deletedDeadLetter: deletedDeadLetter.count,
      };
    } catch (error) {
      logger.err(
        `❌ Event cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {
        deletedCompleted: 0,
        deletedDeadLetter: 0,
      };
    }
  }

  /**
   * Get statistics about pending events
   * Useful for monitoring and debugging
   */
  static async getPendingEventsStats(): Promise<{
    totalPending: number;
    oldPending: number; // > 5 minutes
    veryOldPending: number; // > 1 hour
    maxRetryExceeded: number;
  }> {
    const prisma = await createPrismaClient();

    try {
      const now = Date.now();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const oneHourAgo = new Date(now - 60 * 60 * 1000);

      const [
        totalPending,
        oldPending,
        veryOldPending,
        maxRetryExceeded,
      ] = await Promise.all([
        prisma.eventOutBox.count({
          where: { status: 'PENDING' },
        }),
        prisma.eventOutBox.count({
          where: {
            status: 'PENDING',
            created_at: { lt: fiveMinutesAgo },
          },
        }),
        prisma.eventOutBox.count({
          where: {
            status: 'PENDING',
            created_at: { lt: oneHourAgo },
          },
        }),
        prisma.eventOutBox.count({
          where: {
            status: 'PENDING',
            retry_count: { gte: 3 },
          },
        }),
      ]);

      return {
        totalPending,
        oldPending,
        veryOldPending,
        maxRetryExceeded,
      };
    } catch (error) {
      logger.err(
        `Failed to get pending events stats: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {
        totalPending: 0,
        oldPending: 0,
        veryOldPending: 0,
        maxRetryExceeded: 0,
      };
    }
  }
}
