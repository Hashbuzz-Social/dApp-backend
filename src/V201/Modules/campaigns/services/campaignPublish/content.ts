import { campaignstatus } from '@prisma/client';
import tweetService from '@services/twitterCard-service';
import { addMinutesToTime } from '@shared/helper';
import { CampaignEvents, CampaignSheduledEvents } from '@V201/events/campaign';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import { updateCampaignInMemoryStatus } from '@V201/modules/common';
import PrismaClientManager from '@V201/PrismaClient';
import { CampaignTypes, EventPayloadMap } from '@V201/types';
import appConfigManager from 'src/V201/appConfigManager';
import { publishEvent } from 'src/V201/eventPublisher';
import SchedulerQueue from 'src/V201/schedulerQueue';

export const publshCampaignContentHandler = async ({
  cardOwner,
  card,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_CONTENT]): Promise<void> => {
  const prisma = await PrismaClientManager.getInstance();
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
  const configs = await appConfigManager.getConfig();
  const prisma = await PrismaClientManager.getInstance();

  const campaignDurationInMin = configs.app.defaultCampaignDuratuon;

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

  // Schedule Closing Event for the campaign
  const scheduler = await SchedulerQueue.getInstance();

  await scheduler.addJob(CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION, {
    eventName: CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION,
    data: {
      cardId: updatedCard.id,
      userId: cardOwner.id,
      type: updatedCard.type as CampaignTypes,
      createdAt: currentTime,
      tweetId: updatedCard.tweet_id!,
    },
    executeAt: new Date(campaignCloseTime),
  });
};
