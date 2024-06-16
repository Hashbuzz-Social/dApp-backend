import { CampaignLog, campaign_twittercard, transactions, user_user } from "@prisma/client";
import prisma from "@shared/prisma";
import logger from "jet-logger"
import RedisClient from "./redis-servie";
import moment from "moment";
import { addMinutesToTime } from "@shared/helper";
import hederaService from "@services/hedera-service";

export enum LYFCycleStages {
    CREATED = "status:created",
    RUNNING = "status:running",
    PAUSED = "status:paused",
    COMPLETED = "status:completed",
    EXPIRED = "status:expired"
}

export enum CampaignStatuses {
    REJECTED = "rejected",
    RUNNING = "running",
    COMPLETED = "completed",
    DELETED = "deleted",
    INTERNAL_ERROR = "internalError"
}

export type CampaignTypes = "HBAR" | "FUNGIBLE"

interface RedisCardStatusUpdate {
    card_contract_id: string,
    LYFCycleStage: LYFCycleStages,
    subTask?: string,
    isSuccess?: boolean,
}

type TransactionRecord = NonNullable<Omit<transactions, "id" | "created_at" | "network">>

class CampaignLifeCycleBase {
    protected campaignCard: campaign_twittercard | null = null;
    protected cardOwner: user_user | null = null;
    protected tweetId: string | null = null;
    protected lastThreadId: string | null = null;
    protected redisClient: RedisClient;
    protected campaignDurationInMin = 15;
    protected runningCardCount = 0;

    constructor() {
        this.redisClient = new RedisClient();
        this.campaignDurationInMin = Number(process.env.CAMPAIGN_DURATION);
    }

    static async create(id: number | bigint): Promise<CampaignLifeCycleBase> {
        const instance = new CampaignLifeCycleBase();
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


    protected ensureCampaignCardLoaded(): campaign_twittercard {
        if (!this.campaignCard) {
            throw new Error("Campaign card data is not loaded");
        }

        return this.campaignCard;
    }

    protected ensureCardOwnerDataLoaded(): user_user {
        if (!this.cardOwner) {
            throw new Error("Campaign card owner data is not loaded");
        }

        return this.cardOwner;
    }

    protected isStatusSameAsPerRequested(status: string): boolean {
        const card = this.ensureCampaignCardLoaded();
        return card.card_status.toLowerCase() === status.toLowerCase();
    }

    protected async updateDBForRunningStatus(card: campaign_twittercard): Promise<campaign_twittercard> {
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

    protected async handleError(campaignId: number | bigint, message: string, error: any): Promise<void> {
        logger.err(`Error for campaign ID ${campaignId}: ${message}`, error);

        await prisma.campaignLog.create({
            data: {
                campaign_id: campaignId,
                data: JSON.stringify(error),
                message,
                status: CampaignStatuses.INTERNAL_ERROR
            }
        });
    }

    protected async logCampaignData(params: NonNullable<Omit<CampaignLog, "id" | "timestamp">>) {
        const { campaign_id, status, data, message } = params;
        await prisma.campaignLog.create({
            data: {
                campaign_id,
                status,
                message,
                data: JSON.parse(JSON.stringify(data))
            }
        });
    }

    protected async createTransactionRecord(params: TransactionRecord) {
        const { amount, transaction_type, transaction_id, transaction_data, status } = params;
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
}

export default CampaignLifeCycleBase;
