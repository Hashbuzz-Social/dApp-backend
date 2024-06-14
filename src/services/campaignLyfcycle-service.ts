import { campaign_twittercard, user_user } from "@prisma/client";
import prisma from "@shared/prisma";
import { allocateBalanceToCampaign } from "@services/transaction-service";
import logger from "jet-logger"

enum CmapignStauses {
    REJECTED = "rejected",
    RUNNING = "running",
    COMPLETED = "completed",
    DELTED = "deleted"
}

export type CmapignTypes = "HBAR" | "FUNGIBLE"
export type Card = (campaign_twittercard & { runningCardCount: number })

class CampaignLifeCycle {
    private campaignCard: Card | null = null;
    private cardOwner: user_user | null = null;

    private constructor() { }

    static async create(id: number | bigint): Promise<CampaignLifeCycle> {
        const instance = new CampaignLifeCycle();
        await instance.loadRequiredData(id);
        return instance;
    }

    private async loadRequiredData(id: number | bigint): Promise<void> {
        try {
            // Query for the card
            const card = await prisma.campaign_twittercard.findUnique({
                where: { id },
                include: { user_user: true },
            });

            if (!card) {
                throw new Error(`Campaign card with ID ${id} not found`);
            }

            // Query for the running card count
            const runningCardCount = await prisma.campaign_twittercard.count({
                where: {
                    owner_id: card.owner_id,
                    card_status: "Running",
                },
            });

            const { user_user, ...rest } = card;
            this.campaignCard = { ...rest, runningCardCount };
            if (user_user) {
                this.cardOwner = user_user;
            } else {
                throw new Error(`Owner details for campaign card ID ${id} not found`);
            }
        } catch (error) {
            console.error("Error loading campaign card data:", error);
            throw new Error("Failed to load campaign card data");
        }
    }

    public createNewCampaign() {
        // Logic for creating a new campaign in the DB
    }


    private ensureCampaignCardLoaded(): Card {
        if (!this.campaignCard) {
            throw new Error("Campaign card data is not loaded");
        }

        return this.campaignCard;
    }



    private isStatusSameAsPerRequested(status: string): boolean {
        const card = this.ensureCampaignCardLoaded();
        return card.card_status.toLowerCase() === status.toLowerCase();
    }

    public isCampaignValidForMakeRunning(
        status: string,
        type: CmapignTypes
    ): { isValid: boolean; message?: string } {
        const card = this.ensureCampaignCardLoaded();

        // If there's any running card for the current card user, the campaign is not valid for running.
        if (Number(card.runningCardCount) > 0) {
            return { isValid: false, message: "There is a card already in running status" };
        }

        // Check if the campaign is in the same status as requested.
        const inSameStatus = this.isStatusSameAsPerRequested(status);
        // The campaign content should be approved by the admin.
        const campaignShouldBeApprovedByAdmin = card.approve;
        // Should have required budget in the account to run the card.
        const shouldHaveRequiredBudget = Number(this.cardOwner?.available_budget) > Number(card.campaign_budget);

        // Check for HBAR type campaign.
        if (type === "HBAR") {
            // All conditions must be satisfied for the campaign to be in running state.
            const isValid = Boolean(!inSameStatus && campaignShouldBeApprovedByAdmin && shouldHaveRequiredBudget);

            let message;
            if (inSameStatus) {
                message = "Campaign already has the same state from before";
            } else if (!campaignShouldBeApprovedByAdmin) {
                message = "Admin approval for content is required";
            } else if (!shouldHaveRequiredBudget) {
                message = "User available budget is lower than the required campaign budget";
            } else {
                message = "All checks passed";
            }

            return { isValid, message };
        }

        // default case for FUNGIBLE TOKEN TYPE
        return { isValid: false, message: "Logic not decided yet" };
    }

    public async makeCardRunning(): Promise<void> {
        try {
            const card = this.ensureCampaignCardLoaded();
            const checkIsValidCampaign = this.isCampaignValidForMakeRunning(CmapignStauses.RUNNING, card.type as CmapignTypes);

            if (!checkIsValidCampaign.isValid) {
                throw new Error(checkIsValidCampaign.message);
            }

            logger.info(`Starting process to make campaign card running for card ID: ${card.id}`);

            // Step 1: Publish first tweet
            try {
                await this.publishFirstTweet(card);
                logger.info(`Successfully published first tweet for card ID: ${card.id}`);
            } catch (error) {
                logger.error(`Failed to publish first tweet for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Failed to publish first tweet", error);
                return;
            }

            // Step 2: Perform smart contract transaction
            try {
                await this.performSmartContractTransaction(card);
                logger.info(`Smart contract transaction successful for card ID: ${card.id}`);
            } catch (error) {
                logger.error(`Smart contract transaction failed for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Smart contract transaction failed", error);
                await this.deleteTweet(card.id); // Attempt to delete the tweet if the transaction fails
                return;
            }

            // Step 3: Perform balance update operations
            try {
                await this.updateBalance(card);
                logger.info(`Balance update successful for card ID: ${card.id}`);
            } catch (error) {
                logger.error(`Balance update failed for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Balance update failed", error);
                return;
            }

            // Step 4: Publish second tweet thread
            try {
                await this.publishSecondTweetThread(card);
                logger.info(`Successfully published second tweet thread for card ID: ${card.id}`);
                // Update the status in Redis
                await this.updateCampaignStatusInRedis(card.id, "Running:successful");
            } catch (error) {
                logger.error(`Failed to publish second tweet thread for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Failed to publish second tweet thread", error);
                return;
            }

            // Step 5: Finalize the process and return success details
            logger.info(`Campaign card running process completed successfully for card ID: ${card.id}`);
            // Return any necessary details here

        } catch (error) {
            logger.error(`makeCardRunning encountered an error: ${error.message}`);
            throw error;
        }
    }

    private async publishFirstTweet(card: Card): Promise<void> {
        // Logic to publish the first tweet
    }

    private async performSmartContractTransaction(card: Card): Promise<void> {
        if (card.contract_id && card.campaign_budget && this.cardOwner?.hedera_wallet_id) {
            await allocateBalanceToCampaign(
                card.id,
                card.campaign_budget,
                this.cardOwner.hedera_wallet_id,
                card.contract_id
            );
        } else {
            throw new Error("Missing required data for smart contract transaction");
        }
    }

    private async updateBalance(card: Card): Promise<void> {
        // Logic to update the balance
    }

    private async publishSecondTweetThread(card: Card): Promise<void> {
        // Logic to publish the second tweet thread
    }

    private async updateCampaignStatusInRedis(campaignId: number | bigint, status: string): Promise<void> {
        // Logic to update the campaign status in Redis
    }

    private async handleError(campaignId: number | bigint, message: string, error: any): Promise<void> {
        // Log the error and change the campaign status to "Internal Error"
        logger.error(`Error for campaign ID ${campaignId}: ${message}`, error);
        // Serialize error message and keep in the DB
        await prisma.campaign_twittercard.update({
            where: { id: campaignId },
            data: {
                card_status: "Internal Error",
                error_message: JSON.stringify(error.message),
            },
        });
    }

    private async deleteTweet(campaignId: number | bigint): Promise<void> {
        // Logic to delete the tweet
    }
}

export default CampaignLifeCycle;
