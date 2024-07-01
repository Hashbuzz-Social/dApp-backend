import { CampaignLog, Prisma, campaign_twittercard, transactions, user_user, whiteListedTokens } from "@prisma/client";
import hederaService from "@services/hedera-service";
import { addMinutesToTime, convertToTinyHbar, rmKeyFrmData } from "@shared/helper";
import prisma from "@shared/prisma";
import logger from "jet-logger";
import JSONBigInt from "json-bigint";
import { isEmpty } from "lodash";
import moment from "moment";
import RedisClient, { CampaignCardData } from "./redis-servie";

export enum LYFCycleStages {
  CREATED = "status:created",
  RUNNING = "status:running",
  PAUSED = "status:paused",
  COMPLETED = "status:completed",
  EXPIRED = "status:expired",
}

export enum CampaignStatuses {
  REJECTED = "rejected",
  RUNNING = "running",
  COMPLETED = "completed",
  DELETED = "deleted",
  INTERNAL_ERROR = "internalError",
  UNDER_REVIEW = "Under Review",
}

export type CampaignTypes = "HBAR" | "FUNGIBLE";

interface RedisCardStatusUpdate {
  card_contract_id: string;
  LYFCycleStage: LYFCycleStages;
  subTask?: string;
  isSuccess?: boolean;
}

export interface createCampaignParams {
  name: string;
  tweet_text: string;
  comment_reward: string;
  retweet_reward: string;
  like_reward: string;
  quote_reward: string;
  follow_reward: string;
  campaign_budget: string;
  media: Array<string>;
  type: CampaignTypes;
  fungible_token_id?: string;
}

type TransactionRecord = NonNullable<Omit<transactions, "id" | "created_at" | "network">>;

class CampaignLifeCycleBase {
  protected campaignCard: campaign_twittercard | null = null;
  protected cardOwner: user_user | null = null;
  protected tweetId: string | null = null;
  protected lastThreadId: string | null = null;
  protected redisClient: RedisClient;
  protected campaignDurationInMin = 15;
  protected runningCardCount = 0;
  protected tokenData: whiteListedTokens | null = null;

  constructor() {
    this.redisClient = new RedisClient();
    this.campaignDurationInMin = Number(process.env.CAMPAIGN_DURATION);
  }

  static async create<T extends CampaignLifeCycleBase>(this: new () => T, id: number | bigint): Promise<T> {
    const instance = new this();
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
      this.runningCardCount = runningCardCount;
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
        campaign_close_time: addMinutesToTime(currentTime.toISOString(), this.campaignDurationInMin),
      },
    });
  }

  protected async handleError(campaignId: number | bigint, message: string, error: any): Promise<void> {
    logger.err(
      `Error for campaign ID ${campaignId}: ${message}
            Error::${error}`
    );

    await prisma.campaignLog.create({
      data: {
        campaign_id: campaignId,
        data: JSON.stringify(error),
        message,
        status: CampaignStatuses.INTERNAL_ERROR,
      },
    });
  }

  protected async logCampaignData(params: NonNullable<Omit<CampaignLog, "id" | "timestamp">>) {
    const { campaign_id, status, data, message } = params;
    await prisma.campaignLog.create({
      data: {
        campaign_id,
        status,
        message,
        data: JSONBigInt.parse(JSONBigInt.stringify(data)),
      },
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
        transaction_data: JSONBigInt.parse(JSONBigInt.stringify(transaction_data)),
      },
    });
  }

  protected generateRandomString(length: number) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () => characters.charAt(Math.floor(Math.random() * characters.length))).join("");
  }

  protected async getRewardsValues(reward: string, type: CampaignTypes, tokenId?: string) {
    if (type === "HBAR" && !tokenId) {
      return convertToTinyHbar(reward);
    } else {
      if (!this.tokenData || this.tokenData.id.toString() !== tokenId?.toString()) {
        this.tokenData = await prisma.whiteListedTokens.findUnique({
          where: { token_id: tokenId?.toString() },
        });
      }

      return Number(reward) * 10 ** Number(this.tokenData?.decimals);
    }
  }

  public async createNewCampaign({ fungible_token_id, ...params }: createCampaignParams, userId: number | bigint) {
    const { name, tweet_text, comment_reward, retweet_reward, like_reward, quote_reward, campaign_budget, type, media } = params;

    const emptyFields = Object.entries(params)
      .filter(([, value]) => isEmpty(value))
      .map(([key]) => key);

    if (emptyFields.length > 0) {
      return {
        error: true,
        message: `The following fields are required and should not be empty: ${emptyFields.join(", ")}.`,
      };
    }

    if (type === "FUNGIBLE" && !fungible_token_id) {
      return {
        error: true,
        message: `Token id feild should not empty`,
      };
    }

    const contract_id = this.generateRandomString(20);

    try {
      const campaignData: Prisma.XOR<Prisma.campaign_twittercardCreateInput, Prisma.campaign_twittercardUncheckedCreateInput> = {
        name,
        tweet_text,
        comment_reward: await this.getRewardsValues(comment_reward, type, fungible_token_id),
        retweet_reward: await this.getRewardsValues(retweet_reward, type, fungible_token_id),
        like_reward: await this.getRewardsValues(like_reward, type, fungible_token_id),
        quote_reward: await this.getRewardsValues(quote_reward, type, fungible_token_id),
        campaign_budget: await this.getRewardsValues(campaign_budget, type, fungible_token_id),
        card_status: CampaignStatuses.UNDER_REVIEW,
        amount_spent: 0,
        amount_claimed: 0,
        media,
        approve: false,
        contract_id,
        type,
        owner_id: userId,
      };

      if (type === "FUNGIBLE") {
        campaignData.fungible_token_id = fungible_token_id?.toString();
        campaignData.decimals = this.tokenData?.decimals || 0;
      }

      const newCampaign = await prisma.campaign_twittercard.create({
        data: { ...campaignData },
      });

      return {
        success: true,
        data: JSONBigInt.parse(JSONBigInt.stringify(rmKeyFrmData(newCampaign, ["last_reply_checkedAt", "last_thread_tweet_id", "contract_id"]))),
      };
    } catch (err) {
      // Report error
      logger.err(`Error::  Erroe while creating campaign`);

      // throw error
      throw err;
    }
  }

  public async getLogsOfTheCampaign() {
    const card = this.ensureCampaignCardLoaded();
    let redisLog: CampaignCardData | null = null;
    let campaignLogData: CampaignLog[] | null = null;
    if (card.contract_id) {
      redisLog = await this.redisClient.readCampaignCardStatus(card.contract_id!);
      campaignLogData = await prisma.campaignLog.findMany({ where: { campaign_id: card.id } });
      return { redisLog, campaignLogData };
    }
    return { redisLog, campaignLogData };
  }
}

export default CampaignLifeCycleBase;
