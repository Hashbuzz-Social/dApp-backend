import createPrismaClient from '@shared/prisma';
import { campaignstatus } from '@prisma/client';

export interface GetQuestInput {
  questId: bigint;
  userId: bigint;
}

export interface QuestDetails {
  id: bigint;
  name: string | null;
  tweetText: string | null;
  type: string | null;
  status: campaignstatus;
  budget: number | null;
  amountSpent: number;
  media: string[];
  fungibleTokenId: string | null;
  campaignExpiry: Date | null;
  campaignStartTime: Date | null;
  ownerName: string | null;
}

/**
 * Get quest campaign details
 * @throws Error if quest not found or not owned by user
 */
export async function getQuest(input: GetQuestInput): Promise<QuestDetails> {
  const prisma = await createPrismaClient();

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

  return {
    id: quest.id,
    name: quest.name,
    tweetText: quest.tweet_text,
    type: quest.type,
    status: quest.card_status,
    budget: quest.campaign_budget,
    amountSpent: quest.amount_spent,
    media: quest.media,
    fungibleTokenId: quest.fungible_token_id,
    campaignExpiry: quest.campaign_expiry,
    campaignStartTime: quest.campaign_start_time,
    ownerName: quest.user_user.name,
  };
}
