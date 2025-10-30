import {
  campaign_twittercard,
  campaignstatus as CampaignStatus,
  campaign_type,
  user_balances,
  user_user,
  whiteListedTokens,
} from '@prisma/client';
import logger from 'jet-logger';

import {
  expiryCampaign as expireHbarContract,
  expiryFungibleCampaign as expireFungibleContract,
  queryFungibleBalanceOfCampaigner,
} from '@services/contract-service';
import userService from '@services/user-service';
import twitterCardService from '@services/twitterCard-service';
import { formattedDateTime } from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import CampaignTwitterCardModel from '@V201/Modals/CampaignTwitterCard';
import UserBalancesModel from '@V201/Modals/UserBalances';
import WhiteListedTokensModel from '@V201/Modals/WhiteListedTokens';
import { V201OnCloseAutoRewardService } from '@V201/modules/campaigns/services/campaignClose/onCloseAutoReward';
import { CampaignScheduledEvents } from '@V201/events/campaign';
import { TaskSchedulerJobType } from '../../../../schedulerQueue';

type CampaignOwner = user_user & {
  user_balances: user_balances[];
};

const generateRequestId = () =>
  `v201-expiry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const hasValidAccessTokens = (owner: CampaignOwner) =>
  Boolean(
    owner.business_twitter_access_token &&
      owner.business_twitter_access_token_secret
  );

const resolveCampaignId = (campaignId: number | bigint) =>
  typeof campaignId === 'bigint' ? campaignId : BigInt(campaignId);

const setCampaignCompleted = async (
  campaignModel: CampaignTwitterCardModel,
  cardId: bigint,
  lastTweetId: string | null
) => {
  await campaignModel.updateCampaign(cardId, {
    card_status: CampaignStatus.RewardsDistributed,
    last_thread_tweet_id: lastTweetId,
    campaign_expiry: new Date().toISOString(),
  });
};

const generateExpiryMessage = (
  card: campaign_twittercard,
  tokenSymbol = 'HBAR',
  divisor = 1e8
) => {
  const currentTime = new Date();
  const timeString = currentTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const amountClaimed = (card.amount_claimed ?? 0) / divisor;
  const formattedAmount = amountClaimed.toFixed(2);

  if (card.campaign_type === campaign_type.quest) {
    return `✅ Allocation ended ${timeString} -> ${formattedAmount} ${tokenSymbol} distributed to quest winners!`;
  } else {
    // Default awareness campaign format
    return `Reward allocation concluded on ${formattedDateTime(
      currentTime.toISOString()
    )}. A total of ${formattedAmount} ${tokenSymbol} was given out for this promo.`;
  }
};

const expireHbarCampaign = async (
  campaignModel: CampaignTwitterCardModel,
  card: campaign_twittercard,
  owner: CampaignOwner,
  requestId: string
) => {
  logger.info(`[${requestId}] Expiring HBAR campaign ${card.id}`);

  const response = await expireHbarContract(card, owner);
  const decoded =
    response && 'dataDecoded' in response && Array.isArray(response.dataDecoded)
      ? response.dataDecoded
      : null;
  const balances = decoded ? Number(decoded[0] ?? 0) : 0;

  if (balances > 0) {
    await userService.topUp(owner.id, balances, 'update');
  }

  const expiryMessage = generateExpiryMessage(card);

  const lastTweetId = await twitterCardService.publishTweetORThread({
    tweetText: expiryMessage,
    isThread: true,
    parentTweetId: card.last_thread_tweet_id ?? undefined,
    cardOwner: owner,
  });

  await setCampaignCompleted(
    campaignModel,
    card.id,
    lastTweetId ?? card.last_thread_tweet_id ?? null
  );

  logger.info(`[${requestId}] HBAR campaign ${card.id} expired`);
};

const expireFungibleCampaign = async (
  campaignModel: CampaignTwitterCardModel,
  userBalancesModel: UserBalancesModel,
  card: campaign_twittercard,
  owner: CampaignOwner,
  tokenData: whiteListedTokens | null,
  requestId: string
) => {
  if (!card.fungible_token_id) {
    throw new Error('Fungible token ID is required for fungible campaign');
  }

  logger.info(`[${requestId}] Expiring fungible campaign ${card.id}`);

  await expireFungibleContract(card, owner);

  const campaignerBalance = Number(
    await queryFungibleBalanceOfCampaigner(
      owner.hedera_wallet_id,
      card.fungible_token_id
    )
  );

  if (tokenData) {
    const balanceRecord = owner.user_balances.find((balance) =>
      balance?.token_id ? balance.token_id === tokenData.id : false
    );

    if (
      balanceRecord &&
      Number(balanceRecord.entity_balance ?? 0) !== campaignerBalance
    ) {
      await userBalancesModel.updateBalance(balanceRecord.id, {
        entity_balance: campaignerBalance,
      });
    }
  }

  const decimals = card.decimals ? Number(card.decimals) : 0;
  const divisor = decimals > 0 ? 10 ** decimals : 1;
  const tweetMessage = generateExpiryMessage(
    card,
    tokenData?.token_symbol ?? 'HBAR',
    divisor
  );

  const lastTweetId = await twitterCardService.publishTweetORThread({
    tweetText: tweetMessage,
    cardOwner: owner,
    isThread: true,
    parentTweetId: card.last_thread_tweet_id ?? undefined,
  });

  await setCampaignCompleted(
    campaignModel,
    card.id,
    lastTweetId ?? card.last_thread_tweet_id ?? null
  );

  logger.info(`[${requestId}] Fungible campaign ${card.id} expired`);
};

export const runCampaignExpiry = async (
  job: TaskSchedulerJobType<CampaignScheduledEvents.CAMPAIGN_EXPIRATION_OPERATION>
) => {
  const campaignId = job.data?.cardId;
  const requestId = generateRequestId();
  const prisma = await createPrismaClient();
  const campaignModel = new CampaignTwitterCardModel(prisma);
  const userBalancesModel = new UserBalancesModel(prisma);
  const tokensModel = new WhiteListedTokensModel(prisma);
  const id = resolveCampaignId(campaignId);

  try {
    logger.info(`[${requestId}] Starting expiry for campaign ${id}`);

    const campaign = await campaignModel.getCampaignsWithOwnerData(id);

    if (!campaign) {
      throw new Error(`Campaign ${id.toString()} not found`);
    }

    const ownerRecord = campaign.user_user as user_user | null;
    const ownerBalances = ownerRecord
      ? await userBalancesModel.getBalanceByUserId(ownerRecord.id)
      : [];
    const owner = ownerRecord
      ? ({ ...ownerRecord, user_balances: ownerBalances } as CampaignOwner)
      : null;
    if (!owner) {
      throw new Error(`Campaign ${id.toString()} has no owner`);
    }

    if (!hasValidAccessTokens(owner)) {
      throw new Error(
        `Campaign owner ${owner.id.toString()} lacks valid access tokens`
      );
    }

    const autoRewardService = new V201OnCloseAutoRewardService(prisma);
    const autoRewardResult =
      await autoRewardService.performAutoRewardingForEligibleUser(campaign.id);

    if (autoRewardResult.success) {
      logger.info(
        `[${requestId}] Auto reward distributed ${autoRewardResult.totalDistributed} units to ${autoRewardResult.usersRewarded} users for campaign ${id}`
      );
    } else {
      logger.warn(
        `[${requestId}] Auto reward failed for campaign ${id}: ${
          autoRewardResult.errors?.join(', ') ?? 'Unknown error'
        }`
      );
    }

    if (campaign.type === 'HBAR') {
      await expireHbarCampaign(campaignModel, campaign, owner, requestId);
    } else if (campaign.type === 'FUNGIBLE') {
      const tokenData = campaign.fungible_token_id
        ? await tokensModel.getTokenDataByAddress(
            String(campaign.fungible_token_id)
          )
        : null;

      await expireFungibleCampaign(
        campaignModel,
        userBalancesModel,
        campaign,
        owner,
        tokenData,
        requestId
      );
    } else {
      throw new Error(
        `Unsupported campaign type: ${campaign.type ?? 'UNKNOWN'}`
      );
    }

    logger.info(`[${requestId}] Campaign ${id} expiry completed`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.err(
      `[${requestId}] Campaign expiry failed for ${id}: ${errorMessage}`
    );
    throw error;
  } finally {
    await prisma.$disconnect().catch((disconnectError) => {
      logger.err(
        `[${requestId}] Failed to disconnect prisma after expiry: ${String(
          disconnectError
        )}`
      );
    });
  }
};
