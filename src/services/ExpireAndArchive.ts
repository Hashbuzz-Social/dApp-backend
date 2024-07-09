import { campaign_twittercard, user_user } from "@prisma/client";
import { expiryFungibleCampaign as fungibleSMExpiryCall, expiryCampaign as habrSMExpriryCampaignCall } from "@services/contract-service";
import { queryBalance as queryBalaceFromSM, queryFungibleBalance as queryFungibleBalaceFromSM } from "@services/smartcontract-service";
import userService from "@services/user-service";
import { formattedDateTime } from "@shared/helper";
import logger from "jet-logger";
import CampaignLifeCycleBase from "./CampaignLifeCycleBase";
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
    const card = await this.ensureCampaignCardLoaded();
    const cardOwner = await this.ensureCardOwnerDataLoaded();

    logger.info(`Campaign expiry operation started for id::: ${card.id} `);

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
   * @param {user_user} cardOwner - The card owner data.
   * @returns {boolean} True if the card owner has valid access tokens, otherwise false.
   */
  private hasValidAccessTokens(cardOwner: user_user): boolean {
    return !!(cardOwner && cardOwner.business_twitter_access_token && cardOwner.business_twitter_access_token_secret);
  }

  /**
   * Handle the expiry of an HBAR campaign.
   * Performs the necessary operations to expire the HBAR campaign,
   * update the user balance, and publish a tweet about the expiry.
   * @param {campaign_twittercard} card - The campaign card data.
   * @param {user_user} cardOwner - The card owner data.
   */
  private async handleHBARExpiry(card: campaign_twittercard, cardOwner: user_user) {
    // Performed SM transaction to enable expiry on the contract;
    await habrSMExpriryCampaignCall(card, cardOwner);

    // Balance Queried from SM for the user;
    const balances = await queryBalaceFromSM(cardOwner.hedera_wallet_id);

    // Update the user balance after campaign expiry
    if (balances?.balances) {
      await userService.topUp(cardOwner.id, parseInt(balances.balances), "update");
    }

    const expiryCampaignText = `Reward allocation concluded on ${formattedDateTime(this.date.toISOString())}. A total of ${((card.amount_claimed ?? 0) / 1e8).toFixed(2)} HBAR was given out for this promo.`;

    const last_tweet_id = await twitterCardService.publishTweetORThread({
      tweetText: expiryCampaignText,
      isThread: true,
      parentTweetId: card.last_thread_tweet_id!,
      cardOwner,
    });

    // Update card status as expired in DB...
    this.campaignCard = await this.updateCampaignCardToComplete(card.id, last_tweet_id, "Rewards Disbursed");
  }

  /**
   * Handle the expiry of a fungible token campaign.
   * Performs the necessary operations to expire the fungible token campaign,
   * update the user balance, and publish a tweet about the expiry.
   * @param {campaign_twittercard} card - The campaign card data.
   * @param {user_user} cardOwner - The card owner data.
   */
  private async handleFungibleExpiry(card: campaign_twittercard, cardOwner: user_user) {
    // Fungible SM call for expiry operation
    await fungibleSMExpiryCall(card, cardOwner);

    // Fetch balance for the user as the fungible data;
    const balances = await queryFungibleBalaceFromSM(cardOwner.hedera_wallet_id, card.fungible_token_id!);

    if (this.tokenData) {
      // Update data in the balance for user;
      await userService.updateTokenBalanceForUser({
        amount: Number(balances),
        operation: "increment",
        token_id: this.tokenData.id,
        decimal: Number(this.tokenData.decimals),
        user_id: cardOwner.id,
      });
    }

    const tweetThread = `Reward allocation concluded on ${formattedDateTime(this.date.toISOString())}. A total of ${((card.amount_claimed ?? 0) / 10 ** card.decimals?.toNumber()!).toFixed(2)} ${this.tokenData?.token_symbol ?? "HBAR"} was given out for this promo.`;

    const last_tweet_id = await twitterCardService.publishTweetORThread({
      tweetText: tweetThread,
      cardOwner,
      isThread: true,
      parentTweetId: card.last_thread_tweet_id!,
    });

    logger.info(`Expiry Campaign Token Tweet text length of ${tweetThread.length} :::: ${tweetThread}`);

    // Update card status as expired in DB...
    this.campaignCard = await this.updateCampaignCardToComplete(card.id, last_tweet_id, "Rewards Disbursed");
  }
}

export default CampaignExpiryOperation;
