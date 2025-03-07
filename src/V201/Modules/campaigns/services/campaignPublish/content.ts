import tweetService from '@services/twitterCard-service';
import { CampaignEvents } from '@V201/events/campaign';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import { logCampaignStatus } from '@V201/modules/common';
import PrismaClientManager from '@V201/PrismaClient';
import { EventPayloadMap } from '@V201/types';
import { publishEvent } from 'src/V201/eventPublisher';

export const publshCampaignContentHandler = async ({
  cardOwner,
  card,
}: EventPayloadMap[CampaignEvents.CAMPAIGN_PUBLISH_CONTENT]): Promise<void> => {
  const prisma = await PrismaClientManager.getInstance();
  const tweetId = await tweetService.publistFirstTweet(card, cardOwner);
  await logCampaignStatus(card.contract_id!, 'firstTweetOut', true);
  const updatedCard = await new CampaignTwitterCardModel(prisma).updateCampaign(
    card.id,
    {
      tweet_id: tweetId,
    }
  );
  publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_CONTENT, {
    cardOwner,
    card: updatedCard,
  });
};