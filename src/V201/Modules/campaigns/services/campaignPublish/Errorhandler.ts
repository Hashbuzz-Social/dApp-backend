
import { CampaignEvents } from '@V201/events/campaign';
import { EventPayloadMap } from '@V201/types';
import logger from 'jet-logger';
import createPrismaClient from '@shared/prisma';

// handler error for the campaign publish
export const publshCampaignErrorHandler = async ({
  error,
  campaignMeta,
  atStage,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_ERROR]): Promise<void> => {
  const prisma = await createPrismaClient();

  // Fetch fresh campaign data if available
  let freshCampaignData = null;
  if (campaignMeta.campaignId) {
    freshCampaignData = await prisma.campaign_twittercard.findUnique({
      where: { id: campaignMeta.campaignId },
    });
  }

  logger.err(
    `Error in campaign publish event at stage ${atStage}:${error.message} | ` +
      JSON.stringify({
        campaignId: campaignMeta.campaignId,
        userId: campaignMeta.userId,
        campaignStatus: freshCampaignData?.card_status,
        error: error.message,
        stack: error.stack,
      })
  );

  // TODO: Implement error recovery logic based on stage and fresh data
  // - Mark campaign as failed in database if needed
  // - Send notification to user
  // - Schedule retry for recoverable errors
  // - Update campaign status appropriately
};
