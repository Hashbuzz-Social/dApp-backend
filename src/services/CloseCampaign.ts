import { campaign_twittercard, user_user } from "@prisma/client";
import CampaignLifeCycleBase, { LYFCycleStages } from "./CampaignLifeCycleBase";
import logger from "jet-logger";
import { addMinutesToTime, formattedDateTime } from "@shared/helper";
import hederaService from "./hedera-service";
import twitterCardService from "./twitterCard-service";
import prisma from "@shared/prisma";
import { scheduleJob } from "node-schedule";
import { closeCampaignSMTransaction } from "./transaction-service";
import { perFormCampaignExpiryOperation } from "./campaign-service";
import JSONBigInt from "json-bigint";
import { closeFungibleAndNFTCampaign } from "./contract-service";
import { performAutoRewardingForEligibleUser } from "./reward-service";

const claimDuration = Number(process.env.REWARD_CALIM_DURATION ?? 15);

class CloseCmapignLyfCycle extends CampaignLifeCycleBase {
  protected date = new Date();

  private hasValidAccessTokens(cardOwner: user_user): boolean {
    return !!(cardOwner && cardOwner.business_twitter_access_token && cardOwner.business_twitter_access_token_secret);
  }

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

  private async updateCampaignCardToComplete(id: number | bigint, campaignExpiryTimestamp: string, last_thread_tweet_id: string) {
    return await prisma.campaign_twittercard.update({
      where: { id },
      data: {
        campaign_expiry: campaignExpiryTimestamp,
        card_status: "Campaign Complete, Initiating Rewards",
        last_thread_tweet_id,
      },
    });
  }

  private async updateTweetEngagements(id: number | bigint, campaignExpiryTimestamp: string) {
    return await prisma.campaign_tweetengagements.updateMany({
      where: { tweet_id: id },
      data: { exprired_at: campaignExpiryTimestamp },
    });
  }

  private async makeSMTransactionForCloseHBARCampaign(card: campaign_twittercard) {
    if (card.id && card.contract_id) {
      logger.info("Sm transaction for close campaign operation HBAR::" + card.id);
      return await closeCampaignSMTransaction(card.id, card.contract_id);
    }
    throw new Error("Something went wrong with card data.");
  }

  private async makeSMTransactionForCloseFUNGIBLECampaign(card: campaign_twittercard) {
    if (card.owner_id && card.contract_id) {
      logger.info("Sm transaction for close campaign operation FUNGIBLE::" + card.id);
      return closeFungibleAndNFTCampaign(card.fungible_token_id, card.owner_id.toString(), card.contract_id?.toString());
    }
  }

  private async scheduleJobForExpiry(cardId: number | bigint, campaignExpiryTimestamp: string, contract_id: string) {
    const expiryDate = new Date(campaignExpiryTimestamp);
    scheduleJob(expiryDate, () => {
      perFormCampaignExpiryOperation(cardId, contract_id);
    });
    logger.info(`Reward expiry timestamp for campaign id::{${cardId}} scheduled at:: { ${expiryDate.toISOString()}}.`);
  }

  private async handleHBARCmapignClosing(card: campaign_twittercard, cardOwner: user_user) {
    const campaignExpiryTimestamp = addMinutesToTime(this.date.toISOString(), claimDuration);

    try {
      await this.executeCampaignClosingSteps(card, campaignExpiryTimestamp, cardOwner, "HBAR");
      return { card: JSONBigInt.parse(JSONBigInt.stringify(this.campaignCard)), message: "Campaign is closed" };
    } catch (err) {
      await this.handleErrorWhileClosing(card.id, "Failed to close HBAR campaign", err);
      throw err;
    }
  }

  private async handleFungibleCampaignClosing(card: campaign_twittercard, cardOwner: user_user) {
    const campaignExpiryTimestamp = addMinutesToTime(this.date.toISOString(), claimDuration);

    try {
      await this.executeCampaignClosingSteps(card, campaignExpiryTimestamp, cardOwner, "FUNGIBLE");
      return { card: JSONBigInt.parse(JSONBigInt.stringify(this.campaignCard)), message: "Campaign is closed" };
    } catch (err) {
      await this.handleErrorWhileClosing(card.id, "Failed to close Fungible campaign", err);
      throw err;
    }
  }

  private async executeCampaignClosingSteps(card: campaign_twittercard, campaignExpiryTimestamp: string, cardOwner: user_user, type: string) {
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
      const tweetText = this.getRewardAnnouncementTweetText(card, type);
      logger.info(`Tweet text for ${type} campaign tweet string count:: ${tweetText.length} And Content:::=> ${tweetText}`);
      const updateThread = await twitterCardService.publishTweetORThread({
        cardOwner,
        isThread: true,
        tweetText,
        parentTweetId: card.last_thread_tweet_id!,
      });
      this.campaignCard = await this.updateCampaignCardToComplete(card.id, campaignExpiryTimestamp, updateThread);
      logger.info(`Successfully published reward announcement tweet thread for card ID: ${card.id}`);
      await this.updateCampaignStatus(card.contract_id!, "publishedTweetThread", true, LYFCycleStages.COMPLETED);
    } catch (err) {
      throw new Error(`Failed to publish reward announcement tweet thread: ${err.message}`);
    }

    this.scheduleJobForExpiry(card.id, campaignExpiryTimestamp, card.contract_id!);
    logger.info(`Scheduled job for expiry for card ID: ${card.id}`);
  }

  private getRewardAnnouncementTweetText(card: campaign_twittercard, type: string): string {
    if (type === "HBAR") {
      return `Promo ended on ${formattedDateTime(this.date.toISOString())}. Rewards allocation for the next ${claimDuration} minutes. New users: log into ${hederaService.network === "testnet" ? "https://testnet.hashbuzz.social" : "https://hashbuzz.social"}, link Personal X account. Then go to Claim Rewards to start the claim.`;
    }
    return `Promo ended on ${formattedDateTime(this.date.toISOString())}. Rewards allocation for the next ${claimDuration} minutes. New users: log into ${hederaService.network === "testnet" ? "https://testnet.hashbuzz.social" : "https://hashbuzz.social"}, link Personal X account and associate token with ID ${card.fungible_token_id ?? ""} to your wallet.`;
  }

  private scheduleRewardDistribution = (card: campaign_twittercard) => {
    const rewardDistributeTime = new Date(addMinutesToTime(this.date.toISOString(), 1));
    scheduleJob(rewardDistributeTime, () => {
      logger.info("Reward distribution scheduled at::" + rewardDistributeTime.toISOString());
      performAutoRewardingForEligibleUser(card.id);
    });
  };

  private async handleErrorWhileClosing(cardId: number | bigint, message: string, error: any) {
    logger.err(`${message} for card ID: ${cardId}. Error::: ${error}`);
    await this.updateCampaignStatus(this.campaignCard?.contract_id!, undefined, false, LYFCycleStages.COMPLETED);
    await this.handleError(this.campaignCard?.id!, message, error);
    throw new Error(`${message}: ${error.message}`);
  }
}

export default CloseCmapignLyfCycle;
