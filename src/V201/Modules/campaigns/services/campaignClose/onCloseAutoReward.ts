import createPrismaClient from "@shared/prisma";
import { CampaignEvents } from '../../../../AppEvents/campaign';
import { EventPayloadMap } from '../../../../Types/eventPayload';
import {
  PrismaClient,
  campaign_twittercard,
  payment_status,
} from '@prisma/client';
import logger from 'jet-logger';
import CampaignTweetEngagementsModel from '../../../../Modals/CampaignTweetEngagements';
import CampaignTwitterCardModel from '../../../../Modals/CampaignTwitterCard';
import UsersModel from '../../../../Modals/Users';
import {
  CampaignLogEventHandler,
  CampaignLogLevel,
  CampaignLogEventType,
} from '../campaignLogs';
import { checkTokenAssociation } from '@shared/helper';
import {
  distributeTokenUsingSDK,
  provideActiveContract,
} from '../../../../../services/contract-service';
import ContractCampaignLifecycle from '../../../../../services/ContractCampaignLifecycle';
import { transferAmountFromContractUsingSDK } from '../../../../../services/transaction-service';
import userService from '../../../../../services/user-service';
import { incrementClaimAmount } from '../../../../../services/campaign-service';
import { Status } from '@hashgraph/sdk';

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

/**
 * V201 Auto Reward Service for Campaign Closing
 * Handles the automatic distribution of rewards to eligible users
 */
export class V201OnCloseAutoRewardService {
  private prisma: PrismaClient | null = null;
  private engagementModel: CampaignTweetEngagementsModel | null = null;
  private campaignModel: CampaignTwitterCardModel | null = null;
  private userModel: UsersModel | null = null;
  private campaignLogger: CampaignLogEventHandler | null = null;

  /**
   * Initialize required services
   */
  private async initializeServices(): Promise<void> {
    if (!this.prisma) {
      this.prisma = await createPrismaClient();
      this.engagementModel = new CampaignTweetEngagementsModel(this.prisma);
      this.campaignModel = new CampaignTwitterCardModel(this.prisma);
      this.userModel = new UsersModel(this.prisma);
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

    for (const engagement of engagements) {
      ids.push(engagement.id);

      switch (engagement.engagement_type) {
        case 'like':
          total += like_reward;
          break;
        case 'retweet':
          total += retweet_reward;
          break;
        case 'quote':
          total += quote_reward;
          break;
        case 'reply':
          total += comment_reward;
          break;
        default:
          logger.warn(`Unknown engagement type: ${engagement.engagement_type}`);
      }
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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const campaignLifecycleService = new ContractCampaignLifecycle(
        contractDetails.contract_id
      ) as any;

      if (cardType === 'HBAR') {
        if (!card.contract_id) {
          throw new Error('Contract ID is required for HBAR campaigns');
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await campaignLifecycleService.adjustTotalReward({
          campaigner: campaigner.hedera_wallet_id,
          campaignAddress: card.contract_id,
          totalAmount: totalDistributableReward,
        });
      } else if (cardType === 'FUNGIBLE' && tokenId) {
        if (!card.contract_id) {
          throw new Error('Contract ID is required for FUNGIBLE campaigns');
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
    campaigner: {
      hedera_wallet_id: string;
      business_twitter_handle: string | null;
    }
  ): Promise<{ successful: number; failed: number }> {
    let successful = 0;
    let failed = 0;

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

    return { successful, failed };
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
    await this.initializeServices();

    if (!this.prisma || !this.campaignLogger) {
      throw new Error('Services not properly initialized');
    }

    try {
      logger.info(`Starting auto reward process for campaign ${cardId}`);

      // Log start of auto reward process
      await this.campaignLogger.saveLog({
        campaignId: Number(cardId),
        status: 'AUTO_REWARD_STARTED',
        message: 'Started automatic reward distribution process',
        level: CampaignLogLevel.INFO,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        data: {
          level: CampaignLogLevel.INFO,
          eventType: CampaignLogEventType.SYSTEM_EVENT,
          metadata: { campaignId: cardId },
        },
      });

      // Get all unique users who have unpaid engagements using engagement model
      if (!this.engagementModel) {
        throw new Error('Engagement model not initialized');
      }

      const engagements = await this.engagementModel.getEngagementsByCampaign(
        cardId,
        {
          payment_status: payment_status.UNPAID,
          is_valid_timing: true,
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

      if (engagedUsers.length === 0) {
        logger.warn(`No engaged users found for campaign ${cardId}`);
        return {
          success: true,
          totalDistributed: 0,
          usersRewarded: 0,
        };
      }

      if (!this.userModel) {
        throw new Error('User model not initialized');
      }

      // Get user records with wallet information using user model
      const usersRecords: UserRecord[] = await this.getUsersByTwitterIds(
        engagedUsers
      );

      const userWithWallet = usersRecords.filter((user: UserRecord) =>
        Boolean(user.hedera_wallet_id)
      );

      if (userWithWallet.length === 0) {
        logger.warn(`No users with wallets found for campaign ${cardId}`);
        return {
          success: true,
          totalDistributed: 0,
          usersRewarded: 0,
        };
      }

      // Get campaign details
      const cardDetails = await this.getCardDetails(cardId);
      if (!cardDetails) {
        throw new Error('Campaign card details not found');
      }

      const { user_user: campaigner, ...card } = cardDetails;
      const rewards = this.getRewardsFromCard(card);
      const tokenId = card?.fungible_token_id || undefined;
      const cardType = card?.type;

      if (!cardType) {
        throw new Error('Campaign type not specified');
      }

      // Calculate total rewards for all users
      let totalDistributableReward = 0;
      const totalRewardMappedWithUser: UserWithReward[] = await Promise.all(
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

      if (totalDistributableReward <= 0) {
        logger.warn(`No rewards to distribute for campaign ${cardId}`);
        return {
          success: true,
          totalDistributed: 0,
          usersRewarded: 0,
        };
      }

      logger.info(`Total reward distributable: ${totalDistributableReward}`);

      // Adjust total reward in smart contract
      await this.adjustTotalReward(
        cardType,
        campaigner,
        card,
        tokenId,
        totalDistributableReward
      );

      // Distribute rewards to users
      const distributionResult = await this.distributeRewardsToUsers(
        totalRewardMappedWithUser,
        cardType,
        card,
        tokenId,
        campaigner
      );

      // Update campaign claim amount
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await (incrementClaimAmount as any)(cardId, totalDistributableReward);

      // Log completion
      await this.campaignLogger.saveLog({
        campaignId: Number(cardId),
        status: 'AUTO_REWARD_COMPLETED',
        message: `Auto reward distribution completed. Distributed: ${totalDistributableReward}, Users: ${distributionResult.successful}`,
        level: CampaignLogLevel.SUCCESS,
        eventType: CampaignLogEventType.SYSTEM_EVENT,
        data: {
          level: CampaignLogLevel.SUCCESS,
          eventType: CampaignLogEventType.SYSTEM_EVENT,
          metadata: {
            totalDistributed: totalDistributableReward,
            successfulUsers: distributionResult.successful,
            failedUsers: distributionResult.failed,
          },
        },
      });

      logger.info(
        `Auto reward process completed for campaign ${cardId}. Total distributed: ${totalDistributableReward}`
      );

      return {
        success: true,
        totalDistributed: totalDistributableReward,
        usersRewarded: distributionResult.successful,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.err(
        `Error in auto reward process for campaign ${cardId}: ${errorMsg}`
      );

      // Log error
      if (this.campaignLogger) {
        await this.campaignLogger.logError(
          Number(cardId),
          error as Error,
          'auto_reward_distribution'
        );
      }

      return {
        success: false,
        totalDistributed: 0,
        usersRewarded: 0,
        errors: [errorMsg],
      };
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
      logger.err(
        `Auto reward failed for campaign ${campaignId}: ${
          result.errors ? result.errors.join(', ') : 'Unknown error'
        }`
      );
    }
  } catch (error) {
    logger.err(`Error in onCloseRewardServices: ${(error as Error).message}`);
    throw error;
  }
};
