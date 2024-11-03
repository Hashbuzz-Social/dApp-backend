import { campaign_twittercard, user_user, campaignstatus as CampaignStatus } from "@prisma/client";
import { addFungibleAndNFTCampaign } from "@services/contract-service";
import { allocateBalanceToCampaign } from "@services/transaction-service";
import tweetService from "@services/twitterCard-service";
import { sensitizeUserData } from "@shared/helper";
import prisma from "@shared/prisma";
import logger from "jet-logger";
import JSONBigInt from "json-bigint";
import CampaignLifeCycleBase from "./CampaignLifeCycleBase";
import userService from "./user-service";

interface TransactionDetails {
  contract_id: string;
  transactionId: string;
  receipt: any;
  status: string;
}

class MakeCampaignRunning extends CampaignLifeCycleBase {
  public async makeCardRunning() {
    // this.redisClient = await new RedisClient().checkConnection();
    const card = this.ensureCampaignCardLoaded();
    return card.type === "HBAR" ? await this.makeCardTypeHBARRunning() : await this.makeFungibleCardRunning();
  }

  private async makeCardTypeHBARRunning() {
    try {
      const card = this.ensureCampaignCardLoaded();
      const cardOwner = this.ensureCardOwnerDataLoaded();
      const checkIsValidCampaign = await this.isCampaignValidForMakeRunning(CampaignStatus.CampaignRunning);

      let transactionDetails: TransactionDetails;

      if (!checkIsValidCampaign.isValid) {
        throw new Error(checkIsValidCampaign.message);
      }

      logger.info(`Starting process to make HBAR campaign card running for card ID: ${card.id}`);

      // Step 1: Publish first tweet
      try {
        const tweetId = await tweetService.publistFirstTweet(card, cardOwner);
        if (tweetId) this.tweetId = tweetId;
        await this.updateCampaignStatus(card.contract_id!, "firstTweetOut", true);
        logger.info(`Successfully published first tweet for card ID: ${card.id}`);
      } catch (error) {
        await this.handleErrorWhileRunning(card.id, "Failed to publish first tweet", error);
        throw error;
      }

      // Step 2: Perform smart contract transaction
      try {
        const contractStateUpdateResult = await this.performSmartContractTransaction(card);
        transactionDetails = {
          contract_id: card.contract_id!,
          transactionId: contractStateUpdateResult?.transactionId,
          receipt: contractStateUpdateResult?.receipt,
          status: contractStateUpdateResult?.status._code.toString(),
        }
        await this.updateCampaignStatus(card.contract_id!, "contractTransaction", true);
        logger.info(`Smart contract transaction successful for card ID: ${card.id}`);
      } catch (error) {
        await this.handleErrorWhileRunning(card.id, "Smart contract transaction failed", error);
        await this.deleteTweet(card.id);
        throw error;
      }

      // Step 2 (A) // logging the transction record to DB..
      const transactionRecord = await this.createTransactionRecord({
        transaction_data: JSONBigInt.parse(JSONBigInt.stringify(transactionDetails)),
        transaction_id: transactionDetails.transactionId,
        status: transactionDetails.status,
        amount: Number(card.campaign_budget),
        transaction_type: "campaign_top_up",
      });

      // Step 2(B) // Log the campaign Data to the DB
      await this.logCampaignData({
        campaign_id: card.id,
        status: CampaignStatus.CampaignRunning,
        message: `Campaign balance ${card.campaign_budget} is added to the SM Contract`,
        data: {
          transaction_id: transactionDetails.transactionId,
          status: transactionDetails.status,
          amount: Number(card.campaign_budget),
          transactionLogId: transactionRecord.id.toString(),
        },
      });

      await this.updateCampaignStatus(card.contract_id!, "transactionLogsCreated", true);

      // Step 3: Perform balance update operations
      try {
        await this.updateBalance(card);
        await this.updateCampaignStatus(card.contract_id!, "DB_Balance_update", true);
        logger.info(`Balance update successful for card ID: ${card.id}`);
      } catch (error) {
        await this.handleErrorWhileRunning(card.id, "Balance update failed", error);
        throw error;
      }

      // Step 4: Publish second tweet thread
      try {
        if (this.tweetId) {
          this.lastThreadId = await tweetService.publishSecondThread(card, cardOwner, this.tweetId);
        }
        logger.info(`Successfully published second tweet thread for card ID: ${card.id}`);
        await this.updateCampaignStatus(card.contract_id!, "secondThreadOut", true);
      } catch (error) {
        await this.handleErrorWhileRunning(card.id, "Failed to publish second tweet thread", error);
        throw error;
      }

      this.campaignCard = await this.updateDBForRunningStatus(card);
      logger.info(`Campaign card running process completed successfully for card ID: ${card.id}`);

      await this.updateCampaignStatus(card.contract_id!, undefined, true);
      return {
        success: true,
        messages: "Campaign status is changed to running successfully.",
        user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(cardOwner))),
      };
    } catch (error) {
      await this.handleErrorWhileRunning(this.campaignCard?.id!, "makeCardRunning encountered an error", error);
      throw error;
    }
  }

  protected async performSmartContractTransaction(card: campaign_twittercard) {
    if (card.contract_id && card.campaign_budget && this.cardOwner?.hedera_wallet_id) {
      return await allocateBalanceToCampaign(card.id, card.campaign_budget, this.cardOwner.hedera_wallet_id, card.contract_id);
    } else {
      throw new Error("Missing required data for smart contract transaction");
    }
  }

  protected async updateBalance(card: campaign_twittercard): Promise<void> {
    if (card.campaign_budget && card.owner_id) {
      const user_data = await userService.topUp(card.owner_id, card.campaign_budget, "decrement");
      if (this.cardOwner) {
        this.cardOwner = { ...this.cardOwner, ...user_data };
      }
    } else {
      throw new Error("Missing required data for balance update");
    }
  }

  protected async updateFungibleBalance(card: campaign_twittercard, cardOwner: user_user) {
    const { campaign_budget } = card;
    if (campaign_budget && this.tokenData) {
      return await userService.updateTokenBalanceForUser({
        amount: campaign_budget,
        operation: "decrement",
        token_id: this.tokenData?.id,
        decimal: Number(this.tokenData?.decimals),
        user_id: cardOwner?.id,
      });
    } else {
      throw new Error("Missing required data for fungible balance update");
    }
  }

  protected async deleteTweet(campaignId: number | bigint): Promise<void> {
    logger.warn("Need to recall campaign due to error");
    // Implement the actual tweet deletion logic here
  }

  public async isCampaignValidForMakeRunning(status: string): Promise<{ isValid: boolean; message?: string }> {
    const card = this.ensureCampaignCardLoaded();

    if (Number(this.runningCardCount) > 0) {
      return { isValid: false, message: "There is a card already in running status" };
    }

    const inSameStatus = this.isStatusSameAsPerRequested(status);
    const campaignShouldBeApprovedByAdmin = card.approve;
    const hasRequiredBudget = Number(this.cardOwner?.available_budget) >= Number(card.campaign_budget);
    const hasValidContractId = Boolean(card.contract_id);

    let message: string | undefined;

    if (inSameStatus) {
      message = "Campaign already has the same state from before";
      return { isValid: false, message };
    }

    if (!campaignShouldBeApprovedByAdmin) {
      message = "Admin approval for content is required";
      return { isValid: false, message };
    }

    if (!hasValidContractId) {
      message = "ID for contract is missing in the record.";
      return { isValid: false, message };
    }

    if (card.type === "HBAR") {
      if (!hasRequiredBudget) {
        message = "User available budget is lower than the required campaign budget";
        return { isValid: false, message };
      }

      message = "All checks passed";
      return { isValid: true, message };
    } else if (card.type === "FUNGIBLE") {
      const tokenId = card.fungible_token_id;

      if (!tokenId) {
        message = "There is no valid token associated with the card";
        return { isValid: false, message };
      }

      const campaignerTokenBalance = await this.getUserBalanceOfTokenOfCampaigner(tokenId);
      const hasSufficientTokenBalance = Number(campaignerTokenBalance.balance) >= Number(card.campaign_budget);

      if (!hasSufficientTokenBalance) {
        message = "Insufficient balance to start the campaign";
        return { isValid: false, message };
      }

      message = "All checks passed";
      return { isValid: true, message };
    }

    return { isValid: false, message: "Unsupported campaign type" };
  }

  private async getUserBalanceOfTokenOfCampaigner(tokenId: string) {
    this.tokenData = await prisma.whiteListedTokens.findUnique({
      where: { token_id: tokenId },
    });

    const campaignerBalances = await prisma.user_balances.findFirst({
      where: {
        user_id: this.cardOwner?.id,
        token_id: this.tokenData?.id,
      },
    });

    return { balance: Number(campaignerBalances?.entity_balance), decimal: Number(campaignerBalances?.entity_decimal) };
  }

  private async makeFungibleCardRunning() {
    try {
      const card = this.ensureCampaignCardLoaded();
      const cardOwner = this.ensureCardOwnerDataLoaded();
      const checkIsValidCampaign = await this.isCampaignValidForMakeRunning(CampaignStatus.CampaignRunning);

      if (!checkIsValidCampaign.isValid) {
        throw new Error(checkIsValidCampaign.message);
      }

      logger.info(`Starting process to make Fungible campaign card running for card ID: ${card.id}`);

      // Step 1: Publish first tweet
      try {
        const tweetId = await tweetService.publistFirstTweet(card, cardOwner);
        if (tweetId) this.tweetId = tweetId;
        await this.updateCampaignStatus(card.contract_id!, "fungible.firstTweetOut", true);
        logger.info(`Successfully published first tweet for fungible card ID: ${card.id}`);
      } catch (error) {
        await this.handleErrorWhileRunning(card.id, "Failed to publish first fungible tweet", error);
        throw error;
      }

      // Step 2: Perform smart contract transaction
      try {
        const transactionDetails = await this.performSmartContractTransactionForFungible(card, cardOwner);
        logger.info(`Smart contract transaction successful for fungible card ID: ${card.id}`);

        const transactionRecord = await this.createTransactionRecord({
          transaction_data: JSONBigInt.parse(JSONBigInt.stringify(transactionDetails)),
          transaction_id: transactionDetails?.transactionId ?? "NA",
          status: transactionDetails?.status.toString() ?? "Not found",
          amount: Number(card.campaign_budget),
          transaction_type: "campaign_top_up",
        });

        await this.logCampaignData({
          campaign_id: card.id,
          status: CampaignStatus.CampaignRunning,
          message: `Fungible campaign balance ${card.campaign_budget} is added to the SM Contract`,
          data: {
            transaction_id: transactionDetails?.transactionId,
            status: transactionDetails?.status.toString(),
            amount: Number(card.campaign_budget),
            transactionLogId: transactionRecord.id.toString(),
          },
        });
      } catch (error) {
        await this.handleErrorWhileRunning(card.id, "Smart contract transaction failed", error);
        await this.deleteTweet(card.id);
        throw error;
      }

      // Step 3: Perform balance update operations
      try {
        await this.updateFungibleBalance(card, cardOwner);
        logger.info(`Fungible balance update successful for card ID: ${card.id}`);
      } catch (error) {
        await this.handleErrorWhileRunning(card.id, "Fungible balance update failed", error);
        throw error;
      }

      // Step 4: Publish second tweet thread
      try {
        if (this.tweetId) {
          this.lastThreadId = await tweetService.publishSecondThread(card, cardOwner, this.tweetId);
        }
        logger.info(`Successfully published second tweet thread for fungible card ID: ${card.id}`);
        await this.updateCampaignStatus(card.contract_id!, "secondThreadOut", true);
      } catch (error) {
        await this.handleErrorWhileRunning(card.id, "Failed to publish second fungible tweet thread", error);
        throw error;
      }

      this.campaignCard = await this.updateDBForRunningStatus(card);

      await this.updateCampaignStatus(card.contract_id!, undefined, true);
      logger.info(`Campaign card running process completed successfully for fungible card ID: ${card.id}`);
      return {
        success: true,
        messages: "Campaign status is changed to running successfully.",
        user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(cardOwner))),
      };
    } catch (error) {
      await this.handleErrorWhileRunning(this.campaignCard?.id!, "makeCardRunning encountered an fungible error", error);
      throw error;
    }
  }

  private async performSmartContractTransactionForFungible(card: campaign_twittercard, cardOwner: user_user) {
    const { fungible_token_id, contract_id, campaign_budget } = card;
    const { hedera_wallet_id } = cardOwner;

    if (fungible_token_id && contract_id && campaign_budget && hedera_wallet_id) {
      return await addFungibleAndNFTCampaign(fungible_token_id, campaign_budget, hedera_wallet_id, contract_id);
    } else {
      throw new Error("Parameter for the update balance is missing.");
    }
  }

  // Error handling method
  private async handleErrorWhileRunning(cardId: number | bigint, message: string, error: any) {
    logger.err(
      `${message} for card ID: ${cardId} 
            Error::: ${error}`
    );
    await this.updateCampaignStatus(this.campaignCard?.contract_id!, undefined, false);
    await this.handleError(this.campaignCard?.id!, message, error);
    throw new Error(`${message}: ${error.message}`);
  }
}

export default MakeCampaignRunning;
