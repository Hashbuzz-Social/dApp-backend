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
  private hasValidAccessTokens(card_owner: user_user): boolean {
    return !!(card_owner && card_owner.business_twitter_access_token && card_owner.business_twitter_access_token_secret);
  }

  public async performCloseCampaign() {
    const card = this.ensureCampaignCardLoaded();
    const cardOwner = this.ensureCardOwnerDataLoaded();

    let data: { card: Object; message: string } = { card: {}, message: "" }; // Default initialization

    if (this.hasValidAccessTokens(cardOwner)) {
      logger.info(`close campaign operation:::start For id: ${card.id} and NAME:: ${card.name ?? ""} ${card.contract_id!}`);
      // const campaignExpiry = addMinutesToTime(this.date.toISOString(), claimDuration);
      if (card.type === "HBAR") {
        data = await this.handleHBARCmapignClosing(card, cardOwner);
      } else if (card.type === "FUNGIBLE") {
        data = await this.handleFungibleCampaignClosing(card, cardOwner);
      } else {
        throw new Error("Unsupported card type"); // Optional: handle unexpected card types
      }

      this.scheduleRewardDistribution(card);
      return data;
    } else {
      throw new Error("Invalid access tokens"); // Optional: handle cases where the user does not have valid access tokens
    }
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
      logger.info("Sm tranaction for close campaign operation HBAR::" + card.id);
      return await closeCampaignSMTransaction(card.id, card.contract_id);
    }
    throw new Error("Somethig error with card data.");
  }

  private async makeSMTransactionForCloseFUNGIBLECmapign(card: campaign_twittercard) {
    if (card.owner_id && card.contract_id) {
      logger.info("Sm tranaction for close campaign operation FUBGIBLE::" + card.id);
      return closeFungibleAndNFTCampaign(card.fungible_token_id, card.owner_id.toString(), card.contract_id?.toString());
    }
  }

  private async scheduleJobForExpiry(cardId: number | bigint, campaignExpiryTimestamp: string, contract_id: string) {
    const expiryDate = new Date(campaignExpiryTimestamp);
    scheduleJob(expiryDate, () => {
      perFormCampaignExpiryOperation(cardId, contract_id);
    });
    logger.info(`Reward expry timestamp for cmapaign id::{${cardId}} scheduled at:: { ${expiryDate.toISOString()}.`);
  }

  private async handleHBARCmapignClosing(card: campaign_twittercard, cardOwner: user_user) {
    const campaignExpiryTimestamp = addMinutesToTime(this.date.toISOString(), claimDuration);

    //##1  SM Transaction for update the campaign close status and start rewarding;
    try {
      const transaction = this.makeSMTransactionForCloseHBARCampaign(card);
    } catch (err) {
      throw err;
    }

    //##2 . update the stats of the engagement on card
    try {
      await this.updateTweetEngagements(card.id!, campaignExpiryTimestamp);
    } catch (error) {
      throw error;
    }

    //## 3 This is update the card status for rewarding;
    try {
      this.updateTweetEngagements(card.id, campaignExpiryTimestamp);
    } catch (err) {
      throw err;
    }

    // 4. Publish reward announcemnt tweet thred

    const tweetTextHBAR = `Promo ended on ${formattedDateTime(this.date.toISOString())}.Rewards allocation for the next ${claimDuration} minutes. New users: log into ${hederaService.network === "testnet" ? "https://testnet.hashbuzz.social" : "https://hashbuzz.social"}, link Personal X account. Then go to Claim Rewards to start the claim.`;

    //logger
    logger.info(`Tweet text with string count:: ${tweetTextHBAR.length} And Content:::=> ${tweetTextHBAR}`);

    const updateThread = await twitterCardService.publishTweetORThread({
      cardOwner,
      isThread: true,
      tweetText: tweetTextHBAR,
      parentTweetId: card.last_thread_tweet_id!,
    });
    this.campaignCard = await this.updateCampaignCardToComplete(card.id, campaignExpiryTimestamp, updateThread);
    this.scheduleJobForExpiry(card.id, campaignExpiryTimestamp, card.contract_id!);

    return { card: JSONBigInt.parse(JSONBigInt.stringify(this.campaignCard)), message: "Campaign is closed" };
  }

  private async handleFungibleCampaignClosing(card: campaign_twittercard, cardOwner: user_user) {
    const campaignExpiryTimestamp = addMinutesToTime(this.date.toISOString(), claimDuration);

    //##1  SM Transaction for update the campaign close status and start rewarding;
    try {
      const transaction = this.makeSMTransactionForCloseFUNGIBLECmapign(card);
    } catch (err) {
      throw err;
    }

    //##2 . update the stats of the engagement on card
    try {
      await this.updateTweetEngagements(card.id!, campaignExpiryTimestamp);
    } catch (error) {
      throw error;
    }

    //## 3 This is update the card status for rewarding;
    try {
      this.updateTweetEngagements(card.id, campaignExpiryTimestamp);
    } catch (err) {
      throw err;
    }

    const tweetTextFungible = `Promo ended on  ${formattedDateTime(this.date.toISOString())}. Rewards allocation for the next ${claimDuration} minutes. New users: log into ${hederaService.network === "testnet" ? "https://testnet.hashbuzz.social" : "https://hashbuzz.social"}, link Personal X account and associate token with ID ${card.fungible_token_id ?? ""} to your wallet.`;

    //logger
    logger.info(`Tweet text for fungible tweet text string count:: ${tweetTextFungible.length} And Content:::=> ${tweetTextFungible}`);

    const updateThread = await twitterCardService.publishTweetORThread({
      cardOwner,
      isThread: true,
      tweetText: tweetTextFungible,
      parentTweetId: card.last_thread_tweet_id!,
    });
    this.campaignCard = await this.updateCampaignCardToComplete(card.id, campaignExpiryTimestamp, updateThread);
    this.scheduleJobForExpiry(card.id, campaignExpiryTimestamp, card.contract_id!);

    return { card: JSONBigInt.parse(JSONBigInt.stringify(this.campaignCard)), message: "Campaign is closed" };
  }

  private scheduleRewardDistribution = (card: campaign_twittercard) => {
    const rewardDistributeTime = new Date(addMinutesToTime(this.date.toISOString(), 1));
    scheduleJob(rewardDistributeTime, () => {
      logger.info("Reward distribution scheduled at::" + rewardDistributeTime.toISOString());
      performAutoRewardingForEligibleUser(card.id);
    });
  };

  // Error handling method
  private async handleErrorWhileClosing(cardId: number | bigint, message: string, error: any) {
    logger.err(
      `${message} for card ID: ${cardId} 
              Error::: ${error}`
    );
    await this.updateCampaignStatus(this.campaignCard?.contract_id!, undefined, false , LYFCycleStages.COMPLETED);
    await this.handleError(this.campaignCard?.id!, message, error);
    throw new Error(`${message}: ${error.message}`);
  }
}

export default CloseCmapignLyfCycle;
