import { campaign_twittercard, campaignstatus as CampaignStatus } from "@prisma/client";
import prisma from "@shared/prisma";
import logger from "jet-logger";
import CloseCmapignLyfCycle from "./CloseCampaign";
import CampaignExpiryOperation from "./ExpireAndArchive";

export const getCampaignDetailsById = async (campaignId: number | bigint) => {
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
  return await prisma.campaign_twittercard.findFirst({
    where: {
      owner_id: userId,
      card_status: CampaignStatus.CampaignRunning,
    },
  });
};

export const incrementClaimAmount = async (cardId: number | bigint, amount: number) => {
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
  return await prisma.campaign_twittercard.update({
    where: {
      id: campaignId,
    },
    data: {
      card_status: status,
    },
  });
};

export const completeCampaignOperation = async (card: campaign_twittercard) => {
  logger.warn("Complete operation started");
  const closeCmapaign = await CloseCmapignLyfCycle.create(card.id);
  const data = await closeCmapaign.performCloseCampaign();
  return data;
};


export const perFormCampaignExpiryOperation = async (id: number | bigint, contract_id: string) => {
  const expiryInstance = await CampaignExpiryOperation.create(id);
  await expiryInstance.performCampaignExpiryOperation();
};
