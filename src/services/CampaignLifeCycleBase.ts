import { CampaignLog, campaignstatus as CampaignStatus, Prisma, campaign_twittercard, transactions, user_balances, user_user, whiteListedTokens } from "@prisma/client";
import initHederaService from "@services/hedera-service";
import { addMinutesToTime, convertToTinyHbar, rmKeyFrmData } from "@shared/helper";
import createPrismaClient from "@shared/prisma";
import logger from "jet-logger";
import JSONBigInt from "json-bigint";
import { isEmpty, isNil } from "lodash";
import moment from "moment";
import { getConfig } from "@appConfig";
import RedisClient, { CampaignCardData } from "./redis-servie";
import { MediaService } from "./media-service";
import JSONBigint from "json-bigint"

export enum LYFCycleStages {
  CREATED = "status:created",
  RUNNING = "status:running",
  PAUSED = "status:paused",
  COMPLETED = "status:completed",
  EXPIRED = "status:expired",
}

export enum CampaignCommands {
  StartCampaign = "Campaign::satrt",
  ClaimReward = "Campaign::reward-claim",
  AdminApprovedCampaign = "Campaign::admin-approved",
  AdminRejectedCampaign = "Campaign::admin-rejected",
}

export type CampaignTypes = "HBAR" | "FUNGIBLE";

export interface createCampaignParams {
  name: string;
  tweet_text: string;
  comment_reward: string;
  retweet_reward: string;
  like_reward: string;
  quote_reward: string;
  follow_reward: string;
  campaign_budget: string;
  media: string[];
  type: CampaignTypes;
  fungible_token_id?: string;
}

type TransactionRecord = NonNullable<Omit<transactions, "id" | "created_at" | "network">>;

export type CardOwner = user_user & { user_balances: user_balances[] };

class CampaignLifeCycleBase {
  protected campaignCard: campaign_twittercard | null = null;
  protected cardOwner: CardOwner | null = null;
  protected tweetId: string | null = null;
  protected lastThreadId: string | null = null;
  protected redisClient: RedisClient;
  protected campaignDurationInMin = 15;
  protected runningCardCount = 0;
  protected tokenData: whiteListedTokens | null = null;

  constructor(redisServerUrl: string) {
    this.redisClient = new RedisClient(redisServerUrl);
  }

  static async create<T extends CampaignLifeCycleBase>(this: new (redisServerUrl: string) => T, id: number | bigint): Promise<T> {
    const config = await getConfig();
    const instance = new this(config.db.redisServerURI);
    await instance.loadRequiredData(id);
    return instance;
  }

  protected isValid(value: any): boolean {
    return !isNil(value) && !isEmpty(value) && value !== false;
  }

  protected areAllValuesValid(...values: any[]): boolean {
    return values.every(this.isValid);
  }

  private async loadRequiredData(id: number | bigint): Promise<void> {
    const prisma = await createPrismaClient();
    const appConfig = await getConfig();

    this.campaignDurationInMin = appConfig.app.defaultCampaignDuratuon;

    try {
      // Query for the card
      const card = await prisma.campaign_twittercard.findUnique({
        where: { id },
        include: {
          user_user: {
            include: {
              user_balances: true,
            },
          },
        },
      });

      if (!card) {
        throw new Error(`Campaign card with ID ${id} not found`);
      }

      // if token id avialable for card load token data
      if (card.fungible_token_id) {
        console.log("Loading token data for card:", card.fungible_token_id);
        const token = await prisma.whiteListedTokens.findUnique({
          where: { token_id: String(card.fungible_token_id) },
        });
        console.log("Token data loaded:", token);
        if (token) {
          this.tokenData = token;
        }
      }

      // Query for the running card count
      const runningCardCount = await prisma.campaign_twittercard.count({
        where: {
          owner_id: card.owner_id,
          card_status: CampaignStatus.CampaignRunning,
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

  protected ensureCardOwnerDataLoaded(): CardOwner {
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
    const prisma = await createPrismaClient();
    return await prisma.campaign_twittercard.update({
      where: { id: card.id },
      data: {
        tweet_id: this.tweetId,
        last_thread_tweet_id: this.lastThreadId,
        card_status: CampaignStatus.CampaignRunning,
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

    const prisma = await createPrismaClient();

    await prisma.campaignLog.create({
      data: {
        campaign_id: campaignId,
        data: JSON.stringify(error),
        message,
        status: CampaignStatus.InternalError,
      },
    });
  }

  protected async logCampaignData(params: NonNullable<Omit<CampaignLog, "id" | "timestamp">>) {
    const prisma = await createPrismaClient();
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
    const prisma = await createPrismaClient();
    const hederaService = await initHederaService()
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
    const prisma = await createPrismaClient();
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

  public async createNewCampaign({ fungible_token_id, media ,  ...params }: createCampaignParams, userId: number | bigint) {
    const { name, tweet_text, comment_reward, retweet_reward, like_reward, quote_reward, campaign_budget, type } = params;
    const prisma = await createPrismaClient();
    if (fungible_token_id) {
      console.log("Loading token data for card:", fungible_token_id);
      this.tokenData = await prisma.whiteListedTokens.findUnique({
        where: { token_id: String(fungible_token_id) },
      });
    }
    const emptyFields = Object.entries(params)
      .filter(([, value]) => isEmpty(value))
      .map(([key]) => key);

    if (emptyFields.length > 0) {
      return {
        error: true,
        message: `The following fields are required and should not be empty: ${emptyFields.join(", ")}.`,
      };
    }

    if (type === "FUNGIBLE" && !fungible_token_id || !this.tokenData) {
      return {
        error: true,
        message: `Token id field should not be empty`,
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
        card_status: CampaignStatus.ApprovalPending,
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
        campaignData.decimals = this.tokenData?.decimals ?? 0;
      }

      console.log("Campaign Data:", JSONBigint.stringify(campaignData));
      console.log("data" , JSONBigint.stringify(this.tokenData));

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

    const prisma = await createPrismaClient();
    if (card.contract_id) {
      redisLog = await this.redisClient.readCampaignCardStatus(card.contract_id!);
      campaignLogData = await prisma.campaignLog.findMany({ where: { campaign_id: card.id } });
      return { redisLog, campaignLogData };
    }
    return { redisLog, campaignLogData };
  }

  // Helper method to update campaign status on Redis
  protected async updateCampaignStatus(contractId: string, subTask?: string, isSuccess: boolean = false, LYFCycleStage: LYFCycleStages = LYFCycleStages.RUNNING) {
    await this.redisClient.updateCampaignCardStatus({
      card_contract_id: contractId,
      LYFCycleStage: LYFCycleStages.RUNNING,
      isSuccess,
      subTask,
    });
  }

  /**
   * Update the campaign card status to complete.
   * @param {number | bigint} id - The ID of the campaign card.
   * @param {string} last_thread_tweet_id - The ID of the last thread tweet.
   * @param {string} [card_status="Campaign Complete, Initiating Rewards"] - The status of the campaign card (optional, defaults to "Campaign Complete, Initiating Rewards").
   * @param {string} [campaignExpiryTimestamp] - The expiry timestamp of the campaign (optional).
   * @returns {Promise<campaign_twittercard>} The updated campaign card.
   */
  protected async updateCampaignCardToComplete(id: number | bigint, last_thread_tweet_id: string, card_status: CampaignStatus = CampaignStatus.RewardDistributionInProgress, campaignExpiryTimestamp?: string) {
    const prisma = await createPrismaClient();
    return await prisma.campaign_twittercard.update({
      where: { id },
      data: {
        card_status,
        last_thread_tweet_id,
        campaign_expiry: campaignExpiryTimestamp,
      },
    });
  }
}

export default CampaignLifeCycleBase;
