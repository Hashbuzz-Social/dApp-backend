import { Request, Response } from 'express';
import { EnhancedEventSystem } from '../../enhancedEventSystem';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';

/**
 * Basic event monitoring controller
 * Compatible with current schema - enhanced features require schema updates
 */
export class EventMonitorController {
  /**
   * Get basic event system statistics
   */
  async getEventStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await EnhancedEventSystem.getEventStats();

      const prisma = await createPrismaClient();

      // Get basic stats that work with current schema
      const totalEvents = await prisma.eventOutBox.count();

      const eventsByType = await prisma.eventOutBox.groupBy({
        by: ['event_type'],
        _count: {
          id: true
        },
        orderBy: {
          event_type: 'asc'
        }
      });

      const recentEvents = await prisma.eventOutBox.findMany({
        where: {
          created_at: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        select: {
          id: true,
          event_type: true,
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
          totalEvents,
          eventsByType,
          recentEvents
        }
      });
    } catch (error) {
      logger.err(`Error getting event stats: ${error instanceof Error ? error.message : String(error)}`);
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
          reprocessedCount: Number(reprocessedCount),
          message: `Successfully reprocessed ${Number(reprocessedCount)} dead letter events`
        }
      });
    } catch (error) {
      logger.err(`Error reprocessing dead letter events: ${error instanceof Error ? error.message : String(error)}`);
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
      logger.err(`Error getting dead letter events: ${error instanceof Error ? error.message : String(error)}`);
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
          created_at: true
        },
        orderBy: {
          created_at: 'desc'
        },
        take: 100
      });

      const activitySummary = await prisma.eventOutBox.groupBy({
        by: ['event_type'],
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
      logger.err(`Error getting event activity: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        success: false,
        error: 'Failed to get event activity'
      });
    }
  }

  /**
   * Basic health check for event system
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const prisma = await createPrismaClient();

      // Check if there are too many events in queue (potential backlog)
      const pendingEvents = await prisma.eventOutBox.count({
        where: {
          created_at: {
            lt: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
          }
        }
      });

      const deadLetterCount = await prisma.eventOutBox.count({
        where: {
          event_type: {
            startsWith: 'DEAD_LETTER_'
          }
        }
      });

      const isHealthy = pendingEvents < 50 && deadLetterCount < 10;

      res.status(isHealthy ? 200 : 503).json({
        success: true,
        healthy: isHealthy,
        data: {
          pendingEvents,
          deadLetterCount,
          alerts: [
            ...(pendingEvents >= 50 ? [`${pendingEvents} events appear to be stuck in queue`] : []),
            ...(deadLetterCount >= 10 ? [`${deadLetterCount} events in dead letter queue`] : [])
          ]
        }
      });
    } catch (error) {
      logger.err(`Error checking event system health: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({
        success: false,
        healthy: false,
        error: 'Health check failed'
      });
    }
  }
}

export default new EventMonitorController();
