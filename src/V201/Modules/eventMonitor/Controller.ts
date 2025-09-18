import { Request, Response } from 'express';
import { EnhancedEventSystem } from '../../enhancedEventSystem';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';

/**
 * Event monitoring and management controller
 * Note: Some features require updated Prisma schema with enhanced event fields
 */
export class EventMonitorController {
  /**
   * Get event system statistics
   */
  async getEventStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await EnhancedEventSystem.getEventStats();

      const prisma = await createPrismaClient();

      // Get additional detailed stats
      const detailedStats = await prisma.eventOutBox.groupBy({
        by: ['event_type', 'status'],
        _count: {
          id: true
        },
        orderBy: {
          event_type: 'asc'
        }
      });

      const recentFailures = await prisma.eventOutBox.findMany({
        where: {
          status: 'FAILED',
          created_at: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        select: {
          id: true,
          event_type: true,
          last_error: true,
          retry_count: true,
          created_at: true
        },
        take: 10,
        orderBy: {
          created_at: 'desc'
        }
      });

      res.json({
        success: true,
        data: {
          summary: stats,
          byEventType: detailedStats,
          recentFailures
        }
      });
    } catch (error) {
      logger.err('Error getting event stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get event statistics'
      });
    }
  }

  /**
   * Reprocess dead letter events
   */
  async reprocessDeadLetterEvents(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.query;
      const reprocessedCount = await EnhancedEventSystem.reprocessDeadLetterEvents(
        Number(limit)
      );

      res.json({
        success: true,
        data: {
          reprocessedCount,
          message: `Successfully reprocessed ${reprocessedCount} dead letter events`
        }
      });
    } catch (error) {
      logger.err('Error reprocessing dead letter events:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reprocess dead letter events'
      });
    }
  }

  /**
   * Get dead letter events for manual review
   */
  async getDeadLetterEvents(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      const prisma = await createPrismaClient();

      const [deadLetterEvents, totalCount] = await Promise.all([
        prisma.eventOutBox.findMany({
          where: {
            event_type: {
              startsWith: 'DEAD_LETTER_'
            }
          },
          skip: offset,
          take: Number(limit),
          orderBy: {
            created_at: 'desc'
          }
        }),
        prisma.eventOutBox.count({
          where: {
            event_type: {
              startsWith: 'DEAD_LETTER_'
            }
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          events: deadLetterEvents,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: totalCount,
            totalPages: Math.ceil(totalCount / Number(limit))
          }
        }
      });
    } catch (error) {
      logger.err('Error getting dead letter events:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get dead letter events'
      });
    }
  }

  /**
   * Get recent event processing activity
   */
  async getEventActivity(req: Request, res: Response): Promise<void> {
    try {
      const { hours = 24 } = req.query;
      const sinceTime = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);

      const prisma = await createPrismaClient();

      const activity = await prisma.eventOutBox.findMany({
        where: {
          created_at: {
            gte: sinceTime
          }
        },
        select: {
          id: true,
          event_type: true,
          status: true,
          retry_count: true,
          created_at: true,
          processed_at: true
        },
        orderBy: {
          created_at: 'desc'
        },
        take: 100
      });

      const activitySummary = await prisma.eventOutBox.groupBy({
        by: ['event_type', 'status'],
        where: {
          created_at: {
            gte: sinceTime
          }
        },
        _count: {
          id: true
        }
      });

      res.json({
        success: true,
        data: {
          recentActivity: activity,
          summary: activitySummary,
          timeRange: {
            since: sinceTime,
            hours: Number(hours)
          }
        }
      });
    } catch (error) {
      logger.err('Error getting event activity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get event activity'
      });
    }
  }

  /**
   * Force retry specific event by ID
   */
  async retryEvent(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = req.params;

      const prisma = await createPrismaClient();

      const event = await prisma.eventOutBox.findUnique({
        where: { id: BigInt(eventId) }
      });

      if (!event) {
        res.status(404).json({
          success: false,
          error: 'Event not found'
        });
        return;
      }

      // Reset retry count and status
      await prisma.eventOutBox.update({
        where: { id: BigInt(eventId) },
        data: {
          status: 'PENDING',
          retry_count: 0,
          last_error: null,
          updated_at: new Date()
        }
      });

      // Republish to queue
      const { publishToQueue } = await import('../../redisQueue');
      await publishToQueue('event-queue', {
        eventType: event.event_type,
        payload: event.payload,
        eventId: event.id
      });

      res.json({
        success: true,
        data: {
          eventId: event.id,
          message: 'Event queued for retry'
        }
      });
    } catch (error) {
      logger.err('Error retrying event:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retry event'
      });
    }
  }

  /**
   * Health check for event system
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const prisma = await createPrismaClient();

      // Check if there are stuck events (created more than 1 hour ago and still pending)
      const stuckEvents = await prisma.eventOutBox.count({
        where: {
          status: 'PENDING',
          created_at: {
            lt: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
          }
        }
      });

      const highFailureEvents = await prisma.eventOutBox.count({
        where: {
          retry_count: {
            gte: 3
          },
          status: {
            not: 'COMPLETED'
          }
        }
      });

      const isHealthy = stuckEvents < 10 && highFailureEvents < 5;

      res.status(isHealthy ? 200 : 503).json({
        success: true,
        healthy: isHealthy,
        data: {
          stuckEvents,
          highFailureEvents,
          alerts: [
            ...(stuckEvents >= 10 ? [`${stuckEvents} events appear to be stuck`] : []),
            ...(highFailureEvents >= 5 ? [`${highFailureEvents} events have high failure count`] : [])
          ]
        }
      });
    } catch (error) {
      logger.err('Error checking event system health:', error);
      res.status(500).json({
        success: false,
        healthy: false,
        error: 'Health check failed'
      });
    }
  }
}

export default new EventMonitorController();
