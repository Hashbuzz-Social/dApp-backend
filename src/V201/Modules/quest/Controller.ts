import { Request, Response } from 'express';
import logger from 'jet-logger';
import { draftQuest, publishQuest, getQuest, getAllQuests } from './services';

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
    req: Request,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = req.currentUser?.id;
      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      const {
        name,
        tweet_text,
        expected_engaged_users,
        campaign_budget,
        type,
        fungible_token_id,
        media,
      } = req.body;

      const result = await draftQuest({
        userId,
        name,
        tweet_text,
        expected_engaged_users,
        campaign_budget,
        type,
        fungible_token_id,
        media,
      });

      logger.info(`Quest drafted: ${result.questId}`);
      return res.created(result, 'Quest draft created successfully');
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to create quest draft');
      const errorDetails = error && typeof error === 'object' && 'errors' in error
        ? error.errors
        : undefined;
      return res.badRequest(errorMessage, errorDetails);
    }
  }

  async publishQuestCampaign(
    req: Request,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      const { questId } = req.params;

      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      const questIdNum = questId;
      const result = await publishQuest({
        questId: BigInt(questIdNum),
        userId,
      });
      logger.info(`Quest published: ${questIdNum}`);
      return res.success(result, 'Quest published successfully');
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to publish quest');
      return res.badRequest(errorMessage);
    }
  }

  async getQuestState(req: Request, res: Response): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      const { questId } = req.params;

      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      await Promise.resolve();
      return res.success({ questId }, 'Get quest state - to be implemented');
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to get quest state');
      return res.badRequest(errorMessage);
    }
  }

  async getQuestSubmissions(
    req: Request,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      const { questId } = req.params;

      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      await Promise.resolve();
      return res.success(
        { questId },
        'Get quest submissions - to be implemented'
      );
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to get quest submissions');
      return res.badRequest(errorMessage);
    }
  }

  async gradeQuestSubmissions(
    req: Request,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      const { questId } = req.params;

      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      await Promise.resolve();
      return res.success(
        { questId },
        'Grade quest submissions - to be implemented'
      );
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to grade quest submissions');
      return res.badRequest(errorMessage);
    }
  }

  async closeQuestCampaign(
    req: Request,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      const { questId } = req.params;

      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      await Promise.resolve();
      return res.success(
        { questId },
        'Close quest campaign - to be implemented'
      );
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to close quest campaign');
      return res.badRequest(errorMessage);
    }
  }

  async getAllQuestCampaigns(
    req: Request,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;

      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await getAllQuests({ userId, page, limit });

      return res.success(result, 'Quests retrieved successfully', {
        page,
        limit,
      });
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to get quests');
      return res.badRequest(errorMessage);
    }
  }

  async getQuestCampaignById(
    req: Request,
    res: Response
  ): Promise<Response | void> {
    try {
      const userId = res.locals.userId;
      const { questId } = req.params;

      if (!userId) {
        return res.unauthorized('User authentication required');
      }

      const result = await getQuest({ questId: BigInt(questId), userId });
      return res.success(result, 'Quest retrieved successfully');
    } catch (error: unknown) {
      logger.err(error);
      const errorMessage = getErrorMessage(error, 'Failed to get quest');

      // Handle not found scenario
      const hasNotFoundError = error && typeof error === 'object' &&
        ('code' in error && error.code === 'NOT_FOUND' ||
         errorMessage.toLowerCase().includes('not found'));

      if (hasNotFoundError) {
        return res.notFound(errorMessage, `Quest with ID: ${req.params.questId}`);
      }

      return res.badRequest(errorMessage);
    }
  }
}

export default new QuestController();
