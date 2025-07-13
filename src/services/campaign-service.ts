import { getConfig } from "@appConfig";
import { campaign_twittercard, campaignstatus as CampaignStatus } from "@prisma/client";
import { default as createPrismaClient } from "@shared/prisma";
import logger from "jet-logger";
import CloseCmapignLyfCycle from "./CloseCampaign";
import CampaignExpiryOperation from "./ExpireAndArchive";

export const getCampaignDetailsById = async (campaignId: number | bigint) => {
  const prisma = await createPrismaClient();
  return await prisma.campaign_twittercard.findUnique({
    where: {
      id: campaignId,
    },
    include: {
      user_user: {
        select: {
          id: true,
          hedera_wallet_id: true,
          available_budget: true,
          business_twitter_access_token: true,
          business_twitter_access_token_secret: true,
          personal_twitter_id: true,
        },
      },
    },
  });
};

export const getRunningCardsOfUserId = async (userId: number | bigint) => {
  const prisma = await createPrismaClient();
  return await prisma.campaign_twittercard.findFirst({
    where: {
      owner_id: userId,
      card_status: CampaignStatus.CampaignRunning,
    },
  });
};

export const incrementClaimAmount = async (cardId: number | bigint, amount: number) => {
  const prisma = await createPrismaClient();
  return await prisma.campaign_twittercard.update({
    where: { id: cardId },
    data: {
      amount_claimed: {
        increment: amount,
      },
    },
  });
};

export const updateCampaignStatus = async (campaignId: number | bigint, status: CampaignStatus) => {
  const prisma = await createPrismaClient();
  return await prisma.campaign_twittercard.update({
    where: {
      id: campaignId,
    },
    data: {
      card_status: status,
    },
  });
};

/**
 * 
 * @param card Campaign card to perform close operation on
 * @returns 
 */
export const completeCampaignOperation = async (card: campaign_twittercard) => {
  logger.warn("Complete operation started");
  const closeCmapaign = await CloseCmapignLyfCycle.create(card.id);
  const data = await closeCmapaign.performCloseCampaign();
  return data;
};


/**
 * 
 * @param id Campaign ID to perform expiry operation on
 * @returns Promise resolving to the result of the campaign expiry operation
 */
export const perFormCampaignExpiryOperation = async (id: number | bigint) => {
  const expiryInstance = await CampaignExpiryOperation.create(id);
  await expiryInstance.performCampaignExpiryOperation();
};
