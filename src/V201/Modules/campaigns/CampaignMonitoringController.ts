import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import { Request, Response } from 'express';

/**
 * Campaign Monitoring Controller
 * Provides comprehensive campaign status, event tracking, and revival capabilities
 */
class CampaignMonitoringController {
  /**
   * GET /api/v2/campaigns/:id/monitor
   * Get comprehensive campaign monitoring report
   */
  async getCampaignStatus(
    req: Request<{ id: string }>,
    res: Response
  ): Promise<Response | void> {
    try {
      const campaignId = BigInt(req.params.id);
      const prisma = await createPrismaClient();

      const campaign = await prisma.campaign_twittercard.findUnique({
        where: { id: campaignId },
        include: { user_user: true },
      });

      if (!campaign) {
        return res.notFound('Campaign not found', req.params.id);
      }

      // Get campaign logs
      const logs = await prisma.campaignLog.findMany({
        where: { campaign_id: campaignId },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });

      // Get pending events
      const pendingEvents = await prisma.eventOutBox.findMany({
        where: {
          payload: {
            string_contains: `"campaignId":"${campaignId}"`,
          },
          NOT: {
            event_type: {
              startsWith: 'DEAD_LETTER_',
            },
          },
        },
      });

      // Get dead letter events
      const deadLetterEvents = await prisma.eventOutBox.findMany({
        where: {
          event_type: {
            startsWith: 'DEAD_LETTER_',
          },
          payload: {
            string_contains: `"campaignId":"${campaignId}"`,
          },
        },
      });

      const report = {
        campaign: {
          id: campaign.id.toString(),
          name: campaign.name,
          status: campaign.card_status,
          type: campaign.type,
          budget: campaign.campaign_budget,
          spent: campaign.amount_spent,
          contractId: campaign.contract_id,
          tweetId: campaign.tweet_id,
        },
        logs: logs.map((log) => ({
          timestamp: log.timestamp,
          status: log.status,
          message: log.message,
          data: log.data,
        })),
        pendingEvents: pendingEvents.map((e) => ({
          id: e.id.toString(),
          eventType: e.event_type,
          createdAt: e.created_at,
        })),
        deadLetterEvents: deadLetterEvents.map((e) => ({
          id: e.id.toString(),
          eventType: e.event_type,
          createdAt: e.created_at,
        })),
        health: {
          hasErrors: deadLetterEvents.length > 0,
          hasPendingEvents: pendingEvents.length > 0,
          canResume: deadLetterEvents.length > 0,
        },
      };

      return res.success(report, 'Campaign status retrieved');
    } catch (error) {
      logger.err(error);
      const message = error instanceof Error ? error.message : 'Failed to get campaign status';
      return res.badRequest(message);
    }
  }

  /**
   * POST /api/v2/campaigns/:id/resume
   * Resume/retry campaign from last failed step
   */
  async resumeCampaign(
    req: Request<{ id: string }>,
    res: Response
  ): Promise<Response | void> {
    try {
      const campaignId = BigInt(req.params.id);
      const prisma = await createPrismaClient();

      const deadLetterEvents = await prisma.eventOutBox.findMany({
        where: {
          event_type: {
            startsWith: 'DEAD_LETTER_',
          },
          payload: {
            string_contains: `"campaignId":"${campaignId}"`,
          },
        },
      });

      if (deadLetterEvents.length === 0) {
        return res.badRequest('No failed events to resume');
      }

      const retriedEvents: string[] = [];
      const errors: string[] = [];

      // Import here to avoid circular dependencies
      const { publishEvent } = await import('../../../V201/eventPublisher');

      for (const event of deadLetterEvents) {
        try {
          const payload = JSON.parse(event.payload as string) as Record<string, unknown>;
          const originalEventType = String(payload.originalEventType);
          const originalPayload = payload.originalPayload as Record<string, unknown>;

          // Republish
          await publishEvent(originalEventType as any, originalPayload as any, {
            useEnhanced: true,
            maxRetries: 3,
            priority: 'high',
          });

          // Delete from dead letter queue
          await prisma.eventOutBox.delete({
            where: { id: event.id },
          });

          retriedEvents.push(originalEventType);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }

      return res.success(
        {
          retriedCount: retriedEvents.length,
          retriedEvents,
          failedCount: errors.length,
          errors,
        },
        `Resumed campaign: ${retriedEvents.length} events retried`
      );
    } catch (error) {
      logger.err(error);
      const message = error instanceof Error ? error.message : 'Failed to resume campaign';
      return res.badRequest(message);
    }
  }

  /**
   * POST /api/v2/campaigns/events/:eventId/retry
   * Retry specific event by ID
   */
  async retryEvent(
    req: Request<{ eventId: string }>,
    res: Response
  ): Promise<Response | void> {
    try {
      const eventId = BigInt(req.params.eventId);
      const prisma = await createPrismaClient();

      const event = await prisma.eventOutBox.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return res.notFound('Event not found', req.params.eventId);
      }

      if (!event.event_type.startsWith('DEAD_LETTER_')) {
        return res.badRequest('Event is not a dead letter event');
      }

      const payload = JSON.parse(event.payload as string) as Record<string, unknown>;
      const originalEventType = String(payload.originalEventType);
      const originalPayload = payload.originalPayload as Record<string, unknown>;

      const { publishEvent } = await import('../../../V201/eventPublisher');

      await publishEvent(originalEventType as any, originalPayload as any, {
        useEnhanced: true,
        maxRetries: 3,
      });

      await prisma.eventOutBox.delete({
        where: { id: eventId },
      });

      return res.success(
        { eventId: event.id.toString(), eventType: originalEventType },
        'Event successfully retried'
      );
    } catch (error) {
      logger.err(error);
      const message = error instanceof Error ? error.message : 'Failed to retry event';
      return res.badRequest(message);
    }
  }
}

export default new CampaignMonitoringController();
