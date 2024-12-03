
import { Decimal } from "@prisma/client/runtime/library";
import createPrismaClient from "@shared/prisma";

/**
 * @description This will be used to get the reward details to show the user how much reward they can claim.
 * @param data  hedera_wallet_id of the user
 * @returns 
 */
export const getRewardDetails = async (data: string) => {
    const prisma = await createPrismaClient();
    const user = await prisma.user_user.findUnique({
        where: {
            hedera_wallet_id: data,
        },
    });

    const engagementDetails = await prisma.campaign_tweetengagements.findMany({
        where: {
            user_id: user?.personal_twitter_id,
            payment_status: "UNPAID",
        },
        select: {
            engagement_type: true,
            tweet_id: true,
            id: true,
            campaign_twittercard: true,
        },
    });

    const updateData = [];

    for (let i = 0; i < engagementDetails.length; i++) {
        type CampaignTwitterCard = {
            like_reward: number | null;
            retweet_reward: number | null;
            quote_reward: number | null;
            comment_reward: number | null;
            engagement_type: string | null;
            token_id: string | null;
            id: bigint | null;
            name: string | null;
            type: string | null;
            contract_id: string | null;
            decimals: Decimal | null;
        };

        const obj: CampaignTwitterCard = {
            like_reward: 0,
            retweet_reward: 0,
            quote_reward: 0,
            comment_reward: 0,
            engagement_type: engagementDetails[i].engagement_type,
            token_id: engagementDetails[i].campaign_twittercard.fungible_token_id,
            id: engagementDetails[i].campaign_twittercard.id,
            name: engagementDetails[i].campaign_twittercard.name,
            type: engagementDetails[i].campaign_twittercard.type,
            contract_id: engagementDetails[i].campaign_twittercard.contract_id,
            decimals: engagementDetails[i].campaign_twittercard.decimals,
        };

        // if(engagementDetails[i].campaign_twittercard.card_status === "Campaign Complete, Initiating Rewards") {
        if (engagementDetails[i].engagement_type === "Like") {
            obj.like_reward = engagementDetails[i].campaign_twittercard.like_reward;
        }
        if (engagementDetails[i].engagement_type === "Retweet") {
            obj.retweet_reward =
                engagementDetails[i].campaign_twittercard.retweet_reward;
        }
        if (engagementDetails[i].engagement_type === "Quote") {
            obj.quote_reward = engagementDetails[i].campaign_twittercard.quote_reward;
        }
        if (engagementDetails[i].engagement_type === "Reply") {
            obj.comment_reward =
                engagementDetails[i].campaign_twittercard.comment_reward;
        }
        updateData.push(obj);
    }
    return updateData;
};




export * from "./on-card";
// export * from "./on-peronal-handle";

