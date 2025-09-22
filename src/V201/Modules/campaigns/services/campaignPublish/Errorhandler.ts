
import { CampaignEvents } from '@V201/events/campaign';
import { EventPayloadMap } from '@V201/types';
import logger from 'jet-logger';
import createPrismaClient from '@shared/prisma';
import { campaignstatus } from '@prisma/client';
import CampaignLogsModel from '@V201/Modals/CampaignLogs';
import { updateCampaignInMemoryStatus } from '@V201/modules/common';

// handler error for the campaign publish
export const publshCampaignErrorHandler = async ({
  campaignMeta,
  atStage,
  message,
  error,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_ERROR]): Promise<void> => {
  const prisma = await createPrismaClient();

  // Fetch fresh campaign data from DB
  const campaign = await prisma.campaign_twittercard.findUnique({
    where: { id: campaignMeta.campaignId },
  });

  const user = await prisma.user_user.findUnique({
    where: { id: campaignMeta.userId },
  });

  if (!campaign) {
    logger.err(
      `Campaign ${campaignMeta.campaignId} not found in error handler`
    );
    return;
  }

  if (!user) {
    logger.err(`User ${campaignMeta.userId} not found in error handler`);
    return;
  }

  const errorContext = {
    campaignId: campaign.id,
    userId: user.id,
    campaignStatus: campaign.card_status,
    stage: atStage,
    error: message,
    timestamp: new Date().toISOString(),
  };

  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.err(
    `Error in campaign publish event at stage ${atStage}:${errorMessage} | ${JSON.stringify(
      errorContext
    )}`
  );

  // Log the error for debugging
  await new CampaignLogsModel(prisma).createLog({
    campaign: { connect: { id: campaign.id } },
    status: campaignstatus.InternalError,
    message: `Campaign publish error at stage ${atStage}: ${message}`,
    data: { message, error: errorMessage, stage: atStage },
  });

  // Update campaign status to failed if it's a critical failure
  const criticalFailures = [
    'handleSmartContractTransaction',
    'Failed to add campaign to contract',
    'TWITTER_RATE_LIMITED',
    'TWITTER_AUTH_EXPIRED',
    'TWITTER_FORBIDDEN',
  ];

  const isCriticalFailure = criticalFailures.some(
    (failure) => atStage?.includes(failure) || message?.includes(failure)
  );

  if (
    isCriticalFailure &&
    campaign.card_status === campaignstatus.CampaignRunning
  ) {
    logger.warn(
      `Marking campaign ${campaign.id} as failed due to critical error: ${message}`
    );

    await prisma.campaign_twittercard.update({
      where: { id: campaign.id },
      data: {
        card_status: campaignstatus.InternalError,
        // Mark the campaign as inactive since it failed
        is_added_to_queue: false,
      },
    });

    // TODO: Implement user notification and refund logic here
    logger.info(
      `Campaign ${campaign.id} marked as failed. User notification and refund required.`
    );

    // Update in-memory status cache
    updateCampaignInMemoryStatus(
      campaign.id.toString(),
      campaignstatus.InternalError
    );
  }
};
