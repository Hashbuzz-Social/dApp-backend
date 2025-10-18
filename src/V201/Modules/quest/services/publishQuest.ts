import createPrismaClient from '@shared/prisma';
import { campaignstatus } from '@prisma/client';
import { publishEvent } from '../../../eventPublisher';
import { CampaignEvents } from '../../../AppEvents/campaign';
import { generateRandomString } from '@V201/modules/common';

export interface PublishQuestInput {
  questId: bigint;
  userId: bigint;
}

export interface PublishQuestResult {
  questId: bigint;
  status: campaignstatus;
  publishedAt: Date;
}

/**
 * Publish a quest campaign
 * @throws Error if quest not found, not owned by user, or invalid status
 */
export async function publishQuest(
  input: PublishQuestInput
): Promise<PublishQuestResult> {
  const prisma = await createPrismaClient();

  // Fetch quest campaign
  const quest = await prisma.campaign_twittercard.findUnique({
    where: { id: input.questId },
    include: { user_user: true },
  });

  if (!quest) {
    throw new Error('Quest campaign not found');
  }

  if (quest.owner_id !== input.userId) {
    throw new Error('Unauthorized: You do not own this quest campaign');
  }

  // Check if quest is approved
  if (quest.card_status !== campaignstatus.CampaignApproved) {
    throw new Error(
      `Quest campaign must be approved before publishing. Current status: ${quest.card_status}`
    );
  }

  if (!quest.contract_id) {
    await prisma.campaign_twittercard.update({
      where: { id: quest.id },
      data: {
        contract_id: generateRandomString(20),
      },
    });
  }

  // Publish event to start quest campaign
  publishEvent(CampaignEvents.CAMPAIGN_PUBLISH_CONTENT, {
    card: quest,
    cardOwner: quest.user_user,
  });

  return {
    questId: quest.id,
    status: quest.card_status,
    publishedAt: new Date(),
  };
}
