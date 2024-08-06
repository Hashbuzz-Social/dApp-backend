import { campaign_twittercard , CampaignStatus } from "@prisma/client";
import { addMinutesToTime, formattedDateTime } from "@shared/helper";
import prisma from "@shared/prisma";
import logger from "jet-logger";
import JSONBigInt from "json-bigint";
import { scheduleJob } from "node-schedule";
import { perFormCampaignExpiryOperation } from "./campaign-service";
import CampaignLifeCycleBase, { LYFCycleStages , CardOwner } from "./CampaignLifeCycleBase";
import { closeFungibleAndNFTCampaign } from "./contract-service";
import hederaService from "./hedera-service";
import { performAutoRewardingForEligibleUser } from "./reward-service";
import { closeCampaignSMTransaction } from "./transaction-service";
import twitterCardService from "./twitterCard-service";

const claimDuration = Number(process.env.REWARD_CALIM_DURATION ?? 15);

class CloseCmapignLyfCycle extends CampaignLifeCycleBase {
  protected date = new Date();

  /**
   * Check if the card owner has valid access tokens.
   * @param {CardOwner} cardOwner - The owner of the card.
   * @returns {boolean} True if the owner has valid access tokens, false otherwise.
   */
  private hasValidAccessTokens(cardOwner: CardOwner): boolean {
    return !!(cardOwner && cardOwner.business_twitter_access_token && cardOwner.business_twitter_access_token_secret);
  }

  /**
   * Perform the close campaign operation based on the type of card.
   * @returns {Promise<{ card: Object; message: string }>} The result of the close campaign operation.
   * @throws Will throw an error if the card type is unsupported or if the user has invalid access tokens.
   */
  public async performCloseCampaign() {
    const card = this.ensureCampaignCardLoaded();
    const cardOwner = this.ensureCardOwnerDataLoaded();

    if (!this.hasValidAccessTokens(cardOwner)) {
      throw new Error("Invalid access tokens");
    }

    logger.info(`close campaign operation:::start For id: ${card.id} and NAME:: ${card.name ?? ""} ${card.contract_id!}`);

    let data: { card: Object; message: string };
    if (card.type === "HBAR") {
      data = await this.handleHBARCmapignClosing(card, cardOwner);
    } else if (card.type === "FUNGIBLE") {
      data = await this.handleFungibleCampaignClosing(card, cardOwner);
    } else {
      throw new Error("Unsupported card type");
    }

    this.scheduleRewardDistribution(card);
    return data;
  }

  /**
   * Update the tweet engagements with the given expiry timestamp.
   * @param {number | bigint} id - The ID of the tweet.
   * @param {string} campaignExpiryTimestamp - The expiry timestamp of the campaign.
   * @returns {Promise<void>} A promise that resolves when the update is complete.
   */
  private async updateTweetEngagements(id: number | bigint, campaignExpiryTimestamp: string) {
    await prisma.campaign_tweetengagements.updateMany({
      where: { tweet_id: id },
      data: { exprired_at: campaignExpiryTimestamp },
    });
  }

  /**
   * Perform a smart contract transaction to close an HBAR campaign.
   * @param {campaign_twittercard} card - The campaign card.
   * @returns {Promise<void>} A promise that resolves when the transaction is complete.
   * @throws Will throw an error if card data is invalid.
   */
  private async makeSMTransactionForCloseHBARCampaign(card: campaign_twittercard) {
    if (card.id && card.contract_id) {
      logger.info("Sm transaction for close campaign operation HBAR::" + card.id);
      await closeCampaignSMTransaction(card.id, card.contract_id);
    } else {
      throw new Error("Something went wrong with card data.");
    }
  }

  /**
   * Perform a smart contract transaction to close a fungible campaign.
   * @param {campaign_twittercard} card - The campaign card.
   * @returns {Promise<void>} A promise that resolves when the transaction is complete.
   * @throws Will throw an error if card data is invalid.
   */
  private async makeSMTransactionForCloseFUNGIBLECampaign(card: campaign_twittercard) {
    if (card.owner_id && card.contract_id) {
      logger.info("Sm transaction for close campaign operation FUNGIBLE::" + card.id);
      await closeFungibleAndNFTCampaign(card.fungible_token_id, card.owner_id.toString(), card.contract_id?.toString());
    } else {
      throw new Error("Something went wrong with card data.");
    }
  }

  /**
   * Schedule a job to handle campaign expiry.
   * @param {number | bigint} cardId - The ID of the campaign card.
   * @param {string} campaignExpiryTimestamp - The expiry timestamp of the campaign.
   * @param {string} contract_id - The ID of the contract.
   */
  private scheduleJobForExpiry(cardId: number | bigint, campaignExpiryTimestamp: string, contract_id: string) {
    const expiryDate = new Date(campaignExpiryTimestamp);
    scheduleJob(expiryDate, () => {
      perFormCampaignExpiryOperation(cardId, contract_id);
    });
    logger.info(`Reward expiry timestamp for campaign id::{${cardId}} scheduled at:: { ${expiryDate.toISOString()}}.`);
  }

  /**
   * Handle closing an HBAR campaign.
   * @param {campaign_twittercard} card - The campaign card.
   * @param {CardOwner} cardOwner - The owner of the card.
   * @returns {Promise<{ card: Object; message: string }>} The result of the close campaign operation.
   * @throws Will throw an error if any step in the process fails.
   */
  private async handleHBARCmapignClosing(card: campaign_twittercard, cardOwner: CardOwner) {
    const campaignExpiryTimestamp = addMinutesToTime(this.date.toISOString(), claimDuration);

    try {
      await this.executeCampaignClosingSteps(card, campaignExpiryTimestamp, cardOwner, "HBAR");
      return { card: JSONBigInt.parse(JSONBigInt.stringify(this.campaignCard)), message: "Campaign is closed" };
    } catch (err) {
      await this.handleErrorWhileClosing(card.id, "Failed to close HBAR campaign", err);
      throw err;
    }
  }

  /**
   * Handle closing a fungible campaign.
   * @param {campaign_twittercard} card - The campaign card.
   * @param {CardOwner} cardOwner - The owner of the card.
   * @returns {Promise<{ card: Object; message: string }>} The result of the close campaign operation.
   * @throws Will throw an error if any step in the process fails.
   */
  private async handleFungibleCampaignClosing(card: campaign_twittercard, cardOwner: CardOwner) {
    const campaignExpiryTimestamp = addMinutesToTime(this.date.toISOString(), claimDuration);

    try {
      await this.executeCampaignClosingSteps(card, campaignExpiryTimestamp, cardOwner, "FUNGIBLE");
      return { card: JSONBigInt.parse(JSONBigInt.stringify(this.campaignCard)), message: "Campaign is closed" };
    } catch (err) {
      await this.handleErrorWhileClosing(card.id, "Failed to close Fungible campaign", err);
      throw err;
    }
  }

  /**
   * Execute the steps required to close a campaign and initiate reward distribution.
   * @param {campaign_twittercard} card - The campaign card.
   * @param {string} campaignExpiryTimestamp - The expiry timestamp of the campaign.
   * @param {CardOwner} cardOwner - The owner of the card.
   * @param {string} type - The type of the campaign (e.g., "HBAR", "FUNGIBLE").
   * @throws Will throw an error if any step in the process fails.
   */
  private async executeCampaignClosingSteps(card: campaign_twittercard, campaignExpiryTimestamp: string, cardOwner: CardOwner, type: string) {
    // Step 1: Smart Contract Transaction for campaign close status and start rewarding
    try {
      logger.info(`Starting Smart Contract transaction to close ${type} campaign for card ID: ${card.id}`);
      if (type === "HBAR") {
        await this.makeSMTransactionForCloseHBARCampaign(card);
      } else {
        await this.makeSMTransactionForCloseFUNGIBLECampaign(card);
      }
      logger.info(`Smart Contract transaction successful for ${type} card ID: ${card.id}`);
      await this.updateCampaignStatus(card.contract_id!, `${type.toLowerCase()}SMTransaction`, true, LYFCycleStages.COMPLETED);
    } catch (err) {
      throw new Error(`Failed to perform Smart Contract transaction for ${type} campaign: ${err.message}`);
    }

    // Step 2: Update the engagements of the card for rewarding
    try {
      logger.info(`Updating tweet engagements for card ID: ${card.id}`);
      await this.updateTweetEngagements(card.id, campaignExpiryTimestamp);
      logger.info(`Successfully updated tweet engagements for card ID: ${card.id}`);
      await this.updateCampaignStatus(card.contract_id!, "engagementsStatsUpdate", true, LYFCycleStages.COMPLETED);
    } catch (err) {
      throw new Error(`Failed to update tweet engagements: ${err.message}`);
    }

    // Step 3: Publish reward announcement tweet thread
    try {
      const tweetText = this.getRewardAnnouncementTweetText(type, campaignExpiryTimestamp, card);
      logger.info(`Tweet text for ${type} tweet string count:: ${tweetText.length} And Content:::=> ${tweetText}`);

      const updateThread = await twitterCardService.publishTweetORThread({
        cardOwner,
        isThread: true,
        tweetText,
        parentTweetId: card.last_thread_tweet_id!,
      });
      this.campaignCard = await this.updateCampaignCardToComplete(card.id, updateThread, CampaignStatus.RewardDistributionInProgress,campaignExpiryTimestamp);
      logger.info(`Successfully published reward announcement tweet thread for card ID: ${card.id}`);
      await this.updateCampaignStatus(card.contract_id!, "publishedTweetThread", true, LYFCycleStages.COMPLETED);
    } catch (err) {
      throw new Error(`Failed to publish reward announcement tweet thread: ${err.message}`);
    }

    this.scheduleJobForExpiry(card.id, campaignExpiryTimestamp, card.contract_id!);
    logger.info(`Scheduled job for expiry for card ID: ${card.id}`);
  }

  /**
   * Generate the reward announcement tweet text.
   * @param {string} type - The type of the campaign (e.g., "HBAR", "FUNGIBLE").
   * @param {string} campaignExpiryTimestamp - The expiry timestamp of the campaign.
   * @param {campaign_twittercard} card - The campaign card.
   * @returns {string} The generated tweet text.
   */
  private getRewardAnnouncementTweetText(type: string, campaignExpiryTimestamp: string, card: campaign_twittercard): string {
    if (type === "HBAR") {
      return `Promo ended on ${formattedDateTime(campaignExpiryTimestamp)}. Rewards allocation for the next ${claimDuration} minutes. New users: log into ${hederaService.network === "testnet" ? "https://testnet.hashbuzz.social" : "https://hashbuzz.social"}, link Personal X account. Then go to Claim Rewards to start the claim.`;
    } else {
      return `Promo ended on ${formattedDateTime(campaignExpiryTimestamp)}. Rewards allocation for the next ${claimDuration} minutes. New users: log into ${hederaService.network === "testnet" ? "https://testnet.hashbuzz.social" : "https://hashbuzz.social"}, link Personal X account and associate token with ID ${card.fungible_token_id ?? ""} to your wallet.`;
    }
  }

  /**
   * Schedule the reward distribution for the campaign.
   * @param {campaign_twittercard} card - The campaign card.
   */
  private scheduleRewardDistribution(card: campaign_twittercard) {
    const rewardDistributeTime = new Date(addMinutesToTime(this.date.toISOString(), 1));
    scheduleJob(rewardDistributeTime, () => {
      logger.info("Reward distribution scheduled at::" + rewardDistributeTime.toISOString());
      performAutoRewardingForEligibleUser(card.id);
    });
  }

  /**
   * Handle errors that occur while closing a campaign.
   * @param {number | bigint} cardId - The ID of the campaign card.
   * @param {string} message - The error message.
   * @param {any} error - The error object.
   * @throws Will throw a new error with the provided message and original error.
   */
  private async handleErrorWhileClosing(cardId: number | bigint, message: string, error: any) {
    logger.err(
      `${message} for card ID: ${cardId} 
              Error::: ${error}`
    );
    await this.updateCampaignStatus(this.campaignCard?.contract_id!, undefined, false, LYFCycleStages.COMPLETED);
    await this.handleError(this.campaignCard?.id!, message, error);
    throw new Error(`${message}: ${error.message}`);
  }
}

export default CloseCmapignLyfCycle;
