import { getConfig } from '@appConfig';
import { campaignstatus } from '@prisma/client';
import tweetService from '@services/twitterCard-service';
import { addMinutesToTime } from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import { CampaignEvents, CampaignSheduledEvents } from '@V201/events/campaign';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import { updateCampaignInMemoryStatus } from '@V201/modules/common';
import { CampaignTypes, EventPayloadMap } from '@V201/types';
import { publishEvent } from 'src/V201/eventPublisher';
import SchedulerQueue from 'src/V201/schedulerQueue';

export const publshCampaignContentHandler = async ({
  cardOwner,
  card,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_CONTENT]): Promise<void> => {
  const prisma = await createPrismaClient();
  const tweetId = await tweetService.publistFirstTweet(card, cardOwner);
  await updateCampaignInMemoryStatus(card.contract_id!, 'firstTweetOut', true);
  const updatedCard = await new CampaignTwitterCardModel(prisma).updateCampaign(
    card.id,
    {
      tweet_id: tweetId,
    }
  );
  publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_DO_SM_TRANSACTION, {
    cardOwner,
    card: updatedCard,
  });
};

export const publishCampaignSecondContent = async ({
  card,
  cardOwner,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_SECOND_CONTENT]): Promise<void> => {
  if (!card.tweet_id) {
    throw new Error('First tweet not published');
  }
  const currentTime = new Date();
  const configs = await getConfig();
  const prisma = await createPrismaClient();

  const campaignDurationInMin = configs.app.defaultCampaignDuration;

  // publish second tweet
  const lastTweetThreadId = await tweetService.publishSecondThread(
    card,
    cardOwner,
    card.tweet_id
  );

  // update campaign status
  await updateCampaignInMemoryStatus(card.contract_id!, 'secondTweetOut', true);

  const campaignCloseTime = addMinutesToTime(
    currentTime.toISOString(),
    campaignDurationInMin
  );

  // update campaign status in db
  const updatedCard = await new CampaignTwitterCardModel(prisma).updateCampaign(
    card.id,
    {
      card_status: campaignstatus.CampaignRunning,
      last_thread_tweet_id: lastTweetThreadId,
      campaign_start_time: currentTime.toISOString(),
      campaign_close_time: campaignCloseTime,
    }
  );

  // Schedule Closing Event for the campaign with retry policies
  const scheduler = await SchedulerQueue.getInstance();

  await scheduler.addJob(
    CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION,
    {
      eventName: CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION,
      data: {
        cardId: updatedCard.id,
        userId: cardOwner.id,
        type: updatedCard.type as CampaignTypes,
        createdAt: currentTime,
        tweetId: updatedCard.tweet_id!,
      },
      executeAt: new Date(campaignCloseTime),
    },
    {
      // Job persistence and retry configuration to prevent job loss
      attempts: 5, // Retry up to 5 times if job fails
      backoff: {
        type: 'exponential',
        delay: 30000, // Start with 30 second delay, exponentially increase
      },
      removeOnComplete: 10, // Keep only last 10 completed jobs for debugging
      removeOnFail: 50, // Keep last 50 failed jobs for analysis
      jobId: `campaign-close-${updatedCard.id}-${Date.now()}`, // Unique job ID to prevent duplicates
    }
  );
};
