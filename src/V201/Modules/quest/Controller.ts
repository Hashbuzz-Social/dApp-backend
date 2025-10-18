import { Request, Response } from 'express';
import logger from 'jet-logger';
import { draftQuest, publishQuest, getQuest, getAllQuests } from './services';
import {
  DraftQuestBody,
  PublishQuestBody,
  GradeQuestSubmissionsBody,
  CloseQuestBody,
  S3UploadedFile,
} from '../../MiddleWare/quest/validators';

/**
 * Helper function to safely extract error message
 */
const getErrorMessage = (error: unknown, defaultMessage: string): string => {
  if (error instanceof Error) {
    return error.message || defaultMessage;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message) || defaultMessage;
  }
  return defaultMessage;
};

class QuestController {
  async draftQuestCampaign(
    req: Request<Record<string, never>, Record<string, never>, DraftQuestBody>,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = req.currentUser?.id;
      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      // Body is already validated and typed by express-validator
      const {
        name,
        tweet_text,
        expected_engaged_users,
        campaign_budget,
        type,
        fungible_token_id,
        media,
        youtube_url,
        options,
        correct_answers,
      } = req.body;

      // Combine media files and youtube_url into single array
      const mediaArray: string[] = [];
      if (media && Array.isArray(media)) {
        mediaArray.push(
          ...media.map((m) => (typeof m === 'string' ? m : m.key))
        ); // Assuming media is string URLs after upload
      }
      if (youtube_url) {
        mediaArray.push(youtube_url);
      }

      const result = await draftQuest({
        userId,
        name,
        tweet_text,
        expected_engaged_users, // Already a number from validator
        campaign_budget, // Already a number from validator
        type,
        fungible_token_id,
        media: mediaArray,
        options,
        correct_answers,
      });

      logger.info(`Quest drafted: ${result.questId}`);
      return res.created(result, 'Quest draft created successfully');
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(
        error,
        'Failed to create quest draft'
      );
      const errorDetails =
        error && typeof error === 'object' && 'errors' in error
          ? error.errors
          : undefined;
      return res.badRequest(errorMessage, errorDetails);
    }
  }

  async publishQuestCampaign(
    req: Request<
      Record<string, never>,
      Record<string, never>,
      PublishQuestBody
    >,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = req.currentUser?.id;
      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      // Body is already validated and typed by express-validator
      const { questId } = req.body;

      const result = await publishQuest({
        questId: BigInt(questId), // Already validated as BigInt-compatible string
        userId,
      });

      logger.info(`Quest published: ${questId}`);
      return res.success(result, 'Quest published successfully');
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to publish quest');
      return res.badRequest(errorMessage);
    }
  }

  async getQuestState(
    req: Request<{ questId: string }>,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      // Param is already validated by express-validator
      const { questId } = req.params;

      // TODO: Implement quest state retrieval
      await Promise.resolve();
      return res.success({ questId }, 'Get quest state - to be implemented');
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to get quest state');
      return res.badRequest(errorMessage);
    }
  }

  async getQuestSubmissions(
    req: Request<{ questId: string }>,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      // Param is already validated by express-validator
      const { questId } = req.params;

      // TODO: Implement quest submissions retrieval
      await Promise.resolve();
      return res.success(
        { questId },
        'Get quest submissions - to be implemented'
      );
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(
        error,
        'Failed to get quest submissions'
      );
      return res.badRequest(errorMessage);
    }
  }

  async gradeQuestSubmissions(
    req: Request<
      { questId: string },
      Record<string, never>,
      GradeQuestSubmissionsBody
    >,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      // Param and body are already validated by express-validator
      const { questId } = req.params;
      const { submissions } = req.body;

      // Validate ownership and quest state
      // TODO: Implement grading logic
      logger.info(
        `Grading ${submissions.length} submissions for quest ${questId}`
      );

      await Promise.resolve();
      return res.success(
        {
          questId,
          processedCount: submissions.length,
          approvedCount: submissions.filter((s) => s.approved).length,
          rejectedCount: submissions.filter((s) => !s.approved).length,
        },
        'Grade quest submissions - to be implemented'
      );
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(
        error,
        'Failed to grade quest submissions'
      );
      return res.badRequest(errorMessage);
    }
  }

  async closeQuestCampaign(
    req: Request<{ questId: string }, Record<string, never>, CloseQuestBody>,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      // Param and body are already validated by express-validator
      const { questId } = req.params;
      const { reason, refundRemaining } = req.body;

      // TODO: Implement quest closing logic
      logger.info(
        `Closing quest ${questId}. Reason: ${
          reason || 'Not provided'
        }. Refund: ${String(refundRemaining || false)}`
      );

      await Promise.resolve();
      return res.success(
        {
          questId,
          reason: reason || null,
          refundRemaining: refundRemaining || false,
        },
        'Close quest campaign - to be implemented'
      );
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(
        error,
        'Failed to close quest campaign'
      );
      return res.badRequest(errorMessage);
    }
  }

  async getAllQuestCampaigns(
    req: Request<
      Record<string, never>,
      Record<string, never>,
      Record<string, never>,
      { page?: string; limit?: string }
    >,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      // Parse and validate query parameters
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);

      // Validate parsed values
      const validPage = !isNaN(page) && page > 0 ? page : 1;
      const validLimit =
        !isNaN(limit) && limit > 0 && limit <= 100 ? limit : 10;

      const result = await getAllQuests({
        userId,
        page: validPage,
        limit: validLimit,
      });

      return res.success(result, 'Quests retrieved successfully', {
        page: validPage,
        limit: validLimit,
      });
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to get quests');
      return res.badRequest(errorMessage);
    }
  }

  async getQuestCampaignById(
    req: Request<{ questId: string }>,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      // Param is already validated by express-validator
      const { questId } = req.params;

      const result = await getQuest({
        questId: BigInt(questId), // Already validated as BigInt-compatible string
        userId,
      });

      return res.success(result, 'Quest retrieved successfully');
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to get quest');

      // Handle not found scenario
      const hasNotFoundError =
        error &&
        typeof error === 'object' &&
        (('code' in error && error.code === 'NOT_FOUND') ||
          errorMessage.toLowerCase().includes('not found'));

      if (hasNotFoundError) {
        return res.notFound(
          errorMessage,
          `Quest with ID: ${req.params.questId}`
        );
      }

      return res.badRequest(errorMessage);
    }
  }
}

export default new QuestController();
