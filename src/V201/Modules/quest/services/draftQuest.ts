import createPrismaClient from '@shared/prisma';
import { campaign_type, campaignstatus } from '@prisma/client';
import { generateRandomString } from '@V201/modules/common';

export interface DraftQuestInput {
  userId: bigint;
  name: string;
  tweet_text: string;
  expected_engaged_users: number;
  campaign_budget: number;
  type: 'HBAR' | 'FUNGIBLE';
  fungible_token_id?: string;
  media: string[];
  options?: string[]; // Optional - database doesn't have schema for quest options yet
  correct_answers?: string; // Optional - database doesn't have schema for quest answers yet
}

export interface DraftQuestResult {
  questId: bigint;
  campaignStatus: campaignstatus;
}

/**
 * Draft a new quest campaign
 * @throws Error if validation fails or database operation fails
 */
export async function draftQuest(
  input: DraftQuestInput
): Promise<DraftQuestResult> {
  const prisma = await createPrismaClient();

  // Validate required fields
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('Campaign name is required');
  }

  if (!input.tweet_text || input.tweet_text.trim().length === 0) {
    throw new Error('Tweet text is required');
  }

  if (input.expected_engaged_users <= 0) {
    throw new Error('Expected engaged users must be greater than 0');
  }

  if (input.campaign_budget <= 0) {
    throw new Error('Campaign budget must be greater than 0');
  }

  if (input.type === 'FUNGIBLE' && !input.fungible_token_id) {
    throw new Error('Fungible token ID is required for FUNGIBLE campaigns');
  }

  if (input.type === 'FUNGIBLE' && !input.fungible_token_id) {
    throw new Error('Fungible token ID is required for FUNGIBLE campaigns');
  }

  if (input.type === 'FUNGIBLE' && input.fungible_token_id) {
    const tokenDetails = await prisma.whiteListedTokens.findUnique({
      where: { token_id: input.fungible_token_id },
    });
    const decimals = Number(tokenDetails?.decimals);
    if (decimals > 0) {
      input.campaign_budget = input.campaign_budget * Math.pow(10, decimals);
    }
  } else {
    input.campaign_budget = input.campaign_budget * 1e8;
  }

  // Create quest campaign draft
  const quest = await prisma.campaign_twittercard.create({
    data: {
      name: input.name.trim(),
      tweet_text: input.tweet_text.trim(),
      type: input.type,
      card_status: campaignstatus.ApprovalPending,
      owner_id: input.userId,
      campaign_budget: input.campaign_budget,
      fungible_token_id: input.fungible_token_id || null,
      media: input.media,
      amount_spent: 0,
      question_options: input.options || [],
      correct_answer: input.correct_answers || null,
      campaign_type: campaign_type.quest,
      approve: false,
      contract_id: generateRandomString(20),
    },
  });

  return {
    questId: quest.id,
    campaignStatus: quest.card_status,
  };
}
