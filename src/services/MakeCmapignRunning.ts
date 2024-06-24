import { campaign_twittercard, user_user, whiteListedTokens } from "@prisma/client";
import { addFungibleAndNFTCampaign } from "@services/contract-service";
import { allocateBalanceToCampaign } from "@services/transaction-service";
import tweetService from "@services/twitterCard-service";
import prisma from "@shared/prisma";
import logger from "jet-logger";
import CampaignLifeCycleBase, { CampaignStatuses, LYFCycleStages } from "./CampaignLifeCycleBase";
import userService from "./user-service";
import JSONBigInt from "json-bigint";
import { sensitizeUserData } from "@shared/helper";

class MakeCampaignRunning extends CampaignLifeCycleBase {


    public async makeCardRunning() {
        const card = this.ensureCampaignCardLoaded();
        return card.type === "HBAR" ? await this.makeCardTypeHBARRunning() : await this.makeFungibleCardRunning();
    }

    private async makeCardTypeHBARRunning() {
        try {
            const card = this.ensureCampaignCardLoaded();
            const cardOwner = this.ensureCardOwnerDataLoaded();
            const checkIsValidCampaign = await this.isCampaignValidForMakeRunning(CampaignStatuses.RUNNING);

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
                // Pusblished on the x will be deleted
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

            // ?? ==>  Make life cycle event it self to success.
            await this.redisClient.updateCampaignCardStatus({
                card_contract_id: card.contract_id!,
                LYFCycleStage: LYFCycleStages.RUNNING,
                isSuccess: true,
            });
            return {
                success: true,
                messages: "Cmapaign status is chnaged to running successfully.",
                user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(cardOwner))),
            }
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

    protected async updateFungibleBalance(card: campaign_twittercard, cardOwner: user_user) {
        const { campaign_budget } = card
        if (campaign_budget && this.tokenData) {
            return await userService.updateTokenBalanceForUser({
                amount: campaign_budget,
                operation: "decrement",
                token_id: this.tokenData?.id,
                decimal: Number(this.tokenData?.decimals),
                user_id: cardOwner?.id,
            })
        }
    };

    protected async deleteTweet(campaignId: number | bigint): Promise<void> {
        // Yet to define the definitions
        logger.warn("Need to recall campaign due to error");
    }


    // checker 
    public async isCampaignValidForMakeRunning(
        status: string,
    ): Promise<{ isValid: boolean; message?: string }> {
        const card = this.ensureCampaignCardLoaded();

        // Check if there is any running card for the current card user
        if (Number(this.runningCardCount) > 0) {
            return { isValid: false, message: "There is a card already in running status" };
        }

        // Common validations
        const inSameStatus = this.isStatusSameAsPerRequested(status);
        const campaignShouldBeApprovedByAdmin = card.approve;
        const hasRequiredBudget = Number(this.cardOwner?.available_budget) >= Number(card.campaign_budget);
        const hasValidContractId = Boolean(card.contract_id);

        let message: string | undefined;

        // Check if the campaign is already in the requested status
        if (inSameStatus) {
            message = "Campaign already has the same state from before";
            return { isValid: false, message };
        }

        // Check if the campaign is approved by admin
        if (!campaignShouldBeApprovedByAdmin) {
            message = "Admin approval for content is required";
            return { isValid: false, message };
        }

        // Check if the campaign has a valid contract ID
        if (!hasValidContractId) {
            message = "ID for contract is missing in the record.";
            return { isValid: false, message };
        }

        // Additional checks based on campaign type
        if (card.type === "HBAR") {
            // Check if the user has the required budget
            if (!hasRequiredBudget) {
                message = "User available budget is lower than the required campaign budget";
                return { isValid: false, message };
            }

            message = "All checks passed";
            return { isValid: true, message };
        } else if (card.type === "FUNGIBLE") {
            const tokenId = card.fungible_token_id;

            // Check if the card has a valid token ID
            if (!tokenId) {
                message = "There is no valid token associated with the card";
                return { isValid: false, message };
            }

            const campaignerTokenBalance = await this.getUserBalanceOfTokenOfCampaigner(tokenId);
            const hasSufficientTokenBalance = Number(campaignerTokenBalance.balance) >= Number(card.campaign_budget);

            // Check if the user has sufficient token balance
            if (!hasSufficientTokenBalance) {
                message = "Insufficient balance to start the campaign";
                return { isValid: false, message };
            }

            message = "All checks passed";
            return { isValid: true, message };
        }

        // Default case for unsupported campaign types
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

        return { balance: Number(campaignerBalances?.entity_balance), decimal: Number(campaignerBalances?.entity_decimal) }
    }


    private async makeFungibleCardRunning() {
        try {
            const card = this.ensureCampaignCardLoaded();
            const cardOwner = this.ensureCardOwnerDataLoaded();
            const checkIsValidCampaign = await this.isCampaignValidForMakeRunning(CampaignStatuses.RUNNING);

            if (!checkIsValidCampaign.isValid) {
                throw new Error(checkIsValidCampaign.message);
            }

            logger.info(`Starting process to make Fungible campaign card running for card ID: ${card.id}`);

            // Step 1: Publish first tweet
            try {
                const tweetId = await tweetService.publistFirstTweet(card, cardOwner);
                if (tweetId) this.tweetId = tweetId;
                await this.redisClient.updateCampaignCardStatus({
                    card_contract_id: card.contract_id!,
                    LYFCycleStage: LYFCycleStages.RUNNING,
                    isSuccess: true,
                    subTask: "fungible.firstTweetOut",
                });
                logger.info(`Successfully published first tweet for fungible card ID: ${card.id}`);
            } catch (error) {
                logger.err(`Error::Failed to publish first tweet for fungible card ID: ${card.id}`, error.data.details);
                logger.err(error);
                await this.handleError(card.id, "Failed to publish first fungible tweet", error);
                throw error;
            }

            // Step 2: Perform smart contract transaction
            try {
                const transactionDetails = await this.performSmartContractTransactionForFungible(card, cardOwner);
                logger.info(`Smart contract transaction successful for fungible card ID: ${card.id}`);

                const transactionRecord = await this.createTransactionRecord({
                    //@ts-ignore
                    transaction_data: transactionDetails,
                    transaction_id: transactionDetails?.transactionId ?? "NA",
                    status: transactionDetails?.status.toString() ?? "Not found",
                    amount: Number(card.campaign_budget),
                    transaction_type: "campaign_top_up"
                });

                await this.logCampaignData({
                    campaign_id: card.id,
                    status: CampaignStatuses.RUNNING,
                    message: `Fungible campaign balance ${card.campaign_budget} is added to the SM Contract`,
                    data: {
                        transaction_id: transactionDetails?.transactionId,
                        status: transactionDetails?.status.toString(),
                        amount: Number(card.campaign_budget),
                        transactionLogId: transactionRecord.id.toString()
                    }
                });
            } catch (error) {
                logger.err(`Smart contract transaction failed for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Smart contract transaction failed", error);
                // Pusblished on the x will be deleted
                await this.deleteTweet(card.id);
                throw error;
            }

            // Step 3: Perform balance update operations
            try {
                await this.updateFungibleBalance(card, cardOwner)
                logger.info(`Fungible balance update successful for card ID: ${card.id}`);
            } catch (error) {
                logger.err(`Fungible balance update failed for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Fungible balance update failed", error);
                throw error;
            }

            // Step 4: Publish second tweet thread
            try {
                if (this.tweetId) {
                    this.lastThreadId = await tweetService.publishSecondThread(card, cardOwner, this.tweetId);
                }
                logger.info(`Successfully published second tweet thread for fungile card ID: ${card.id}`);

                await this.redisClient.updateCampaignCardStatus({
                    card_contract_id: card.contract_id!,
                    LYFCycleStage: LYFCycleStages.RUNNING,
                    isSuccess: true,
                    subTask: "secondThreadOut"
                });
            } catch (error) {
                logger.err(`Failed to publish second tweet thread for fungible card ID: ${card.id}`, error);
                await this.handleError(card.id, "Failed to publish  second fungible tweet thread", error);
                throw error;
            }

            this.campaignCard = await this.updateDBForRunningStatus(card);

            // Make life cycle event it self to success.
            await this.redisClient.updateCampaignCardStatus({
                card_contract_id: card.contract_id!,
                LYFCycleStage: LYFCycleStages.RUNNING,
                isSuccess: true,
            });

            logger.info(`Campaign card running process completed successfully for fungible card ID: ${card.id}`);
            return {
                success: true,
                messages: "Cmapaign status is chnaged to running successfully.",
                user: JSONBigInt.parse(JSONBigInt.stringify(sensitizeUserData(cardOwner))),
            }
        } catch (error) {
            logger.err(`makeCardRunning encountered an fungible error: ${error.message}`);
            this.redisClient.updateCampaignCardStatus({
                card_contract_id: this.campaignCard?.contract_id!,
                LYFCycleStage: LYFCycleStages.RUNNING,
                isSuccess: false
            });
            throw error;
        }
    }


    private async performSmartContractTransactionForFungible(card: campaign_twittercard, cardOwner: user_user) {
        const { fungible_token_id, contract_id, campaign_budget } = card;
        const { hedera_wallet_id } = cardOwner;

        if (fungible_token_id && contract_id && campaign_budget && hedera_wallet_id) {

            return await addFungibleAndNFTCampaign(
                fungible_token_id,
                campaign_budget,
                hedera_wallet_id,
                contract_id
            );
        } else {
            throw new Error("Parameter for the uodate balance is missing..")
        }
    };
    /// 
}

export default MakeCampaignRunning;
