import createPrismaClient from '@shared/prisma';
import { payment_status, PrismaClient } from '@prisma/client';
import logger from 'jet-logger';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import { publishEvent } from 'src/V201/eventPublisher';
import { CampaignEvents } from '@V201/events/campaign';

/**
 * Result interface for eligible quest winners
 */
export interface EligibleWinnersResult {
  questId: bigint;
  totalResponses: number;
  correctResponses: number;
  duplicateEntries: number;
  botEngagements: number;
  eligibleWinners: number;
  suspendedEngagements: number;
  rewardPerWinner: number;
  processedAt: Date;
}

interface EngagementCategorizationResult {
  eligibleEngagementIds: bigint[];
  suspendedEngagementIds: bigint[];
  correctResponseCount: number;
  botEngagementCount: number;
}

/**
 * Service class to find and process eligible quest winners
 * Handles answer validation, duplicate detection, and bot filtering
 */
export class QuestWinnerService {
  private prisma: PrismaClient | null = null;
  private ownsPrisma = false;
  private campaignModel: CampaignTwitterCardModel | null = null;

  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      this.prisma = prismaClient;
    }
  }

  /**
   * Initialize Prisma client and campaign model
   */
  private async initializeServices(): Promise<void> {
    if (!this.prisma) {
      this.prisma = await createPrismaClient();
      this.ownsPrisma = true;
    }

    if (!this.campaignModel) {
      this.campaignModel = new CampaignTwitterCardModel(this.prisma);
    }
  }

  /**
   * Validate quest campaign has required data
   */
  private validateQuestCampaign(quest: any, questId: bigint): void {
    if (!quest) {
      throw new Error(`Quest campaign ${questId} not found`);
    }

    if (!quest.correct_answer) {
      throw new Error(`Quest campaign ${questId} has no correct answer set`);
    }
  }

  /**
   * Group engagements by user to detect duplicate entries
   */
  private groupEngagementsByUser(engagements: any[]): Map<string, bigint[]> {
    const userEngagementMap = new Map<string, bigint[]>();

    for (const engagement of engagements) {
      const userId = String(engagement.user_id || '');
      const engagementId = BigInt(String(engagement.id));

      // Skip engagements without user_id
      if (!userId) {
        logger.warn(
          `[QuestWinnerService] Engagement ${String(
            engagementId
          )} has no user_id - skipping`
        );
        continue;
      }

      if (!userEngagementMap.has(userId)) {
        userEngagementMap.set(userId, []);
      }
      const userEngagements = userEngagementMap.get(userId);
      if (userEngagements) {
        userEngagements.push(engagementId);
      }
    }

    return userEngagementMap;
  }

  /**
   * Identify users with duplicate entries (multiple answers)
   */
  private findUsersWithDuplicates(
    userEngagementMap: Map<string, bigint[]>
  ): Set<string> {
    const usersWithDuplicates = new Set<string>();

    for (const [userId, engagementIds] of userEngagementMap.entries()) {
      if (engagementIds.length > 1) {
        usersWithDuplicates.add(userId);
        logger.info(
          `[QuestWinnerService] User ${userId} has ${engagementIds.length} entries - DISQUALIFIED`
        );
      }
    }

    return usersWithDuplicates;
  }

  /**
   * Categorize engagements as eligible or suspended based on criteria
   *
   * IMPORTANT: Only ONE engagement per user can be eligible
   * - If user has multiple entries: ALL are suspended (duplicate disqualification)
   * - If user has one entry: It's eligible only if correct answer AND not bot
   */
  private categorizeEngagements(
    engagements: any[],
    correctAnswer: string,
    usersWithDuplicates: Set<string>
  ): EngagementCategorizationResult {
    const eligibleEngagementIds: bigint[] = [];
    const suspendedEngagementIds: bigint[] = [];
    const eligibleUserIds = new Set<string>(); // Track users already marked eligible
    let correctResponseCount = 0;
    let botEngagementCount = 0;

    for (const engagement of engagements) {
      const userId = String(engagement.user_id || '');
      const engagementId = BigInt(String(engagement.id));

      // Get user's answer from content field (the actual reply/quote text)
      const userAnswer = String(engagement.content || '')
        .trim()
        .toLowerCase();

      // Skip engagements without user_id
      if (!userId) {
        suspendedEngagementIds.push(engagementId);
        logger.warn(
          `[QuestWinnerService] Engagement ${String(
            engagementId
          )} has no user_id - SUSPENDED`
        );
        continue;
      }

      // Skip engagements without content (no answer provided)
      if (!userAnswer) {
        suspendedEngagementIds.push(engagementId);
        logger.warn(
          `[QuestWinnerService] Engagement ${String(
            engagementId
          )} (User: ${userId}) has no content - SUSPENDED`
        );
        continue;
      }

      // Check eligibility criteria
      const isCorrectAnswer = userAnswer === correctAnswer;
      const hasDuplicateEntry = usersWithDuplicates.has(userId);
      const isBotEngagement = engagement.is_bot_engagement === true;
      const alreadyEligible = eligibleUserIds.has(userId); // Safety check

      if (isCorrectAnswer) {
        correctResponseCount++;
      }

      if (isBotEngagement) {
        botEngagementCount++;
      }

      // Determine if eligible (only one entry per user can be eligible)
      const isEligible =
        isCorrectAnswer &&
        !hasDuplicateEntry &&
        !isBotEngagement &&
        !alreadyEligible; // Prevent duplicate eligibility

      if (isEligible) {
        eligibleEngagementIds.push(engagementId);
        eligibleUserIds.add(userId); // Mark this user as having an eligible entry
        logger.info(
          `[QuestWinnerService] Engagement ${String(
            engagementId
          )} (User: ${userId}) - ELIGIBLE`
        );
      } else {
        suspendedEngagementIds.push(engagementId);
        const reasons: string[] = [];
        if (!isCorrectAnswer) reasons.push('wrong answer');
        if (hasDuplicateEntry) reasons.push('duplicate entry');
        if (isBotEngagement) reasons.push('bot detected');
        if (alreadyEligible) reasons.push('user already has eligible entry');

        logger.info(
          `[QuestWinnerService] Engagement ${String(
            engagementId
          )} (User: ${userId}) - SUSPENDED (${reasons.join(', ')})`
        );
      }
    }

    return {
      eligibleEngagementIds,
      suspendedEngagementIds,
      correctResponseCount,
      botEngagementCount,
    };
  }

  /**
   * Calculate reward amount per eligible winner
   */
  private calculateRewardPerWinner(
    campaignBudget: number | null,
    eligibleWinnersCount: number
  ): number {
    return eligibleWinnersCount > 0
      ? (campaignBudget || 0) / eligibleWinnersCount
      : 0;
  }

  /**
   * Update payment statuses and campaign rewards in database transaction
   */
  private async updateDatabaseRecords(
    questId: bigint,
    eligibleEngagementIds: bigint[],
    suspendedEngagementIds: bigint[],
    rewardPerWinner: number
  ): Promise<{ eligibleCount: number; suspendedCount: number }> {
    if (!this.prisma) {
      throw new Error('Prisma client not initialized');
    }

    return await this.prisma.$transaction(async (tx) => {
      // Update campaign card with reward per winner
      await tx.campaign_twittercard.update({
        where: { id: questId },
        data: {
          quote_reward: rewardPerWinner,
          comment_reward: rewardPerWinner,
          like_reward: rewardPerWinner,
          retweet_reward: rewardPerWinner,
        },
      });

      // Set eligible engagements to UNPAID
      const eligibleUpdate =
        eligibleEngagementIds.length > 0
          ? await tx.campaign_tweetengagements.updateMany({
              where: { id: { in: eligibleEngagementIds } },
              data: {
                payment_status: payment_status.UNPAID,
                updated_at: new Date(),
              },
            })
          : { count: 0 };

      // Set ineligible engagements to SUSPENDED
      const suspendedUpdate =
        suspendedEngagementIds.length > 0
          ? await tx.campaign_tweetengagements.updateMany({
              where: { id: { in: suspendedEngagementIds } },
              data: {
                payment_status: payment_status.SUSPENDED,
                updated_at: new Date(),
              },
            })
          : { count: 0 };

      return {
        eligibleCount: eligibleUpdate.count,
        suspendedCount: suspendedUpdate.count,
      };
    });
  }

  /**
   * Main public method to find eligible quest winners
   *
   * Process flow:
   * 1. Fetch quest campaign with engagements
   * 2. Validate quest has correct answer
   * 3. Group engagements by user (detect duplicates)
   * 4. Categorize engagements (eligible vs suspended)
   * 5. Calculate rewards
   * 6. Update database (payment statuses + campaign rewards)
   * 7. Return summary result
   */
  async findEligibleWinners(questId: bigint): Promise<EligibleWinnersResult> {
    await this.initializeServices();

    if (!this.campaignModel) {
      throw new Error('Campaign model not initialized');
    }

    try {
      logger.info(`[QuestWinnerService] Starting process for quest ${questId}`);

      // 1. Fetch quest campaign with correct answer
      const quest = await this.campaignModel.getQuestCampaignWithEngagements(
        questId
      );

      // 2. Validate quest campaign
      this.validateQuestCampaign(quest, questId);

      // TypeScript: After validation, quest is guaranteed to be non-null
      if (!quest) {
        throw new Error('Quest validation failed');
      }

      const correctAnswer = String(quest.correct_answer).trim().toLowerCase();
      const totalResponses = Number(quest.campaign_tweetengagements.length);

      logger.info(
        `[QuestWinnerService] Quest ${String(
          questId
        )}: Total responses = ${String(
          totalResponses
        )}, Correct answer = "${String(quest.correct_answer)}"`
      );

      // 3. Group engagements by user to detect duplicates
      const engagements = quest.campaign_tweetengagements || [];
      const userEngagementMap = this.groupEngagementsByUser(
        engagements as any[]
      );

      // 4. Find users with duplicate entries
      const usersWithDuplicates =
        this.findUsersWithDuplicates(userEngagementMap);

      // 5. Categorize engagements as eligible or suspended
      const {
        eligibleEngagementIds,
        suspendedEngagementIds,
        correctResponseCount,
        botEngagementCount,
      } = this.categorizeEngagements(
        engagements as any[],
        correctAnswer,
        usersWithDuplicates
      );

      // 6. Calculate reward per winner
      const eligibleWinnersCount = eligibleEngagementIds.length;
      const rewardPerWinner = this.calculateRewardPerWinner(
        quest.campaign_budget,
        eligibleWinnersCount
      );

      logger.info(
        `[QuestWinnerService] Quest ${questId}: Eligible winners = ${eligibleWinnersCount}, Reward per winner = ${rewardPerWinner}`
      );

      // 7. Update payment statuses and campaign rewards in database
      const updateResults = await this.updateDatabaseRecords(
        questId,
        eligibleEngagementIds,
        suspendedEngagementIds,
        rewardPerWinner
      );

      logger.info(
        `[QuestWinnerService] Quest ${String(questId)} completed: ` +
          `${String(updateResults.eligibleCount)} set to UNPAID, ` +
          `${String(updateResults.suspendedCount)} set to SUSPENDED, ` +
          `Campaign rewards updated (quote_reward: ${String(
            rewardPerWinner
          )}, comment_reward: ${String(rewardPerWinner)})`
      );

      // ✅ FIX: Publish next event in flow (not the same event - causes infinite loop)
      publishEvent(CampaignEvents.CAMPAIGN_CLOSING_DISTRIBUTE_AUTO_REWARDS, {
        campaignId: questId,
      });

      // 8. Return summary result
      return {
        questId,
        totalResponses,
        correctResponses: correctResponseCount,
        duplicateEntries: usersWithDuplicates.size,
        botEngagements: botEngagementCount,
        eligibleWinners: eligibleWinnersCount,
        suspendedEngagements: suspendedEngagementIds.length,
        rewardPerWinner,
        processedAt: new Date(),
      };
    } catch (error) {
      logger.err(
        `[QuestWinnerService] Error processing quest ${questId}: ${
          (error as Error).message
        }`
      );
      throw error;
    } finally {
      // Cleanup Prisma connection if we created it
      if (this.ownsPrisma && this.prisma) {
        await this.prisma.$disconnect().catch((disconnectError) => {
          logger.err(
            `Failed to disconnect prisma in QuestWinnerService: ${String(
              disconnectError
            )}`
          );
        });
        this.prisma = null;
        this.ownsPrisma = false;
      }

      // Cleanup models
      if (this.ownsPrisma) {
        this.campaignModel = null;
      }
    }
  }
}

/**
 * Legacy function export for backward compatibility
 * @deprecated Use QuestWinnerService.findEligibleWinners() instead
 */
const findEligibleQuestWinners = async (
  questId: bigint
): Promise<EligibleWinnersResult> => {
  const service = new QuestWinnerService();
  return await service.findEligibleWinners(questId);
};

export default findEligibleQuestWinners;
