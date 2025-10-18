import {
  campaign_twittercard,
  campaignstatus as CampaignStatus,
} from '@prisma/client';
import {
  expiryFungibleCampaign as fungibleSMExpiryCall,
  expiryCampaign as habrSMExpiryCampaignCall,
  queryFungibleBalanceOfCampaigner,
} from '@services/contract-service';
import userService from '@services/user-service';
import { formattedDateTime } from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import logger from 'jet-logger';
import CampaignLifeCycleBase, { CardOwner } from './CampaignLifeCycleBase';
import { performAutoRewardingForEligibleUser } from './reward-service';
import twitterCardService from './twitterCard-service';

/**
 * Class representing the campaign expiry operations.
 * Extends the CampaignLifeCycleBase class to handle campaign lifecycle operations.
 */
class CampaignExpiryOperation extends CampaignLifeCycleBase {
  private date = new Date();
  private requestId: string;

  constructor(redisServerUrl: string) {
    super(redisServerUrl);
    this.requestId = `expire_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  /**
   * Perform the campaign expiry operation.
   * Loads the campaign card and owner data, checks for valid access tokens,
   * and handles the expiry based on the campaign type (HBAR or FUNGIBLE).
   */
  public async performCampaignExpiryOperation() {
    const card = this.ensureCampaignCardLoaded();
    const cardOwner = this.ensureCardOwnerDataLoaded();

    try {
      logger.info(
        `[${this.requestId}] Campaign expiry operation started for campaign ID: ${card.id}`
      );

      this.logCampaignEvent(
        card.id,
        'EXPIRY_INITIATED',
        `Campaign expiry process started for campaign ${card.id}`,
        'INFO',
        {
          requestId: this.requestId,
          campaignType: card.type || 'UNKNOWN',
          campaignStatus: card.card_status,
        }
      );

      // Perform final reward distribution for eligible users
      logger.info(
        `[${this.requestId}] Processing final rewards for eligible users`
      );
      await this.logAndExecute(
        'FINAL_REWARDS',
        'Processing final rewards for eligible users',
        () => performAutoRewardingForEligibleUser(card.id),
        card.id
      );

      if (this.hasValidAccessTokens(cardOwner)) {
        const campaignType = card.type || 'UNKNOWN';
        if (campaignType === 'HBAR') {
          await this.handleHBARExpiry(card, cardOwner);
        } else if (campaignType === 'FUNGIBLE') {
          await this.handleFungibleExpiry(card, cardOwner);
        } else {
          throw new Error(`Unsupported campaign type: ${campaignType}`);
        }
      } else {
        throw new Error('Invalid access tokens for campaign owner');
      }

      this.logCampaignEvent(
        card.id,
        'EXPIRY_COMPLETED',
        `Campaign expiry process completed successfully for campaign ${card.id}`,
        'INFO',
        {
          requestId: this.requestId,
          finalStatus: CampaignStatus.RewardsDistributed,
        }
      );

      logger.info(
        `[${this.requestId}] Campaign expiry operation completed successfully for campaign ID: ${card.id}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.err(
        `[${this.requestId}] Campaign expiry operation failed for campaign ID: ${card.id}: ${errorMessage}`
      );

      this.logCampaignEvent(
        card.id,
        'EXPIRY_FAILED',
        `Campaign expiry process failed: ${errorMessage}`,
        'ERROR',
        {
          requestId: this.requestId,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        }
      );

      throw error;
    }
  }

  /**
   * Simple logging helper for campaign events
   */
  private logCampaignEvent(
    campaignId: bigint,
    status: string,
    message: string,
    level: 'INFO' | 'ERROR' | 'WARN',
    metadata?: Record<string, any>
  ): void {
    const logData = {
      timestamp: new Date().toISOString(),
      campaignId: campaignId.toString(),
      status,
      message,
      level,
      metadata: metadata || {},
    };

    if (level === 'ERROR') {
      logger.err(`[CAMPAIGN_LOG] ${JSON.stringify(logData)}`);
    } else if (level === 'WARN') {
      logger.warn(`[CAMPAIGN_LOG] ${JSON.stringify(logData)}`);
    } else {
      logger.info(`[CAMPAIGN_LOG] ${JSON.stringify(logData)}`);
    }
  }

  /**
   * Helper method to log and execute operations with consistent error handling
   */
  private async logAndExecute<T>(
    operation: string,
    description: string,
    executeFunction: () => Promise<T>,
    campaignId: bigint,
    metadata?: Record<string, any>
  ): Promise<T> {
    try {
      logger.info(`[${this.requestId}] ${operation}: ${description}`);

      this.logCampaignEvent(
        campaignId,
        `${operation}_STARTED`,
        `${description} - Started`,
        'INFO',
        {
          requestId: this.requestId,
          operation,
          ...metadata,
        }
      );

      const result = await executeFunction();

      this.logCampaignEvent(
        campaignId,
        `${operation}_COMPLETED`,
        `${description} - Completed successfully`,
        'INFO',
        {
          requestId: this.requestId,
          operation,
          ...metadata,
        }
      );

      logger.info(
        `[${this.requestId}] ${operation}: ${description} - Completed`
      );
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.err(
        `[${this.requestId}] ${operation}: ${description} - Failed: ${errorMessage}`
      );

      this.logCampaignEvent(
        campaignId,
        `${operation}_FAILED`,
        `${description} - Failed: ${errorMessage}`,
        'ERROR',
        {
          requestId: this.requestId,
          operation,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
          ...metadata,
        }
      );

      throw new Error(`${operation} failed: ${errorMessage}`);
    }
  }

  /**
   * Check if the card owner has valid access tokens.
   * @param {CardOwner} cardOwner - The card owner data.
   * @returns {boolean} True if the card owner has valid access tokens, otherwise false.
   */
  private hasValidAccessTokens(cardOwner: CardOwner): boolean {
    return !!(
      cardOwner &&
      cardOwner.business_twitter_access_token &&
      cardOwner.business_twitter_access_token_secret
    );
  }

  /**
   * Handle the expiry of an HBAR campaign.
   * Performs the necessary operations to expire the HBAR campaign,
   * update the user balance, and publish a tweet about the expiry.
   * @param {campaign_twittercard} card - The campaign card data.
   * @param {CardOwner} cardOwner - The card owner data.
   */
  private async handleHBARExpiry(
    card: campaign_twittercard,
    cardOwner: CardOwner
  ) {
    try {
      logger.info(
        `[${this.requestId}] Starting HBAR expiry for campaign ID: ${card.id}`
      );
      let balances = 0;

      // Step 1: Smart Contract Transaction for HBAR expiry
      await this.logAndExecute(
        'HBAR_CONTRACT_EXPIRY',
        'Executing HBAR smart contract expiry transaction',
        async () => {
          const response = await habrSMExpiryCampaignCall(card, cardOwner);
          if (response && 'result' in response && response.result) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const decodedResult = response.result as any;
            if (Array.isArray(decodedResult) && decodedResult.length > 0) {
              balances = Number(decodedResult[0]);
              logger.info(
                `[${this.requestId}] Retrieved balance from contract: ${balances}`
              );
            }
          }
          return response;
        },
        card.id,
        { contractType: 'HBAR', balancesRetrieved: balances }
      );

      // Step 2: Update user balance
      if (balances > 0) {
        await this.logAndExecute(
          'USER_BALANCE_UPDATE',
          `Updating user balance with ${balances} HBAR`,
          () => userService.topUp(cardOwner.id, balances, 'update'),
          card.id,
          { balanceAmount: balances, userId: cardOwner.id }
        );
      } else {
        logger.info(
          `[${this.requestId}] No balance to update for user ${cardOwner.id}`
        );
      }

      // Step 3: Publish reward announcement tweet thread
      const expiryCampaignText = `Reward allocation concluded on ${formattedDateTime(
        this.date.toISOString()
      )}. A total of ${((card.amount_claimed ?? 0) / 1e8).toFixed(
        2
      )} HBAR was given out for this promo.`;

      const last_tweet_id = await this.logAndExecute(
        'TWEET_PUBLICATION',
        'Publishing reward announcement tweet thread',
        () =>
          twitterCardService.publishTweetORThread({
            tweetText: expiryCampaignText,
            isThread: true,
            parentTweetId: card.last_thread_tweet_id ?? undefined,
            cardOwner,
          }),
        card.id,
        { tweetText: expiryCampaignText, isThread: true }
      );

      // Step 4: Update card status as expired in DB
      await this.logAndExecute(
        'CAMPAIGN_STATUS_UPDATE',
        'Updating campaign status to RewardsDistributed',
        async () => {
          this.campaignCard = await this.updateCampaignCardToComplete(
            card.id,
            last_tweet_id,
            CampaignStatus.RewardsDistributed
          );
          return this.campaignCard;
        },
        card.id,
        {
          newStatus: CampaignStatus.RewardsDistributed,
          lastTweetId: last_tweet_id,
        }
      );

      logger.info(
        `[${this.requestId}] HBAR expiry completed successfully for campaign ID: ${card.id}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.err(
        `[${this.requestId}] HBAR expiry failed for campaign ID: ${card.id}: ${errorMessage}`
      );

      this.logCampaignEvent(
        card.id,
        'HBAR_EXPIRY_FAILED',
        `HBAR campaign expiry failed: ${errorMessage}`,
        'ERROR',
        {
          requestId: this.requestId,
          campaignType: 'HBAR',
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        }
      );

      throw error;
    }
  }

  /**
   * Handle the expiry of a fungible token campaign.
   * Performs the necessary operations to expire the fungible token campaign,
   * update the user balance, and publish a tweet about the expiry.
   * @param {campaign_twittercard} card - The campaign card data.
   * @param {CardOwner} cardOwner - The card owner data.
   */
  private async handleFungibleExpiry(
    card: campaign_twittercard,
    cardOwner: CardOwner
  ) {
    const prisma = await createPrismaClient();
    let campaigner_balances = 0;

    try {
      logger.info(
        `[${this.requestId}] Starting FUNGIBLE expiry for campaign ID: ${card.id}`
      );

      // Step 1: Smart Contract Transaction for FUNGIBLE expiry
      await this.logAndExecute(
        'FUNGIBLE_CONTRACT_EXPIRY',
        'Executing fungible token smart contract expiry transaction',
        () => fungibleSMExpiryCall(card, cardOwner),
        card.id,
        { contractType: 'FUNGIBLE', tokenId: card.fungible_token_id }
      );

      // Step 2: Query Balance from Smart Contract
      if (!card.fungible_token_id) {
        throw new Error('Fungible token ID is required for balance query');
      }

      campaigner_balances = await this.logAndExecute(
        'BALANCE_QUERY',
        `Querying fungible token balance for token ${card.fungible_token_id}`,
        async () => {
          const balance = Number(
            await queryFungibleBalanceOfCampaigner(
              cardOwner.hedera_wallet_id,
              card.fungible_token_id as string
            )
          );
          logger.info(`[${this.requestId}] Retrieved balance: ${balance}`);
          return balance;
        },
        card.id,
        {
          tokenId: card.fungible_token_id,
          walletId: cardOwner.hedera_wallet_id,
        }
      );

      // Step 3: Update user balance
      await this.logAndExecute(
        'FUNGIBLE_BALANCE_UPDATE',
        'Updating user fungible token balance',
        async () => {
          if (this.tokenData) {
            const balanceRecord = cardOwner.user_balances.find(
              (bal) => bal.token_id === this.tokenData?.id
            );

            const currentBalance = Number(balanceRecord?.entity_balance || 0);
            if (currentBalance !== campaigner_balances) {
              logger.warn(
                `[${this.requestId}] Balance difference detected - updating from ${currentBalance} to ${campaigner_balances}`
              );

              await prisma.user_balances.update({
                where: { id: balanceRecord?.id },
                data: {
                  entity_balance: campaigner_balances,
                },
              });

              logger.info(`[${this.requestId}] Updated user balance record`);
            } else {
              logger.info(
                `[${this.requestId}] No balance change detected - skipping update`
              );
            }
          }
        },
        card.id,
        {
          newBalance: campaigner_balances,
          tokenId: this.tokenData?.id,
          userId: cardOwner.id,
        }
      );

      // Step 4: Publish reward announcement tweet thread
      const tweetThread = `Reward allocation concluded on ${formattedDateTime(
        this.date.toISOString()
      )}. A total of ${(
        (card.amount_claimed ?? 0) /
        10 ** (card.decimals?.toNumber() ?? 0)
      ).toFixed(2)} ${
        this.tokenData?.token_symbol ?? 'HBAR'
      } was given out for this promo.`;

      const last_tweet_id = await this.logAndExecute(
        'TWEET_PUBLICATION',
        'Publishing fungible token reward announcement tweet thread',
        () =>
          twitterCardService.publishTweetORThread({
            tweetText: tweetThread,
            cardOwner,
            isThread: true,
            parentTweetId: card.last_thread_tweet_id || undefined,
          }),
        card.id,
        {
          tweetText: tweetThread,
          isThread: true,
          tokenSymbol: this.tokenData?.token_symbol,
        }
      );

      // Step 5: Update card status as expired in DB
      await this.logAndExecute(
        'CAMPAIGN_STATUS_UPDATE',
        'Updating campaign status to RewardsDistributed',
        async () => {
          this.campaignCard = await this.updateCampaignCardToComplete(
            card.id,
            last_tweet_id,
            CampaignStatus.RewardsDistributed
          );
          return this.campaignCard;
        },
        card.id,
        {
          newStatus: CampaignStatus.RewardsDistributed,
          lastTweetId: last_tweet_id,
        }
      );

      logger.info(
        `[${this.requestId}] FUNGIBLE expiry completed successfully for campaign ID: ${card.id}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.err(
        `[${this.requestId}] FUNGIBLE expiry failed for campaign ID: ${card.id}: ${errorMessage}`
      );

      this.logCampaignEvent(
        card.id,
        'FUNGIBLE_EXPIRY_FAILED',
        `Fungible token campaign expiry failed: ${errorMessage}`,
        'ERROR',
        {
          requestId: this.requestId,
          campaignType: 'FUNGIBLE',
          tokenId: card.fungible_token_id,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        }
      );

      throw error;
    }
  }
}

export default CampaignExpiryOperation;
