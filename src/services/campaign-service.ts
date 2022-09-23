import prisma from "@shared/prisma";
import { twitterStatus } from "src/@types/custom";

export const getCampaignDetailsById = async (campaignId: number) => {
  return await prisma.campaign_twittercard.findUnique({
    where: {
      id: campaignId,
    },
    include: {
      user_user: {
        select: {
          hedera_wallet_id: true,
          available_budget: true,
        },
      },
    },
  });
};

export const getRunningCardsOfUserId = async (userId: number | bigint) => {
  return await prisma.campaign_twittercard.findFirst({
    where: {
      owner_id: userId,
      card_status: "Running",
    },
  });
};

export const updateCampaignStatus = async (campaignId: number | bigint, status: twitterStatus) => {
  return await prisma.campaign_twittercard.update({
    where: {
      id: campaignId,
    },
    data: {
      card_status: status,
    },
  });
};

export const completeCampaignOperation = (id: number | bigint) => {
  console.log("close campaign operation", id);
  return {message:"done"}
};
