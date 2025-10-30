import { Status } from '@hashgraph/sdk';
import {
  PrismaClient,
  campaign_twittercard,
  campaign_type,
  payment_status,
  user_user,
} from '@prisma/client';
import { checkTokenAssociation, formattedDateTime } from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import { incrementClaimAmount } from '../../../../../services/campaign-service';
import {
  distributeTokenUsingSDK,
  provideActiveContract,
} from '../../../../../services/contract-service';
import ContractCampaignLifecycle from '../../../../../services/ContractCampaignLifecycle';
import { transferAmountFromContractUsingSDK } from '../../../../../services/transaction-service';
import userService from '../../../../../services/user-service';
import twitterCardService from '../../../../../services/twitterCard-service';
import { getConfig } from '@appConfig';
import { CampaignEvents } from '../../../../AppEvents/campaign';
import CampaignTweetEngagementsModel from '../../../../Modals/CampaignTweetEngagements';
import CampaignTwitterCardModel from '../../../../Modals/CampaignTwitterCard';
import UsersModel from '../../../../Modals/Users';
import { EventPayloadMap } from '../../../../Types/eventPayload';
import {
  CampaignLogEventHandler,
  CampaignLogEventType,
  CampaignLogLevel,
} from '../campaignLogs';

interface RewardsObj {
  like_reward: number;
  retweet_reward: number;
  quote_reward: number;
  comment_reward: number;
}

interface UserRecord {
  id: bigint;
  hedera_wallet_id: string;
  personal_twitter_handle: string | null;
  personal_twitter_id: string | null;
}

interface UserWithReward {
  id: bigint;
  hedera_wallet_id: string;
  personal_twitter_handle: string | null;
  personal_twitter_id: string | null;
  reward: {
    total: number;
    ids: bigint[];
  };
}

interface ExecutionStep {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  timestamp: Date;
  message?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * V201 Auto Reward Service for Campaign Closing
 * Handles the automatic distribution of rewards to eligible users
 */
export class V201OnCloseAutoRewardService {
  private prisma: PrismaClient | null = null;
  private ownsPrisma = false;
  private engagementModel: CampaignTweetEngagementsModel | null = null;
  private campaignModel: CampaignTwitterCardModel | null = null;
  private userModel: UsersModel | null = null;
  private campaignLogger: CampaignLogEventHandler | null = null;
  private executionSteps: ExecutionStep[] = [];

  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      this.prisma = prismaClient;
    }
  }

  /**
   * Add execution step for tracking
   */
  private addStep(
    step: string,
    status: 'success' | 'failed' | 'skipped',
    message?: string,
    error?: string,
    metadata?: Record<string, unknown>
  ): void {
    this.executionSteps.push({
      step,
      status,
      timestamp: new Date(),
      message,
      error,
      metadata,
    });
  }

  /**
   * Log execution summary
   */
  private async logExecutionSummary(campaignId: bigint): Promise<void> {
    if (!this.campaignLogger) return;

    const successCount = this.executionSteps.filter(
      (s) => s.status === 'success'
    ).length;
    const failedCount = this.executionSteps.filter(
      (s) => s.status === 'failed'
    ).length;
    const skippedCount = this.executionSteps.filter(
      (s) => s.status === 'skipped'
    ).length;

    const finalStatus =
      failedCount > 0 ? 'AUTO_REWARD_FAILED' : 'AUTO_REWARD_COMPLETED';
    const level =
      failedCount > 0 ? CampaignLogLevel.ERROR : CampaignLogLevel.SUCCESS;

    await this.campaignLogger.saveLog({
      campaignId: Number(campaignId),
      status: finalStatus,
      message: `Auto reward distribution completed - ${successCount} successful, ${failedCount} failed, ${skippedCount} skipped`,
      level,
      eventType: CampaignLogEventType.SYSTEM_EVENT,
      data: {
        level,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        metadata: {
          executionHistory: this.executionSteps,
          summary: {
            totalSteps: this.executionSteps.length,
            successful: successCount,
            failed: failedCount,
            skipped: skippedCount,
          },
        },
      },
    });
  }

  /**
   * Initialize required services
   */
  private async initializeServices(): Promise<void> {
    if (!this.prisma) {
      this.prisma = await createPrismaClient();
      this.ownsPrisma = true;
    }

    if (!this.prisma) {
      throw new Error('Failed to initialize Prisma client');
    }

    if (!this.engagementModel) {
      this.engagementModel = new CampaignTweetEngagementsModel(this.prisma);
    }

    if (!this.campaignModel) {
      this.campaignModel = new CampaignTwitterCardModel(this.prisma);
    }

    if (!this.userModel) {
      this.userModel = new UsersModel(this.prisma);
    }

    if (!this.campaignLogger) {
      this.campaignLogger = await CampaignLogEventHandler.create(this.prisma);
    }
  }

  /**
   * Extract reward structure from campaign card
   */
  private getRewardsFromCard(card: campaign_twittercard): RewardsObj {
    return {
      like_reward: card.like_reward ?? 0,
      retweet_reward: card.retweet_reward ?? 0,
      quote_reward: card.quote_reward ?? 0,
      comment_reward: card.comment_reward ?? 0,
    };
  }

  /**
   * Calculate total reward for a specific user based on their engagements
   */
  private async calculateTotalRewardForUser(
    rewards: RewardsObj,
    engagedUserID: string,
    cardID: bigint
  ): Promise<{ total: number; ids: bigint[] }> {
    await this.initializeServices();

    if (!this.engagementModel) {
      throw new Error('Engagement model not initialized');
    }

    const { like_reward, retweet_reward, quote_reward, comment_reward } =
      rewards;
    let total = 0;
    const ids: bigint[] = [];

    // Use engagement model instead of direct Prisma query
    const engagements = await this.engagementModel.getEngagementsByCampaign(
      cardID,
      {
        user_id: engagedUserID,
        payment_status: payment_status.UNPAID,
        is_valid_timing: true,
      }
    );

    // V201 uses lowercase engagement types ('like', 'retweet', 'quote', 'reply')
    // Legacy on-card.ts uses PascalCase ('Like', 'Retweet', 'Quote', 'Reply')
    for (const engagement of engagements) {
      ids.push(engagement.id);

      if (engagement.engagement_type === 'like') total += like_reward;
      if (engagement.engagement_type === 'retweet') total += retweet_reward;
      if (engagement.engagement_type === 'quote') total += quote_reward;
      if (engagement.engagement_type === 'reply') total += comment_reward;
    }

    return { total, ids };
  }

  /**
   * Update engagement records to PAID status
   */
  private async updateEngagementsToPaid(ids: bigint[]): Promise<void> {
    await this.initializeServices();

    if (!this.engagementModel) {
      throw new Error('Engagement model not initialized');
    }

    // Use engagement model's updatePaymentStatus method with array of IDs
    await this.engagementModel.updatePaymentStatus(ids, payment_status.PAID);
  }

  /**
   * Get campaign card details with user information
   */
  private async getCardDetails(cardId: bigint) {
    await this.initializeServices();

    if (!this.campaignModel) {
      throw new Error('Campaign model not initialized');
    }

    // Use campaign model instead of direct Prisma query
    return await this.campaignModel.getCampaignsWithUserData(cardId);
  }

  /**
   * Get users by their Twitter IDs (helper method since Users modal doesn't have this specific method)
   */
  private async getUsersByTwitterIds(twitterIds: string[]) {
    await this.initializeServices();

    if (!this.userModel || !this.prisma) {
      throw new Error('Models not initialized');
    }

    // Use the user model's underlying Prisma instance for this specific query
    // This maintains the modal pattern while providing the needed functionality
    return await this.prisma.user_user.findMany({
      where: {
        personal_twitter_id: {
          in: twitterIds,
        },
      },
      select: {
        id: true,
        hedera_wallet_id: true,
        personal_twitter_handle: true,
        personal_twitter_id: true,
      },
    });
  }

  /**
   * Generate the reward announcement tweet text
   */
  private async getRewardAnnouncementTweetText(
    cardType: string,
    card: campaign_twittercard
  ): Promise<string> {
    const dateNow = new Date().toISOString();
    const config = await getConfig();
    const claimDuration = config.app.defaultRewardClaimDuration;

    if (card.campaign_type === campaign_type.awareness) {
      if (cardType === 'HBAR') {
        return (
          `Promo ended on ${formattedDateTime(dateNow)}. ` +
          `Rewards allocation for the next ${claimDuration} minutes. ` +
          `New users: log into ${config.app.appURL}, ` +
          `then link your Personal X account to receive your rewards.`
        );
      } else {
        return (
          `Promo ended on ${formattedDateTime(dateNow)}. ` +
          `Rewards allocation for the next ${claimDuration} minutes. ` +
          `New users: log into ${config.app.appURL}, ` +
          `link Personal X account and associate token with ID ` +
          `${card.fungible_token_id ?? ''} to your wallet.`
        );
      }
    } else {
      return `🕒 Quest closed at ${formattedDateTime(
        dateNow
      )}. Rewards being allocated over the next ${claimDuration} minutes. ${
        card?.correct_answer
          ? `**The correct answer is: ${card.correct_answer}**`
          : ''
      }`;
    }
  }

  /**
   * Publish reward announcement tweet thread
   */
  private async publishRewardAnnouncementTweet(
    card: campaign_twittercard,
    cardType: string,
    campaigner: user_user
  ): Promise<void> {
    try {
      const tweetText = await this.getRewardAnnouncementTweetText(
        cardType,
        card
      );

      logger.info(
        `Tweet text for ${cardType} tweet string count: ${tweetText.length} And Content: ${tweetText}`
      );

      if (!card.last_thread_tweet_id) {
        throw new Error(
          'Campaign missing last_thread_tweet_id for tweet thread'
        );
      }

      await twitterCardService.publishTweetORThread({
        cardOwner: campaigner,
        isThread: true,
        tweetText,
        parentTweetId: card.last_thread_tweet_id,
      });

      logger.info(
        `Successfully published reward announcement tweet thread for card ID: ${card.id}`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `Failed to publish reward announcement tweet thread: ${errorMsg}`
      );
      throw error;
    }
  }

  /**
   * Adjust total reward in smart contract
   */
  private async adjustTotalReward(
    cardType: string,
    campaigner: {
      hedera_wallet_id: string;
      business_twitter_handle: string | null;
    },
    card: campaign_twittercard,
    tokenId: string | undefined,
    totalDistributableReward: number
  ): Promise<void> {
    try {
      logger.info(
        `Adjusting total reward: ${totalDistributableReward} for campaign ${card.id}`
      );

      const contractDetails = (await provideActiveContract()) as {
        contract_id?: string;
      };
      if (!contractDetails?.contract_id) {
        throw new Error('No active contract found');
      }

      const campaignLifecycleService = new ContractCampaignLifecycle(
        contractDetails.contract_id
      );

      if (cardType === 'HBAR') {
        if (!card.contract_id) {
          throw new Error('Contract ID is required for HBAR campaigns');
        }
        await campaignLifecycleService.adjustTotalReward({
          campaigner: campaigner.hedera_wallet_id,
          campaignAddress: card.contract_id,
          totalAmount: totalDistributableReward,
        });
      } else if (cardType === 'FUNGIBLE' && tokenId) {
        if (!card.contract_id) {
          throw new Error('Contract ID is required for FUNGIBLE campaigns');
        }
        await campaignLifecycleService.adjustTotalFungibleReward({
          tokenId,
          campaigner: campaigner.hedera_wallet_id,
          campaignAddress: card.contract_id,
          tokenTotalAmount: totalDistributableReward,
        });
      }

      logger.info(`Total reward adjusted: ${totalDistributableReward}`);
    } catch (error) {
      logger.err(`Error adjusting total reward: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Distribute rewards to individual users
   */
  private async distributeRewardsToUsers(
    totalRewardMappedWithUser: UserWithReward[],
    cardType: string,
    card: campaign_twittercard,
    tokenId: string | undefined,
    campaigner: user_user
  ): Promise<{
    successful: number;
    failed: number;
    actualAmountDistributed: number;
  }> {
    let successful = 0;
    let failed = 0;
    let actualAmountDistributed = 0;

    for (const user of totalRewardMappedWithUser) {
      try {
        const { total, ids } = user.reward;

        if (total <= 0) {
          continue;
        }

        logger.info(
          `Processing rewards for user ${user.hedera_wallet_id}: ${total}`
        );

        if (cardType === 'FUNGIBLE' && tokenId) {
          const isTokenAssociated = await checkTokenAssociation(
            tokenId,
            user.hedera_wallet_id
          );

          if (isTokenAssociated) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            const response = await (distributeTokenUsingSDK as any)({
              tokenId,
              userId: user.hedera_wallet_id,
              amount: total,
              xHandle: campaigner.business_twitter_handle,
            });

            if (response?.status._code === 22) {
              await this.updateEngagementsToPaid(ids);
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call
              await (userService.totalReward as any)(
                user.id,
                total,
                'increment'
              );
              successful++;
              actualAmountDistributed += total; // Track actual distributed amount
              logger.info(
                `Successfully distributed ${total} tokens to ${user.hedera_wallet_id}`
              );
            } else {
              failed++;
              logger.err(
                `Failed to distribute tokens to ${user.hedera_wallet_id}`
              );
            }
          } else {
            failed++;
            logger.warn(
              `Token not associated for user ${user.hedera_wallet_id}`
            );
          }
        } else if (cardType === 'HBAR' && card.contract_id) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const rewardTrx = await (transferAmountFromContractUsingSDK as any)({
            intractorWallet: user.hedera_wallet_id,
            amount: total,
            xHandle: campaigner.business_twitter_handle,
          });

          if (rewardTrx?.status === Status.Success) {
            await this.updateEngagementsToPaid(ids);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            await (userService.totalReward as any)(user.id, total, 'increment');
            successful++;
            actualAmountDistributed += total; // Track actual distributed amount
            logger.info(
              `Successfully distributed ${total} HBAR to ${user.hedera_wallet_id}`
            );
          } else {
            failed++;
            logger.err(`Failed to distribute HBAR to ${user.hedera_wallet_id}`);
          }
        }
      } catch (error) {
        failed++;
        logger.err(
          `Error processing rewards for user ${user.hedera_wallet_id}: ${
            (error as Error).message
          }`
        );
      }
    }

    return { successful, failed, actualAmountDistributed };
  }

  /**
   * Main method to perform auto rewarding for eligible users
   */
  async performAutoRewardingForEligibleUser(cardId: bigint): Promise<{
    success: boolean;
    totalDistributed: number;
    usersRewarded: number;
    errors?: string[];
  }> {
    // Reset execution steps for new reward distribution
    this.executionSteps = [];

    await this.initializeServices();

    if (!this.prisma || !this.campaignLogger) {
      throw new Error('Services not properly initialized');
    }

    try {
      this.addStep(
        'initialization',
        'success',
        'Services initialized for auto reward'
      );

      // Get all unique users who have unpaid engagements using engagement model
      if (!this.engagementModel) {
        throw new Error('Engagement model not initialized');
      }

      const engagements = await this.engagementModel.getEngagementsByCampaign(
        cardId,
        {
          payment_status: payment_status.UNPAID,
          is_valid_timing: true,
          is_bot_engagement: false,
        }
      );

      // Extract unique user IDs
      const engagedUsers = [
        ...new Set(
          engagements
            .map((engagement) => engagement.user_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];

      this.addStep(
        'fetch_engagements',
        'success',
        `Found ${engagements.length} engagements from ${engagedUsers.length} users`,
        undefined,
        {
          totalEngagements: engagements.length,
          uniqueUsers: engagedUsers.length,
        }
      );

      // Continue processing even if no engaged users for announcement tweet
      let userWithWallet: UserRecord[] = [];

      if (engagedUsers.length === 0) {
        this.addStep('user_validation', 'skipped', 'No engaged users found');
      } else {
        if (!this.userModel) {
          throw new Error('User model not initialized');
        }

        // Get user records with wallet information using user model
        const usersRecords: UserRecord[] = await this.getUsersByTwitterIds(
          engagedUsers
        );

        userWithWallet = usersRecords.filter((user: UserRecord) =>
          Boolean(user.hedera_wallet_id)
        );

        this.addStep(
          'fetch_users',
          'success',
          `Found ${userWithWallet.length} users with wallets out of ${usersRecords.length} total users`,
          undefined,
          {
            totalUsers: usersRecords.length,
            usersWithWallets: userWithWallet.length,
          }
        );

        if (userWithWallet.length === 0) {
          this.addStep(
            'wallet_validation',
            'skipped',
            'No users with wallets found'
          );
        }
      }

      // Get campaign details
      const cardDetails = await this.getCardDetails(cardId);
      if (!cardDetails) {
        this.addStep(
          'fetch_campaign',
          'failed',
          'Campaign card details not found'
        );
        throw new Error('Campaign card details not found');
      }

      this.addStep('fetch_campaign', 'success', 'Campaign details retrieved');

      const { user_user: campaigner, ...card } = cardDetails;
      const rewards = this.getRewardsFromCard(card);
      const tokenId = card?.fungible_token_id || undefined;
      const cardType = card?.type;

      if (!cardType) {
        throw new Error('Campaign type not specified');
      }

      // Initialize reward distribution variables
      let totalDistributableReward = 0;
      let totalRewardMappedWithUser: UserWithReward[] = [];
      let distributionResult = {
        successful: 0,
        failed: 0,
        actualAmountDistributed: 0,
      };

      // Only calculate and distribute rewards if there are users with wallets
      if (userWithWallet.length > 0) {
        // Calculate total rewards for all users
        totalRewardMappedWithUser = await Promise.all(
          userWithWallet.map(async (user: UserRecord) => {
            if (!user.personal_twitter_id) {
              throw new Error(
                `User ${String(user.id)} has no personal_twitter_id`
              );
            }
            const totalReward = await this.calculateTotalRewardForUser(
              rewards,
              user.personal_twitter_id,
              cardId
            );
            totalDistributableReward += totalReward.total;
            return {
              ...user,
              reward: totalReward,
            } as UserWithReward;
          })
        );

        this.addStep(
          'calculate_rewards',
          'success',
          `Calculated total rewards for ${userWithWallet.length} users`,
          undefined,
          { totalDistributableReward, userCount: userWithWallet.length }
        );

        // Only proceed with reward distribution if there are rewards > 0
        if (totalDistributableReward > 0) {
          // Adjust total reward in smart contract
          await this.adjustTotalReward(
            cardType,
            campaigner,
            card,
            tokenId,
            totalDistributableReward
          );

          this.addStep(
            'adjust_contract_reward',
            'success',
            `Adjusted smart contract total reward to ${totalDistributableReward}`,
            undefined,
            { totalAmount: totalDistributableReward, cardType }
          );

          // Distribute rewards to users
          distributionResult = await this.distributeRewardsToUsers(
            totalRewardMappedWithUser,
            cardType,
            card,
            tokenId,
            campaigner
          );

          this.addStep(
            'distribute_rewards',
            'success',
            `Distributed rewards to ${distributionResult.successful} users`,
            undefined,
            {
              successful: distributionResult.successful,
              failed: distributionResult.failed,
              totalDistributed: distributionResult.actualAmountDistributed,
            }
          );

          // Update campaign amount_claimed with the actual distributed amount
          if (distributionResult.actualAmountDistributed > 0) {
            await incrementClaimAmount(
              cardId,
              distributionResult.actualAmountDistributed
            );

            this.addStep(
              'update_claim_amount',
              'success',
              `Updated campaign claim amount by ${distributionResult.actualAmountDistributed}`,
              undefined,
              {
                claimAmountIncrement:
                  distributionResult.actualAmountDistributed,
              }
            );
          } else {
            this.addStep(
              'update_claim_amount',
              'skipped',
              'No claim amount update - no rewards were actually distributed'
            );
          }
        } else {
          this.addStep(
            'reward_validation',
            'skipped',
            'No rewards to distribute - calculated rewards are 0'
          );
        }
      } else {
        this.addStep(
          'reward_distribution',
          'skipped',
          'No reward distribution - no users with wallets'
        );
      }

      // ALWAYS publish reward announcement tweet thread regardless of reward distribution
      try {
        await this.publishRewardAnnouncementTweet(card, cardType, campaigner);

        this.addStep(
          'publish_announcement_tweet',
          'success',
          'Published reward announcement tweet thread',
          undefined,
          { cardType }
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.addStep(
          'publish_announcement_tweet',
          'failed',
          'Failed to publish reward announcement tweet',
          errorMsg
        );
        // Log warning but don't fail the entire process if tweet fails
        logger.warn(
          `Tweet announcement failed for campaign ${cardId}: ${errorMsg}`
        );
        // Tweet failure should be logged but not throw - this is a non-critical step
      }

      // Log execution summary
      await this.logExecutionSummary(cardId);

      return {
        success: true,
        totalDistributed: distributionResult.actualAmountDistributed,
        usersRewarded: distributionResult.successful,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.addStep(
        'auto_reward_process',
        'failed',
        'Auto reward process failed',
        errorMsg
      );

      // Log execution summary with error
      await this.logExecutionSummary(cardId);

      return {
        success: false,
        totalDistributed: 0,
        usersRewarded: 0,
        errors: [errorMsg],
      };
    } finally {
      const shouldCleanupModels = this.ownsPrisma;

      if (this.ownsPrisma && this.prisma) {
        await this.prisma.$disconnect().catch((disconnectError) => {
          logger.err(
            `Failed to disconnect prisma after auto rewarding: ${String(
              disconnectError
            )}`
          );
        });

        this.prisma = null;
        this.ownsPrisma = false;
      }

      if (shouldCleanupModels) {
        this.engagementModel = null;
        this.campaignModel = null;
        this.userModel = null;
        this.campaignLogger = null;
      }
    }
  }
}

/**
 * Main service function for handling auto reward events
 */
export const onCloseRewardServices = async (
  payload: EventPayloadMap[CampaignEvents.CAMPAIGN_CLOSING_DISTRIBUTE_AUTO_REWARDS]
): Promise<void> => {
  try {
    const { campaignId } = payload;
    logger.info(`Processing auto reward event for campaign ${campaignId}`);

    const autoRewardService = new V201OnCloseAutoRewardService();
    const result = await autoRewardService.performAutoRewardingForEligibleUser(
      BigInt(campaignId)
    );

    if (result.success) {
      logger.info(
        `Auto reward completed successfully for campaign ${campaignId}. Distributed: ${result.totalDistributed} to ${result.usersRewarded} users`
      );
    } else {
      const errorMessage = `Auto reward failed for campaign ${campaignId}: ${
        result.errors ? result.errors.join(', ') : 'Unknown error'
      }`;
      logger.err(errorMessage);
      // Do not throw; just log the error to avoid breaking the campaign flow
    }
  } catch (error) {
    const errorMessage = `Error in onCloseRewardServices: ${
      (error as Error).message
    }`;
    logger.err(errorMessage);
    throw error;
  }
};
