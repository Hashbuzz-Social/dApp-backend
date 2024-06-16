import CampaignLifeCycleBase, { CampaignStatuses, LYFCycleStages, CampaignTypes } from "./CampaignLifeCycleBase";
import { allocateBalanceToCampaign } from "@services/transaction-service";
import { campaign_twittercard } from "@prisma/client"
import tweetService from "@services/twitterCard-service";
import userService from "./user-service";
import logger from "jet-logger"
import { CmapignTypes } from "./campaignLyfcycle-service";

class MakeCampaignRunning extends CampaignLifeCycleBase {

    public async makeCardTypeHBARRunning(): Promise<void> {
        try {
            const card = this.ensureCampaignCardLoaded();
            const cardOwner = this.ensureCardOwnerDataLoaded();
            const checkIsValidCampaign = this.isCampaignValidForMakeRunning(CampaignStatuses.RUNNING, card.type as CampaignTypes);

            if (!checkIsValidCampaign.isValid) {
                throw new Error(checkIsValidCampaign.message);
            }

            logger.info(`Starting process to make campaign card running for card ID: ${card.id}`);

            // Step 1: Publish first tweet
            try {
                const tweetId = await tweetService.publistFirstTweet(card, cardOwner);
                if (tweetId) this.tweetId = tweetId;
                await this.redisClient.updateCampaignCardStatus({
                    card_contract_id: card.contract_id!,
                    LYFCycleStage: LYFCycleStages.RUNNING,
                    isSuccess: true,
                    subTask: "firstTweetOut",
                });
                logger.info(`Successfully published first tweet for card ID: ${card.id}`);
            } catch (error) {
                logger.err(`Failed to publish first tweet for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Failed to publish first tweet", error);
                return;
            }

            // Step 2: Perform smart contract transaction
            try {
                const transactionDetails = await this.performSmartContractTransaction(card);
                logger.info(`Smart contract transaction successful for card ID: ${card.id}`);

                const transactionRecord = await this.createTransactionRecord({
                    transaction_data: transactionDetails,
                    transaction_id: transactionDetails.transactionId,
                    status: transactionDetails.status,
                    amount: Number(card.campaign_budget),
                    transaction_type: "campaign_top_up"
                });

                await this.logCampaignData({
                    campaign_id: card.id,
                    status: CampaignStatuses.RUNNING,
                    message: `Campaign balance ${card.campaign_budget} is added to the SM Contract`,
                    data: {
                        transaction_id: transactionDetails.transactionId,
                        status: transactionDetails.status,
                        amount: Number(card.campaign_budget),
                        transactionLogId: transactionRecord.id.toString()
                    }
                });
            } catch (error) {
                logger.err(`Smart contract transaction failed for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Smart contract transaction failed", error);
                await this.deleteTweet(card.id);
                return;
            }

            // Step 3: Perform balance update operations
            try {
                await this.updateBalance(card);
                logger.info(`Balance update successful for card ID: ${card.id}`);
            } catch (error) {
                logger.err(`Balance update failed for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Balance update failed", error);
                return;
            }

            // Step 4: Publish second tweet thread
            try {
                if (this.tweetId) {
                    this.lastThreadId = await tweetService.publishSecondThread(card, cardOwner, this.tweetId);
                }
                logger.info(`Successfully published second tweet thread for card ID: ${card.id}`);

                await this.redisClient.updateCampaignCardStatus({
                    card_contract_id: card.contract_id!,
                    LYFCycleStage: LYFCycleStages.RUNNING,
                    isSuccess: true,
                    subTask: "secondThreadOut"
                });
            } catch (error) {
                logger.err(`Failed to publish second tweet thread for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Failed to publish second tweet thread", error);
                return;
            }

            this.campaignCard = await this.updateDBForRunningStatus(card);
            logger.info(`Campaign card running process completed successfully for card ID: ${card.id}`);
        } catch (error) {
            logger.err(`makeCardRunning encountered an error: ${error.message}`);
            this.redisClient.updateCampaignCardStatus({
                card_contract_id: this.campaignCard?.contract_id!,
                LYFCycleStage: LYFCycleStages.RUNNING,
                isSuccess: false
            });
            throw error;
        }
    }

    protected async performSmartContractTransaction(card: campaign_twittercard) {
        if (card.contract_id && card.campaign_budget && this.cardOwner?.hedera_wallet_id) {
            return await allocateBalanceToCampaign(
                card.id,
                card.campaign_budget,
                this.cardOwner.hedera_wallet_id,
                card.contract_id
            );
        } else {
            throw new Error("Missing required data for smart contract transaction");
        }
    }

    protected async updateBalance(card: campaign_twittercard): Promise<void> {
        if (card.campaign_budget && card.owner_id) {
            this.cardOwner = await userService.topUp(card.owner_id, card.campaign_budget, "decrement");
        }
    }

    protected async deleteTweet(campaignId: number | bigint): Promise<void> {
        logger.warn("Need to recall campaign due to error");
    }

    public isCampaignValidForMakeRunning(
        status: string,
        type: CmapignTypes
    ): { isValid: boolean; message?: string } {
        const card = this.ensureCampaignCardLoaded();

        // If there's any running card for the current card user, the campaign is not valid for running.
        if (Number(this.runningCardCount) > 0) {
            return { isValid: false, message: "There is a card already in running status" };
        }

        // Check if the campaign is in the same status as requested.
        const inSameStatus = this.isStatusSameAsPerRequested(status);
        // The campaign content should be approved by the admin.
        const campaignShouldBeApprovedByAdmin = card.approve;
        // Should have required budget in the account to run the card.
        const shouldHaveRequiredBudget = Number(this.cardOwner?.available_budget) > Number(card.campaign_budget);
        // Should have a valid id to be used in contract
        const card_contract_id = card.contract_id;

        // Check for HBAR type campaign.
        if (type === "HBAR") {
            // All conditions must be satisfied for the campaign to be in running state.
            const isValid = Boolean(!inSameStatus && campaignShouldBeApprovedByAdmin && shouldHaveRequiredBudget && card_contract_id);

            let message;
            if (inSameStatus) {
                message = "Campaign already has the same state from before";
            } else if (!campaignShouldBeApprovedByAdmin) {
                message = "Admin approval for content is required";
            } else if (!shouldHaveRequiredBudget) {
                message = "User available budget is lower than the required campaign budget";
            } else if (!card_contract_id) {
                message = "Id for contract is missing in the record."
            } else {
                message = "All checks passed";
            }

            return { isValid, message };
        }

        // default case for FUNGIBLE TOKEN TYPE
        return { isValid: false, message: "Logic not decided yet" };
    }

}

export default MakeCampaignRunning;
