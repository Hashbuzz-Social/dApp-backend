import createPrismaClient from '@shared/prisma';

export interface GetAllQuestsInput {
  userId: bigint;
  page: number;
  limit: number;
}

export interface QuestListItem {
  id: bigint;
  name: string | null;
  status: string;
  budget: number | null;
  type: string | null;
  createdAt: Date | null;
}

export interface GetAllQuestsResult {
  quests: QuestListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Get all quest campaigns for a user
 * @throws Error if invalid pagination parameters
 */
export async function getAllQuests(input: GetAllQuestsInput): Promise<GetAllQuestsResult> {
  const prisma = await createPrismaClient();

  if (input.page < 1) {
    throw new Error('Page must be greater than 0');
  }

  if (input.limit < 1 || input.limit > 100) {
    throw new Error('Limit must be between 1 and 100');
  }

  const skip = (input.page - 1) * input.limit;

  const [quests, total] = await Promise.all([
    prisma.campaign_twittercard.findMany({
      where: { owner_id: input.userId },
      select: {
        id: true,
        name: true,
        card_status: true,
        campaign_budget: true,
        type: true,
        campaign_start_time: true,
      },
      orderBy: { id: 'desc' },
      skip,
      take: input.limit,
    }),
    prisma.campaign_twittercard.count({
      where: { owner_id: input.userId },
    }),
  ]);

  return {
    quests: quests.map(q => ({
      id: q.id,
      name: q.name,
      status: q.card_status,
      budget: q.campaign_budget,
      type: q.type,
      createdAt: q.campaign_start_time,
    })),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit),
    },
  };
}
