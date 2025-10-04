import createPrismaClient from "@shared/prisma";
import { CampaignEvents } from "@V201/events/campaign";
import { EventPayloadMap } from "@V201/types";

export const onCloseRewardServices = async (payload : EventPayloadMap[CampaignEvents.CAMPAIGN_CLOSING_DISTRIBUTE_AUTO_REWARDS]) => {
    const { campaignId } = payload;
    const prisma = await createPrismaClient();

}
