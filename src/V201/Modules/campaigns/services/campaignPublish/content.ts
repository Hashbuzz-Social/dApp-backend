import { getConfig } from '@appConfig';
import { campaignstatus } from '@prisma/client';
import tweetService from '@services/twitterCard-service';
import { addMinutesToTime } from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import { CampaignEvents, CampaignSheduledEvents } from '@V201/events/campaign';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import { updateCampaignInMemoryStatus } from '@V201/modules/common';
import { CampaignTypes, EventPayloadMap } from '@V201/types';
import { publishEvent } from '../../../../eventPublisher';
import SchedulerQueue from '../../../../schedulerQueue';
import XEngagementTracker from '../xEngagementTracker';
import logger from 'jet-logger';

export const publshCampaignContentHandler = async ({
  cardOwner,
  card,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_CONTENT]): Promise<void> => {
  const prisma = await createPrismaClient();

  // Fetch fresh data from database
  const freshCard = await prisma.campaign_twittercard.findUnique({
    where: { id: card.id },
  });
  const freshCardOwner = await prisma.user_user.findUnique({
    where: { id: cardOwner.id },
  });

  if (!freshCard) {
    throw new Error('Campaign card not found');
  }
  if (!freshCardOwner) {
    throw new Error('Card owner not found');
  }

  const tweetId = await tweetService.publistFirstTweet(
    freshCard,
    freshCardOwner
  );
  if (freshCard.contract_id) {
    await updateCampaignInMemoryStatus(
      freshCard.contract_id,
      'firstTweetOut',
      true
    );
  }
  const updatedCard = await new CampaignTwitterCardModel(prisma).updateCampaign(
    freshCard.id,
    {
      tweet_id: tweetId,
    }
  );
  publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION, {
    cardOwner: freshCardOwner,
    card: updatedCard,
  });
};

export const publishCampaignSecondContent = async ({
  card,
  cardOwner,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT]): Promise<void> => {
  const prisma = await createPrismaClient();

  // Fetch fresh data from database
  const freshCard = await prisma.campaign_twittercard.findUnique({
    where: { id: card.id },
  });
  const freshCardOwner = await prisma.user_user.findUnique({
    where: { id: cardOwner.id },
  });

  if (!freshCard) {
    throw new Error('Campaign card not found');
  }
  if (!freshCardOwner) {
    throw new Error('Card owner not found');
  }

  if (!freshCard.tweet_id) {
    throw new Error('First tweet not published');
  }
  const currentTime = new Date();
  const configs = await getConfig();

  const campaignDurationInMin = configs.app.defaultCampaignDuration;

  // publish second tweet
  const lastTweetThreadId = await tweetService.publishSecondThread(
    freshCard,
    freshCardOwner,
    freshCard.tweet_id
  );

  // update campaign status
  if (freshCard.contract_id) {
    await updateCampaignInMemoryStatus(
      freshCard.contract_id,
      'secondTweetOut',
      true
    );
  }

  const campaignCloseTime = addMinutesToTime(
    currentTime.toISOString(),
    campaignDurationInMin
  );

  // update campaign status in db
  const updatedCard = await new CampaignTwitterCardModel(prisma).updateCampaign(
    freshCard.id,
    {
      card_status: campaignstatus.CampaignRunning,
      last_thread_tweet_id: lastTweetThreadId,
      campaign_start_time: currentTime.toISOString(),
      campaign_close_time: campaignCloseTime,
    }
  );

  // Schedule Closing Event for the campaign with retry policies
  const scheduler = await SchedulerQueue.getInstance();

  await scheduler.addJob(CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION, {
    eventName: CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION,
    data: {
      cardId: updatedCard.id,
      userId: freshCardOwner.id,
      type: updatedCard.type as CampaignTypes,
      createdAt: currentTime,
      tweetId: updatedCard.tweet_id || '',
    },
    executeAt: new Date(campaignCloseTime),
  });

  // Start engagement tracking for the published campaign
  try {
    const engagementTracker = new XEngagementTracker();
    const durationHours = campaignDurationInMin / 60; // Convert minutes to hours

    if (updatedCard.tweet_id) {
      await engagementTracker.startCampaignTracking(
        updatedCard.id,
        updatedCard.tweet_id,
        BigInt(cardOwner.id),
        durationHours
      );

      logger.info(`Started engagement tracking for campaign ${updatedCard.id}`);
    } else {
      logger.warn(
        `No tweet_id found for campaign ${updatedCard.id}, skipping engagement tracking`
      );
    }
  } catch (engagementError) {
    const errorMsg =
      engagementError instanceof Error
        ? engagementError.message
        : String(engagementError);
    logger.err(
      `Failed to start engagement tracking for campaign ${updatedCard.id}: ${errorMsg}`
    );
    // Don't fail the campaign publishing if engagement tracking fails
  }
};
