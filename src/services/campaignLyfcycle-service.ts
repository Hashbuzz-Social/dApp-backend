import { campaign_twittercard, user_user } from "@prisma/client";
import prisma from "@shared/prisma";
import { allocateBalanceToCampaign } from "@services/transaction-service";

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
        // The campaign card should have a valid contract ID.
        const campaignShouldHaveContractId = card.contract_id;
        // Should have required budget in the account to run the card.
        const shouldHaveRequiredBudget = Number(this.cardOwner?.available_budget) > Number(card.campaign_budget);

        // Check for HBAR type campaign.
        if (type === "HBAR") {
            // All conditions must be satisfied for the campaign to be in running state.
            const isValid = Boolean(!inSameStatus && campaignShouldBeApprovedByAdmin && campaignShouldHaveContractId && shouldHaveRequiredBudget);

            let message;
            if (inSameStatus) {
                message = "Campaign already has the same state from before";
            } else if (!campaignShouldBeApprovedByAdmin) {
                message = "Admin approval for content is required";
            } else if (!campaignShouldHaveContractId) {
                message = "Campaign should have a valid contract ID in the record";
            } else if (!shouldHaveRequiredBudget) {
                message = "User available budget is lower than the required campaign budget";
            } else {
                message = "All checks passed";
            }

            return { isValid, message };
        }

        // Default case for FUNGIBLE type and other types.
        return { isValid: false, message: "Logic not decided yet" };
    }

    public  async publishContentToTwiiter () {

    }

    public async perFormSMtrnsactionTOMakeRunning(type: CmapignTypes) {
        try {
            const card = this.ensureCampaignCardLoaded();
            const checkIsValidCmapign = this.isCampaignValidForMakeRunning(CmapignStauses.RUNNING, type)
            if (!checkIsValidCmapign.isValid) {
                throw new Error(checkIsValidCmapign.message)
            }
            if (card.contract_id && card.campaign_budget && this.cardOwner?.hedera_wallet_id) {
                await allocateBalanceToCampaign(
                    card.id,
                    card.campaign_budget,
                    this.cardOwner.hedera_wallet_id,
                    card.contract_id
                );
            }
        } catch (error) {
            throw error
        }
    }
}

export default CampaignLifeCycle;
