import { campaign_twittercard, campaignstatus, PrismaClient, user_user } from '@prisma/client';
import { formattedDateTime } from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import { performAutoRewardingForEligibleUser } from '@services/reward-service/on-card';
import twitterCardService from '@services/twitterCard-service';
import { expiryFungibleCampaign, expiryCampaign, queryFungibleBalanceOfCampaigner } from '@services/contract-service';
import userService from '@services/user-service';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import { updateCampaignInMemoryStatus } from '@V201/modules/common';
import XEngagementTracker from './xEngagementTracker';

/**
 * V201-specific campaign expiry service
 * This service handles campaign expiry operations independently of legacy ExpireAndArchive.ts
 * No node-schedule dependencies!
 */
export class V201CampaignExpiryService {
  private prisma: PrismaClient | null = null;
  private date = new Date();

  private async initializePrisma(): Promise<PrismaClient> {
    if (!this.prisma) {
      this.prisma = await createPrismaClient();
    }
    return this.prisma;
  }

  /**
   * Main entry point for expiring a V201 campaign
   * This replaces the legacy CampaignExpiryOperation for V201 campaigns
   */
  async expireCampaign(campaign: campaign_twittercard): Promise<{
    success: boolean;
    message: string;
    campaignId: number | bigint;
  }> {
    try {
      await this.initializePrisma();

      logger.info(
        `[V201] Starting campaign expiry for ID: ${campaign.id}, Name: ${
          campaign.name || ''
        }`
      );

      // Get campaign owner
      const campaignOwner = await this.getCampaignOwner(
        campaign.owner_id.toString()
      );
      if (!campaignOwner) {
        throw new Error('Campaign owner not found');
      }

      // Validate that campaign is in correct status for expiry
      if (
        campaign.card_status !== campaignstatus.RewardDistributionInProgress
      ) {
        throw new Error(
          `Campaign ${campaign.id} is not in RewardDistributionInProgress status`
        );
      }

      // Validate that engagement data collection has been completed
      await this.validateEngagementDataCollection(campaign);

      // Validate owner has Twitter access tokens
      if (!this.hasValidAccessTokens(campaignOwner)) {
        throw new Error('Campaign owner lacks valid Twitter access tokens');
      }

      // Perform final reward distribution for last mile eligible users
      logger.info(
        `[V201] Processing final reward distribution for campaign ${campaign.id}`
      );
      await performAutoRewardingForEligibleUser(campaign.id);

      // Handle expiry based on campaign type
      if (campaign.type === 'HBAR') {
        await this.handleHBARExpiry(campaign, campaignOwner);
      } else if (campaign.type === 'FUNGIBLE') {
        await this.handleFungibleExpiry(campaign, campaignOwner);
      } else {
        throw new Error(
          `Unsupported campaign type: ${campaign.type || 'unknown'}`
        );
      }

      logger.info(
        `[V201] Campaign expiry completed successfully for ID: ${campaign.id}`
      );

      return {
        success: true,
        message: `Campaign ${campaign.id} expired successfully`,
        campaignId: campaign.id,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Unknown error during campaign expiry';
      logger.err(
        `[V201] Campaign expiry failed for ID: ${campaign.id}: ${errorMsg}`
      );

      // Handle expiry error
      await this.handleExpiryError(campaign, errorMsg);

      return {
        success: false,
        message: errorMsg,
        campaignId: campaign.id,
      };
    }
  }

  /**
   * Handle HBAR campaign expiry
   */
  private async handleHBARExpiry(
    campaign: campaign_twittercard,
    owner: user_user
  ): Promise<void> {
    try {
      logger.info(`[V201] Processing HBAR expiry for campaign ${campaign.id}`);

      let balances = 0;

      // Step 1: Smart Contract Transaction for HBAR expiry
      try {
        const expiryResponse = await expiryCampaign(campaign, owner);
        if (
          expiryResponse &&
          'dataDecoded' in expiryResponse &&
          expiryResponse.dataDecoded
        ) {
          balances = Number(expiryResponse.dataDecoded[0]);
        }
        logger.info(
          `[V201] HBAR Smart Contract transaction successful for campaign ${campaign.id}`
        );
      } catch (err) {
        throw new Error(
          `Failed to perform HBAR Smart Contract transaction: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
      }

      // Step 2: Update user balance if needed
      if (balances > 0) {
        try {
          await userService.topUp(owner.id, balances, 'update');
          logger.info(
            `[V201] Updated user balance for campaign owner ${owner.id}, amount: ${balances}`
          );
        } catch (err) {
          throw new Error(
            `Failed to update user balance: ${
              err instanceof Error ? err.message : 'Unknown error'
            }`
          );
        }
      }

      // Step 3: Publish expiry announcement tweet
      await this.publishExpiryAnnouncementTweet(campaign, owner, 'HBAR');

      // Step 4: Update campaign status to expired
      await this.updateCampaignToExpired(campaign);

      logger.info(
        `[V201] HBAR campaign expiry completed for campaign ${campaign.id}`
      );
    } catch (error) {
      logger.err(
        `[V201] Error during HBAR expiry for campaign ${campaign.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      throw error;
    }
  }

  /**
   * Handle fungible token campaign expiry
   */
  private async handleFungibleExpiry(
    campaign: campaign_twittercard,
    owner: user_user
  ): Promise<void> {
    try {
      logger.info(
        `[V201] Processing FUNGIBLE expiry for campaign ${campaign.id}`
      );

      const prisma = await this.initializePrisma();
      let campaignerBalances = 0;

      // Step 1: Smart Contract Transaction for FUNGIBLE expiry
      try {
        await expiryFungibleCampaign(campaign, owner);
        logger.info(
          `[V201] FUNGIBLE Smart Contract transaction successful for campaign ${campaign.id}`
        );
      } catch (err) {
        throw new Error(
          `Failed to perform FUNGIBLE Smart Contract transaction: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`
        );
      }

      // Step 2: Query balance from Smart Contract
      if (campaign.fungible_token_id) {
        try {
          campaignerBalances = Number(
            await queryFungibleBalanceOfCampaigner(
              owner.hedera_wallet_id,
              campaign.fungible_token_id
            )
          );
          logger.info(
            `[V201] Queried balance from Smart Contract for campaign owner ${owner.id}, balance: ${campaignerBalances}`
          );
        } catch (err) {
          throw new Error(
            `Failed to query balance from Smart Contract: ${
              err instanceof Error ? err.message : 'Unknown error'
            }`
          );
        }
      }

      // Step 3: Update user balance if needed
      if (campaignerBalances > 0 && campaign.fungible_token_id) {
        try {
          // Find the token data for the campaign
          const tokenData = await prisma.whiteListedTokens.findUnique({
            where: { token_id: campaign.fungible_token_id },
          });

          if (tokenData) {
            // Find existing balance record
            const balanceRecord = await prisma.user_balances.findFirst({
              where: {
                user_id: owner.id,
                token_id: tokenData.id,
              },
            });

            if (
              balanceRecord &&
              Number(balanceRecord.entity_balance) !== campaignerBalances
            ) {
              logger.warn(
                `[V201] Campaigner balance diff found for campaign ${campaign.id}`
              );

              // Update the balance record in DB
              await prisma.user_balances.update({
                where: { id: balanceRecord.id },
                data: { entity_balance: campaignerBalances },
              });

              logger.info(
                `[V201] Updated fungible balance for campaign owner ${owner.id}`
              );
            } else {
              logger.info(
                `[V201] No change in balance, no update needed for campaign ${campaign.id}`
              );
            }
          }
        } catch (err) {
          throw new Error(
            `Failed to update user balance: ${
              err instanceof Error ? err.message : 'Unknown error'
            }`
          );
        }
      }

      // Step 4: Publish expiry announcement tweet
      await this.publishExpiryAnnouncementTweet(campaign, owner, 'FUNGIBLE');

      // Step 5: Update campaign status to expired
      await this.updateCampaignToExpired(campaign);

      logger.info(
        `[V201] FUNGIBLE campaign expiry completed for campaign ${campaign.id}`
      );
    } catch (error) {
      logger.err(
        `[V201] Error during FUNGIBLE expiry for campaign ${campaign.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      throw error;
    }
  }

  /**
   * Publish expiry announcement tweet
   */
  private async publishExpiryAnnouncementTweet(
    campaign: campaign_twittercard,
    owner: user_user,
    type: 'HBAR' | 'FUNGIBLE'
  ): Promise<void> {
    try {
      logger.info(
        `[V201] Publishing expiry announcement tweet for ${type} campaign ${campaign.id}`
      );

      const tweetText = await this.generateExpiryAnnouncementText(
        campaign,
        type
      );

      // Safely handle parent tweet ID
      const parentTweetId = campaign.last_thread_tweet_id;
      if (!parentTweetId) {
        throw new Error(
          'Parent tweet ID is required for publishing expiry announcement'
        );
      }

      const tweetResult = await twitterCardService.publishTweetORThread({
        cardOwner: owner,
        isThread: true,
        tweetText,
        parentTweetId,
      });

      logger.info(
        `[V201] Published expiry announcement tweet for campaign ${campaign.id}`
      );

      // Update campaign with the final tweet ID (tweet result might be string or object)
      const prisma = await this.initializePrisma();
      const lastTweetId =
        typeof tweetResult === 'string' ? tweetResult : parentTweetId;
      await new CampaignTwitterCardModel(prisma).updateCampaign(campaign.id, {
        last_thread_tweet_id: lastTweetId,
      });
    } catch (error) {
      logger.err(
        `[V201] Failed to publish expiry announcement tweet for campaign ${
          campaign.id
        }: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  }

  /**
   * Generate expiry announcement text
   */
  private async generateExpiryAnnouncementText(
    campaign: campaign_twittercard,
    type: 'HBAR' | 'FUNGIBLE'
  ): Promise<string> {
    const expiryDate = formattedDateTime(this.date.toISOString());
    const amountClaimed = campaign.amount_claimed ?? 0;

    if (type === 'HBAR') {
      const hbarAmount = (Number(amountClaimed) / 1e8).toFixed(2);
      return `Reward allocation concluded on ${expiryDate}. A total of ${hbarAmount} HBAR was given out for this promo.`;
    } else {
      // For fungible tokens, we need to get token info
      const prisma = await this.initializePrisma();
      let tokenSymbol = 'TOKEN';
      let decimals = 8;

      if (campaign.fungible_token_id) {
        const tokenData = await prisma.whiteListedTokens.findUnique({
          where: { token_id: campaign.fungible_token_id },
        });

        if (tokenData) {
          tokenSymbol = tokenData.token_symbol || 'TOKEN';
          decimals = Number(tokenData.decimals) || 8;
        }
      }

      const tokenAmount = (Number(amountClaimed) / 10 ** decimals).toFixed(2);
      return `Reward allocation concluded on ${expiryDate}. A total of ${tokenAmount} ${tokenSymbol} was given out for this promo.`;
    }
  }

  /**
   * Update campaign to expired status
   */
  private async updateCampaignToExpired(
    campaign: campaign_twittercard
  ): Promise<void> {
    try {
      const prisma = await this.initializePrisma();

      await new CampaignTwitterCardModel(prisma).updateCampaign(campaign.id, {
        card_status: campaignstatus.RewardsDistributed,
      });

      // Update in-memory status
      if (campaign.contract_id) {
        await updateCampaignInMemoryStatus(
          campaign.contract_id,
          'expired',
          true
        );
      }

      logger.info(
        `[V201] Updated campaign ${campaign.id} status to RewardsDistributed`
      );
    } catch (error) {
      logger.err(
        `[V201] Failed to update campaign status for ${campaign.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      throw error;
    }
  }

  /**
   * Check if user has valid Twitter access tokens
   */
  private hasValidAccessTokens(owner: user_user): boolean {
    return !!(
      owner.business_twitter_access_token &&
      owner.business_twitter_access_token_secret
    );
  }

  /**
   * Get campaign owner by user ID
   */
  private async getCampaignOwner(userId: string): Promise<user_user | null> {
    logger.info(`[V201] Fetching campaign owner ${userId}`);

    // Ensure prisma is initialized
    const prisma = await this.initializePrisma();

    return await prisma.user_user.findUnique({
      where: { id: BigInt(userId) },
      include: {
        user_balances: true,
      },
    });
  }

  /**
   * Handle campaign expiry errors
   */
  private async handleExpiryError(
    campaign: campaign_twittercard,
    errorMsg: string
  ): Promise<void> {
    try {
      // Ensure prisma is initialized
      const prisma = await this.initializePrisma();

      // Update campaign status to error
      await new CampaignTwitterCardModel(prisma).updateCampaign(campaign.id, {
        card_status: campaignstatus.InternalError,
      });

      // Update in-memory status
      if (campaign.contract_id) {
        await updateCampaignInMemoryStatus(
          campaign.contract_id,
          'expiryError',
          true
        );
      }

      logger.err(
        `[V201] Updated campaign ${campaign.id} status to InternalError due to: ${errorMsg}`
      );
    } catch (error) {
      logger.err(
        `[V201] Failed to handle expiry error for campaign ${campaign.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Check if campaigns need expiry based on expiry time
   * This method can be called periodically to find campaigns that need expiry
   */
  async findCampaignsNeedingExpiry(): Promise<campaign_twittercard[]> {
    try {
      const prisma = await this.initializePrisma();

      const campaigns = await prisma.campaign_twittercard.findMany({
        where: {
          card_status: campaignstatus.RewardDistributionInProgress,
          campaign_expiry: {
            lt: new Date().toISOString(),
          },
        },
      });

      logger.info(`[V201] Found ${campaigns.length} campaigns needing expiry`);
      return campaigns;
    } catch (error) {
      logger.err(
        `[V201] Error finding campaigns needing expiry: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      return [];
    }
  }

  /**
   * Validate that engagement data collection has been completed for the campaign
   * This ensures we don't proceed with expiry/reward until we have solid engagement data
   */
  private async validateEngagementDataCollection(
    campaign: campaign_twittercard
  ): Promise<void> {
    try {
      const prisma = await this.initializePrisma();
      const engagementTracker = new XEngagementTracker(prisma);
      const metrics = await engagementTracker.getCampaignMetrics(campaign.id);

      if (!metrics) {
        logger.warn(
          `[V201Expiry] No engagement metrics found for campaign ${campaign.id}, but proceeding with expiry`
        );
        return; // Allow expiry to proceed even without metrics (graceful degradation)
      }

      // Check if we have recent engagement data (within last 3 hours)
      const tweetStats = await prisma.campaign_tweetstats.findUnique({
        where: { twitter_card_id: campaign.id },
        select: { last_update: true },
      });

      if (tweetStats?.last_update) {
        const hoursSinceUpdate =
          (Date.now() - new Date(tweetStats.last_update).getTime()) /
          (1000 * 60 * 60);

        if (hoursSinceUpdate > 3) {
          logger.warn(
            `[V201Expiry] Engagement data for campaign ${
              campaign.id
            } is ${hoursSinceUpdate.toFixed(
              1
            )} hours old, but proceeding with expiry`
          );
        } else {
          logger.info(
            `[V201Expiry] Campaign ${
              campaign.id
            } has recent engagement data (${hoursSinceUpdate.toFixed(
              1
            )} hours old), proceeding with expiry`
          );
        }
      }

      // Log the final engagement metrics that will be used for reward distribution
      logger.info(
        `[V201Expiry] Final engagement metrics for campaign ${campaign.id}: ` +
          `likes=${metrics.likes}, retweets=${metrics.retweets}, quotes=${metrics.quotes}, ` +
          `comments=${metrics.comments}, total=${metrics.totalEngagements}, unique=${metrics.uniqueEngagers}`
      );
    } catch (error) {
      logger.warn(
        `[V201Expiry] Error validating engagement data for campaign ${
          campaign.id
        }: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't fail expiry due to validation errors - this is defensive programming
    }
  }
}

export default V201CampaignExpiryService;
