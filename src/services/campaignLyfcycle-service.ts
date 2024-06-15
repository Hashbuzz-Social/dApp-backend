import { CampaignLog, campaign_twittercard, transactions, user_user } from "@prisma/client";
import prisma from "@shared/prisma";
import { allocateBalanceToCampaign } from "@services/transaction-service";
import logger from "jet-logger"
import tweetService from "@services/twitterCard-service"
import userService from "./user-service";
import RedisClient from "./redis-servie";
import moment from "moment";
import { addMinutesToTime } from "@shared/helper";
import hederaService from "@services/hedera-service"

export enum LYFCycleStages {
    CREATED = "status:created",
    RUNNING = "status:running",
    PAUSED = "status:paused",
    COMPLETED = "status:completed",
    EXPIRED = "status:expired"
}

enum CmapignStauses {
    REJECTED = "rejected",
    RUNNING = "running",
    COMPLETED = "completed",
    DELTED = "deleted",
    INTERNAL_ERROR = "internalError"
}

export type CmapignTypes = "HBAR" | "FUNGIBLE"

interface RedisCardStatusUpdate {
    card_contract_id: string,
    LYFCycleStage: LYFCycleStages,
    subTask?: string
    isSuccess?: boolean,
}

type TransactionRecord = NonNullable<Omit<transactions, "id" | "created_at" | "network">>

class CampaignLifeCycle {
    private campaignCard: campaign_twittercard | null = null;
    private cardOwner: user_user | null = null;
    private tweetId: string | null = null;
    private lastThreadId: string | null = null;
    private redisClient: RedisClient;
    private campaignDurationInMin = 15
    private runningCardCount = 0

    private constructor() {
        this.redisClient = new RedisClient();
        this.campaignDurationInMin = Number(process.env.CAMPAIGN_DURATION)
    }

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
            this.campaignCard = { ...rest };
            this.runningCardCount = runningCardCount
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

    public createNewCampaignOfTypeHBAR() {
        // Logic for creating a new campaign in the DB
    }


    private ensureCampaignCardLoaded(): campaign_twittercard {
        if (!this.campaignCard) {
            throw new Error("Campaign card data is not loaded");
        }

        return this.campaignCard;
    }

    private ensureCardOwnerDataLoaded(): user_user {
        if (!this.cardOwner) {
            throw new Error("Campaign card data is not loaded");
        }

        return this.cardOwner;
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
        if (Number(this.runningCardCount) > 0) {
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

    public async makeCardTypeHBARRunning(): Promise<void> {
        try {
            const card = this.ensureCampaignCardLoaded();
            const cardOwner = this.ensureCardOwnerDataLoaded();
            const checkIsValidCampaign = this.isCampaignValidForMakeRunning(CmapignStauses.RUNNING, card.type as CmapignTypes);

            if (!checkIsValidCampaign.isValid) {
                throw new Error(checkIsValidCampaign.message);
            }

            logger.info(`Starting process to make campaign card running for card ID: ${card.id}`);

            // Step 1: Publish first tweet
            try {
                const tweetId = await tweetService.publistFirstTweet(card, cardOwner);
                if (tweetId) this.tweetId = tweetId;
                await this.redisClient.updateCmapignCardStatus({
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

                // Step 2 (A) :: create a transation log of the campaign 
                const transactionRecord = await this.createTransactionrecord({
                    transaction_data: transactionDetails,
                    transaction_id: transactionDetails.transactionId,
                    status: transactionDetails.status,
                    amount: Number(card.campaign_budget),
                    transaction_type: "campaign_top_up"
                })
                // Step 2 (B) :: create a camapign log with the details you submited.
                await this.logCampaignData({
                    campaign_id: card.id,
                    status: CmapignStauses.RUNNING,
                    message: `Campaign balace ${card.campaign_budget} is added to the SM Contract`,
                    data: {
                        transaction_id: transactionDetails.transactionId,
                        status: transactionDetails.status,
                        amount: Number(card.campaign_budget),
                        transactionLogId: transactionRecord.id.toString()
                    }
                })
            } catch (error) {
                logger.err(`Smart contract transaction failed for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Smart contract transaction failed", error);
                await this.deleteTweet(card.id); // Attempt to delete the tweet if the transaction fails
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
                // Update the status in Redis
                await this.redisClient.updateCmapignCardStatus({
                    card_contract_id: card.contract_id!,
                    LYFCycleStage: LYFCycleStages.RUNNING,
                    isSuccess: true,
                    subTask: "seconThreadOut"
                });
            } catch (error) {
                logger.err(`Failed to publish second tweet thread for card ID: ${card.id}`, error);
                await this.handleError(card.id, "Failed to publish second tweet thread", error);
                return;
            }

            // Step 5: Finalize the process and return success details

            // Step 5(A): Update the database to make card running
            this.campaignCard = await this.updateDBForRunningStatus(card);
            logger.info(`Campaign card running process completed successfully for card ID: ${card.id}`);
            // Return any necessary details here

        } catch (error) {
            logger.err(`makeCardRunning encountered an error: ${error.message}`);
            this.redisClient.updateCmapignCardStatus({
                card_contract_id: this.campaignCard?.contract_id!,
                LYFCycleStage: LYFCycleStages.RUNNING,
                isSuccess: false
            })
            throw error;
        }
    }

    private async updateDBForRunningStatus(card: campaign_twittercard): Promise<campaign_twittercard> {
        const currentTime = moment();
        return await prisma.campaign_twittercard.update({
            where: { id: card.id },
            data: {
                tweet_id: this.tweetId,
                last_thread_tweet_id: this.lastThreadId,
                card_status: "Running",
                campaign_start_time: currentTime.toISOString(),
                campaign_close_time: addMinutesToTime(currentTime.toISOString(), this.campaignDurationInMin)
            },
        });
    }

    private async performSmartContractTransaction(card: campaign_twittercard) {
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

    private async updateBalance(card: campaign_twittercard): Promise<void> {
        if (card.campaign_budget && card.owner_id) {
            //update balacne for the user from after SM transaction
            this.cardOwner = await userService.topUp(card.owner_id, card.campaign_budget, "decrement");
        }
    }

    private async handleError(campaignId: number | bigint, message: string, error: any): Promise<void> {
        // Log the error and change the campaign status to "Internal Error"
        logger.err(`Error for campaign ID ${campaignId}: ${message}`, error);
        // Serialize error message and keep in the DB

        await prisma.campaignLog.create({
            data: {
                campaign_id: campaignId,
                data: JSON.stringify(error),
                message,
                status: CmapignStauses.INTERNAL_ERROR
            }
        })
    }

    private async logCampaignData(params: NonNullable<Omit<CampaignLog, "id" | "timestamp">>) {
        const { campaign_id, status, data, message } = params;
        await prisma.campaignLog.create({
            data: {
                campaign_id,
                status,
                message,
                data: JSON.parse(JSON.stringify(data))
            }
        })
    }

    private async createTransactionrecord(params: TransactionRecord) {
        const { amount, transaction_type, transaction_id, transaction_data, status } = params
        return await prisma.transactions.create({
            data: {
                network: hederaService.network,
                amount,
                transaction_type,
                transaction_id,
                status,
                transaction_data: JSON.parse(JSON.stringify(transaction_data))
            }
        });
    }

    private async deleteTweet(campaignId: number | bigint): Promise<void> {
        // Logic to delete the tweet4
        logger.warn("Need to recall cammpaign due to error")
    }
}

export default CampaignLifeCycle;
