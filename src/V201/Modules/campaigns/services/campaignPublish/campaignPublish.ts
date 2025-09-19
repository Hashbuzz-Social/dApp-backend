import {
  campaignstatus
} from '@prisma/client';
import { CampaignEvents } from '@V201/events/campaign';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import logger from 'jet-logger';
import { hcsEventPublisher } from '../../../../hcsEventPublisher';
import { isCampaignValidForMakeRunning } from './validation';
import createPrismaClient from '@shared/prisma';

/**
 * Starts the process of publishing a campaign.
 * @param campaignId - The ID of the campaign to publish.
 * @param userId - The ID of the user who owns the campaign.
 * @returns A promise that resolves when the campaign is published.
 * @throws An error if the campaign is invalid for publishing.
 */

export const startPublishingCampaign = async (
  campaignId: number,
  userId: number | bigint
): Promise<void> => {
  try {
    const prisma = await createPrismaClient();

    const card = await new CampaignTwitterCardModel(
      prisma
    ).getCampaignsWithOwnerData(campaignId);
    const cardOwner = card?.user_user;

    if (!card || !cardOwner) {
      throw new Error('Could not fetch campaign by tweet ID.');
    }

    if (cardOwner.id !== userId) {
      throw new Error('User is not authorized to publish this campaign.');
    }

    const isValidToMakeRunning = await isCampaignValidForMakeRunning(
      card,
      campaignstatus.CampaignRunning
    );

    if (!isValidToMakeRunning.isValid) {
      throw new Error(isValidToMakeRunning.message);
    }

    logger.info('Campaign is valid for publishing');

    // Initialize HCS publisher
    await hcsEventPublisher.init();

    // Emit event to perform SM transaction (with HCS audit trail)
    const eventResult = await hcsEventPublisher.publishCampaignEvent(
      CampaignEvents.CAMPAIGN_PUBLISH_CONTENT,
      {
        cardOwner,
        card,
      }
    );

    if (eventResult.hcsTransactionId) {
      logger.info(
        `Campaign publish event logged to HCS: ${eventResult.hcsTransactionId}`
      );
    }
  } catch (error) {
    // Log error to HCS for audit trail
    await hcsEventPublisher.init();
    await hcsEventPublisher.publishCampaignEvent(
      CampaignEvents.CAMPAIGN_PUBLISH_ERROR,
      {
        campaignMeta: { campaignId, userId },
        atStage: 'startPublishingCampaign',
        message: error.message,
        error,
      }
    );

    logger.err(
      'Error in startPublishingCampaign: ' +
        (error instanceof Error ? error.message : String(error))
    );
    throw error;
  }
};
