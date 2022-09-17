import prisma from "@shared/prisma";

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

export const closeCampaignOperation = (id: number | bigint) => {
  console.log("close campaign operation", id);
};
