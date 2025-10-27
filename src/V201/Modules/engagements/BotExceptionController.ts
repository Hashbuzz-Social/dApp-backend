import { Request, Response } from 'express';
import { BotDetectionExceptionService } from './botDetection';
import logger from 'jet-logger';

/**
 * Controller for managing bot detection exceptions
 */
export class BotExceptionController {
  /**
   * POST /api/v2/bot-exceptions
   * Add a user to the bot detection exception list
   */
  async addException(
    req: Request<
      Record<string, never>,
      Record<string, never>,
      {
        twitter_user_id: string;
        twitter_username?: string;
        reason: string;
        notes?: string;
      }
    >,
    res: Response
  ): Promise<Response | void> {
    try {
      const { twitter_user_id, twitter_username, reason, notes } = req.body;
      const adminId = req.currentUser?.id || null;

      if (!twitter_user_id || !reason) {
        return res.badRequest('Twitter user ID and reason are required');
      }

      const success = await BotDetectionExceptionService.addException(
        twitter_user_id,
        twitter_username || null,
        reason,
        adminId ? BigInt(adminId) : null,
        notes || null
      );

      if (success) {
        return res.created(
          { twitter_user_id, reason },
          'Bot detection exception added successfully'
        );
      } else {
        return res.badRequest('Failed to add bot detection exception');
      }
    } catch (error) {
      logger.err(`Error in addException controller: ${error instanceof Error ? error.message : String(error)}`);
      return res.badRequest('Failed to add bot detection exception');
    }
  }

  /**
   * DELETE /api/v2/bot-exceptions/:twitterUserId
   * Remove a user from the bot detection exception list
   */
  async removeException(
    req: Request<{ twitterUserId: string }>,
    res: Response
  ): Promise<Response | void> {
    try {
      const { twitterUserId } = req.params;

      if (!twitterUserId) {
        return res.badRequest('Twitter user ID is required');
      }

      const success = await BotDetectionExceptionService.removeException(twitterUserId);

      if (success) {
        return res.success(
          { twitterUserId },
          'Bot detection exception removed successfully'
        );
      } else {
        return res.badRequest('Failed to remove bot detection exception');
      }
    } catch (error) {
      logger.err(`Error in removeException controller: ${error instanceof Error ? error.message : String(error)}`);
      return res.badRequest('Failed to remove bot detection exception');
    }
  }

  /**
   * GET /api/v2/bot-exceptions
   * Get all active bot detection exceptions
   */
  async getExceptions(req: Request, res: Response): Promise<Response | void> {
    try {
      const exceptions = await BotDetectionExceptionService.getActiveExceptions();

      return res.success(
        {
          exceptions,
          count: exceptions.length,
        },
        'Bot detection exceptions retrieved successfully'
      );
    } catch (error) {
      logger.err(`Error in getExceptions controller: ${error instanceof Error ? error.message : String(error)}`);
      return res.badRequest('Failed to retrieve bot detection exceptions');
    }
  }

  /**
   * GET /api/v2/bot-exceptions/check/:twitterUserId
   * Check if a user is in the exception list
   */
  async checkException(
    req: Request<{ twitterUserId: string }>,
    res: Response
  ): Promise<Response | void> {
    try {
      const { twitterUserId } = req.params;

      if (!twitterUserId) {
        return res.badRequest('Twitter user ID is required');
      }

      const isExcepted = await BotDetectionExceptionService.isUserExcepted(twitterUserId);

      return res.success(
        {
          twitterUserId,
          isExcepted,
        },
        isExcepted
          ? 'User is in bot detection exception list'
          : 'User is not in bot detection exception list'
      );
    } catch (error) {
      logger.err(`Error in checkException controller: ${error instanceof Error ? error.message : String(error)}`);
      return res.badRequest('Failed to check bot detection exception');
    }
  }
}

export default new BotExceptionController();
