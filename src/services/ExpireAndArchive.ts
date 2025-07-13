import { campaign_twittercard, campaignstatus as CampaignStatus } from "@prisma/client";
import { expiryFungibleCampaign as fungibleSMExpiryCall, expiryCampaign as habrSMExpriryCampaignCall, queryFungibleBalanceOfCampaigner } from "@services/contract-service";
import userService from "@services/user-service";
import { formattedDateTime } from "@shared/helper";
import createPrismaClient from "@shared/prisma";
import logger from "jet-logger";
import CampaignLifeCycleBase, { CardOwner } from "./CampaignLifeCycleBase";
import { performAutoRewardingForEligibleUser } from "./reward-service";
import twitterCardService from "./twitterCard-service";

/**
 * Class representing the campaign expiry operations.
 * Extends the CampaignLifeCycleBase class to handle campaign lifecyclOe operations.
 */
class CampaignExpiryOperation extends CampaignLifeCycleBase {
  private date = new Date();

  /**
   * Perform the campaign expiry operation.
   * Loads the campaign card and owner data, checks for valid access tokens,
   * and handles the expiry based on the campaign type (HBAR or FUNGIBLE).
   */
  public async performCampaignExpiryOperation() {
    const card = this.ensureCampaignCardLoaded();
    const cardOwner = this.ensureCardOwnerDataLoaded();

    logger.info(`Campaign expiry operation started for id::: ${card.id} `);

    logger.info("Reward again for last mile eligible user");
    await performAutoRewardingForEligibleUser(card.id);

    if (this.hasValidAccessTokens(cardOwner)) {
      if (card.type === "HBAR") {
        await this.handleHBARExpiry(card, cardOwner);
      } else if (card.type === "FUNGIBLE") {
        await this.handleFungibleExpiry(card, cardOwner);
      }
    }
  }

  /**
   * Check if the card owner has valid access tokens.
   * @param {CardOwner} cardOwner - The card owner data.
   * @returns {boolean} True if the card owner has valid access tokens, otherwise false.
   */
  private hasValidAccessTokens(cardOwner: CardOwner): boolean {
    return !!(cardOwner && cardOwner.business_twitter_access_token && cardOwner.business_twitter_access_token_secret);
  }

  /**
   * Handle the expiry of an HBAR campaign.
   * Performs the necessary operations to expire the HBAR campaign,
   * update the user balance, and publish a tweet about the expiry.
   * @param {campaign_twittercard} card - The campaign card data.
   * @param {CardOwner} cardOwner - The card owner data.
   */
  private async handleHBARExpiry(card: campaign_twittercard, cardOwner: CardOwner) {
    try {
      logger.info(`Performing HBAR expiry for card ID: ${card.id}`);
      let balances = 0;
      // Step 1: Smart Contract Transaction for HBAR expiry
      try {
        const expiryresponse = await habrSMExpriryCampaignCall(card, cardOwner);
        if ('dataDecoded' in expiryresponse && expiryresponse.dataDecoded) {
          balances = Number(expiryresponse.dataDecoded[0]);
        }
        logger.info(`HBAR Smart Contract transaction successful for card ID: ${card.id}`);
      } catch (err) {
        throw new Error(`Failed to perform HBAR Smart Contract transaction: ${err.message}`);
      }

      // Step 3: Update user balance
      try {
        if (balances) {
          await userService.topUp(cardOwner.id, balances, "update");
          logger.info(`Updated user balance for card owner ID: ${cardOwner.id}`);
        }
      } catch (err) {
        throw new Error(`Failed to update user balance: ${err.message}`);
      }

      // Step 4: Publish reward announcement tweet thread
      let last_tweet_id;
      try {
        const expiryCampaignText = `Reward allocation concluded on ${formattedDateTime(this.date.toISOString())}. A total of ${((card.amount_claimed ?? 0) / 1e8).toFixed(2)} HBAR was given out for this promo.`;
        last_tweet_id = await twitterCardService.publishTweetORThread({
          tweetText: expiryCampaignText,
          isThread: true,
          parentTweetId: card.last_thread_tweet_id!,
          cardOwner,
        });
        logger.info(`Published reward announcement tweet thread for card ID: ${card.id}`);
      } catch (err) {
        throw new Error(`Failed to publish reward announcement tweet thread: ${err.message}`);
      }

      // Step 5: Update card status as expired in DB
      try {
        this.campaignCard = await this.updateCampaignCardToComplete(card.id, last_tweet_id, CampaignStatus.RewardsDistributed);
        logger.info(`Updated campaign card status to expired for card ID: ${card.id}`);
      } catch (err) {
        throw new Error(`Failed to update campaign card status: ${err.message}`);
      }
    } catch (err) {
      logger.err(`Error during HBAR expiry for card ID: ${card.id}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Handle the expiry of a fungible token campaign.
   * Performs the necessary operations to expire the fungible token campaign,
   * update the user balance, and publish a tweet about the expiry.
   * @param {campaign_twittercard} card - The campaign card data.
   * @param {CardOwner} cardOwner - The card owner data.
   */
  private async handleFungibleExpiry(card: campaign_twittercard, cardOwner: CardOwner) {
    const prisma = await createPrismaClient();
    let camapigner_balances = 0;

    try {
      logger.info(`Performing FUNGIBLE expiry for card ID: ${card.id}`);

      // Step 1: Smart Contract Transaction for FUNGIBLE expiry
      try {
        await fungibleSMExpiryCall(card, cardOwner);
        logger.info(`FUNGIBLE Smart Contract transaction successful for card ID: ${card.id}`);
      } catch (err) {
        console.log(err);
        throw new Error(`Failed to perform FUNGIBLE Smart Contract transaction: ${err.message}`);
      }

      // Step 2: Query Balance from Smart Contract
      try {
        camapigner_balances = Number(await queryFungibleBalanceOfCampaigner(cardOwner.hedera_wallet_id, card.fungible_token_id!));
        logger.info(`Queried balance from Smart Contract for card owner ID: ${cardOwner.id} having balamce is:: ${camapigner_balances}`);
      } catch (err) {
        throw new Error(`Failed to query balance from Smart Contract: ${err.message}`);
      }

      // Step 3: Update user balance
      try {
        if (this.tokenData) {
          const balanceRecord = cardOwner.user_balances.find((bal) => bal.token_id === this.tokenData?.id);
          if (Number(balanceRecord?.entity_balance) !== camapigner_balances) {
            logger.warn("Campaagner balance diff is found");

            // update the balance record to DB;
            const totalBal = camapigner_balances;
            await prisma.user_balances.update({
              where: { id: balanceRecord?.id },
              data: {
                entity_balance: totalBal,
              },
            });
          } else {
            logger.info("No chnage in balance no need to update.");
          }
          logger.info(`Updated user balance for card owner ID: ${cardOwner.id}`);
        }
      } catch (err) {
        throw new Error(`Failed to update user balance: ${err.message}`);
      }

      // Step 4: Publish reward announcement tweet thread
      let last_tweet_id;
      try {
        const tweetThread = `Reward allocation concluded on ${formattedDateTime(this.date.toISOString())}. A total of ${((card.amount_claimed ?? 0) / 10 ** card.decimals?.toNumber()!).toFixed(2)} ${this.tokenData?.token_symbol ?? "HBAR"} was given out for this promo.`;
        last_tweet_id = await twitterCardService.publishTweetORThread({
          tweetText: tweetThread,
          cardOwner,
          isThread: true,
          parentTweetId: card.last_thread_tweet_id!,
        });
        logger.info(`Published reward announcement tweet thread for card ID: ${card.id}`);
      } catch (err) {
        throw new Error(`Failed to publish reward announcement tweet thread: ${err.message}`);
      }

      // Step 5: Update card status as expired in DB
      try {
        this.campaignCard = await this.updateCampaignCardToComplete(card.id, last_tweet_id, CampaignStatus.RewardsDistributed);
        logger.info(`Updated campaign card status to expired for card ID: ${card.id}`);
      } catch (err) {
        throw new Error(`Failed to update campaign card status: ${err.message}`);
      }
    } catch (err) {
      logger.err(`Error during FUNGIBLE expiry for card ID: ${card.id}: ${err.message}`);
      throw err;
    }
  }
}

export default CampaignExpiryOperation;
