import { Status } from "@hashgraph/sdk";
import {
    campaign_twittercard
} from "@prisma/client";
import { checkTokenAssociation } from "@shared/helper";
import { getPrismaClient } from "@shared/prisma";
import logger from "jet-logger";
import { RewardsObj } from "src/@types/custom";
import {
    incrementClaimAmount
} from "../campaign-service";
import { distributeTokenUsingSDK, provideActiveContract } from "../contract-service";
import ContractCampaignLifecycle from "../ContractCampaignLifecycle";
import { updatePaymentStatusToManyRecords } from "../engagement-service";
import {
    transferAmountFromContractUsingSDK
} from "../transaction-service";
import userService from "../user-service";


const _getRewardsFromCard = (card: campaign_twittercard): RewardsObj => {
    const { like_reward, retweet_reward, quote_reward, comment_reward } = card;
    const rewards: RewardsObj = {
        like_reward: like_reward ?? 0,
        retweet_reward: retweet_reward ?? 0,
        quote_reward: quote_reward ?? 0,
        comment_reward: comment_reward ?? 0,
    };
    return rewards;
};

const _calculateTotalRewardForAnUser = async (
    rewards: RewardsObj,
    engagedUserID: string,
    cardID: bigint | number
): Promise<{ total: number; ids: bigint[] }> => {
    const prisma = await getPrismaClient();
    const { like_reward, retweet_reward, quote_reward, comment_reward } = rewards;
    let total = 0;
    const ids: bigint[] = [];

    const engagements = await prisma.campaign_tweetengagements.findMany({
        where: {
            user_id: engagedUserID,
            payment_status: "UNPAID",
            tweet_id: cardID,
        },
    });

    for (let i = 0; i < engagements.length; i++) {
        const engagement = engagements[i];
        ids.push(engagement.id);

        if (engagement.engagement_type === "Like") total += like_reward;
        if (engagement.engagement_type === "Retweet") total += retweet_reward;
        if (engagement.engagement_type === "Quote") total += quote_reward;
        if (engagement.engagement_type === "Reply") total += comment_reward;
    }

    return { total, ids };
};

const _updateEngagementsToPaid = async (ids: bigint[]) => {
    const prisma = await getPrismaClient();
    return await prisma.campaign_tweetengagements.updateMany({
        data: {
            payment_status: "PAID",
        },
        where: {
            id: {
                in: ids,
            },
        },
    });
}


const getCardDetails = async (cardId: bigint) => {
    const prisma = await getPrismaClient();
    return await prisma.campaign_twittercard.findUnique({
        where: { id: cardId },
        include: {
            user_user: {
                select: {
                    hedera_wallet_id: true,
                    business_twitter_handle: true,
                },
            },
        },
    });
};


const adjustTotalReward = async (cardType: string, campaigner: any, card: any, tokenId: string | undefined, totalDistributableReward: number) => {
    console.log("Adjusting total reward::totalDistributableReward::");
    const contractDetails = await provideActiveContract();
    const campaignLifecycleService = new ContractCampaignLifecycle(contractDetails?.contract_id);
    if (cardType === "HBAR") {
        await campaignLifecycleService.adjustTotalReward({
            campaigner: campaigner.hedera_wallet_id,
            campaignAddress: card.contract_id!,
            totalAmount: totalDistributableReward,
        });
        logger.info("Total reward distributed::" + totalDistributableReward);
    } else if (cardType === "FUNGIBLE" && tokenId) {
        await campaignLifecycleService.adjustTotalFungibleReward({
            tokenId,
            campaigner: campaigner.hedera_wallet_id,
            campaignAddress: card.contract_id!,
            tokenTotalAmount: totalDistributableReward,
        });
        logger.info("Total reward distributed::" + totalDistributableReward);
    }
};

const distributeRewardsToUsers = async (totalRewardMappedWithUser: {
    reward: {
        total: number;
        ids: bigint[];
    };
    hedera_wallet_id: string;
    id: bigint;
    personal_twitter_handle: string | null;
    personal_twitter_id: string | null;
}[], cardType: string, card: any, tokenId: string | undefined, campaigner: any) => {
    console.log("Distributing rewards to users::");
    const processUserRewards = async (user: {

        reward: {
            total: number;
            ids: bigint[];
        };
        id: bigint;
        personal_twitter_handle: string | null;
        personal_twitter_id: string | null;
        hedera_wallet_id: string;
    }) => {
        const { total, ids } = user.reward;
        console.log("Processing user rewards::");

        if (cardType === "FUNGIBLE" && tokenId) {
            const isTokenAssociated = await checkTokenAssociation(tokenId, user.hedera_wallet_id);

            if (isTokenAssociated) {
                const response = await distributeTokenUsingSDK({
                    tokenId,
                    userId: user.hedera_wallet_id,
                    amount: total,
                    xHandle: campaigner.business_twitter_handle,
                });

                if (response?.status._code === 22) {
                    await updatePaymentStatusToManyRecords(ids, "PAID");
                    await userService.totalReward(user.id, total, "increment");
                }
            }
        } else if (cardType === "HBAR" && card.contract_id) {
            const rewardTrx = await transferAmountFromContractUsingSDK({
                intractorWallet: user.hedera_wallet_id,
                amount: total,
                xHandle: campaigner.business_twitter_handle,
            });

            if (rewardTrx?.status === Status.Success) {
                await _updateEngagementsToPaid(ids);
                await userService.totalReward(user.id, total, "increment");
            }
        }
    };

    for (const user of totalRewardMappedWithUser) {
        await processUserRewards(user);
    }
};


/**
 * 1. Ask smart contract first for state update with total eligible reward balance
  * 2. Then start transferring rewards to the users, keep the record of transaction in DB
      */
export const performAutoRewardingForEligibleUser = async (cardId: bigint) => {
    logger.info("Executing Auto reward process::");
    console.log("Executing Auto reward process::");
    const prisma = await getPrismaClient();
    try {
        const engagementsByUser = await prisma.campaign_tweetengagements.groupBy({
            by: ["user_id"],
            where: {
                tweet_id: cardId,
                payment_status: "UNPAID",
            },
        });

        const engagedUsers = engagementsByUser.map((engagement) => engagement.user_id).filter((id) => Boolean(id));
        const usersRecords = await prisma.user_user.findMany({
            where: {
                personal_twitter_id: {
                    in: engagedUsers.filter((id): id is string => id !== null),
                },
            },
            select: {
                id: true,
                hedera_wallet_id: true,
                personal_twitter_handle: true,
                personal_twitter_id: true,
            },
        });


        const userWithWallet = usersRecords.filter((user) => Boolean(user.hedera_wallet_id));


        if (userWithWallet.length > 0) {
            const cardDetails = await getCardDetails(cardId);
            if (!cardDetails) {
                throw new Error("Card details not found");
            }

            const { user_user: campaigner, ...card } = cardDetails;
            const rewards = _getRewardsFromCard(card);
            const tokenId = card?.fungible_token_id;
            const cardType = card?.type;

            let totalDistributableReward = 0;
            const totalRewardMappedWithUser = await Promise.all(userWithWallet.map(async (user) => {
                const totalReward = await _calculateTotalRewardForAnUser(rewards, user?.personal_twitter_id!, cardId);
                totalDistributableReward += totalReward.total;
                return {
                    ...user,
                    reward: totalReward,
                };
            }));

            if (totalDistributableReward > 0) {
                logger.info(`Total reward distributable::${totalDistributableReward}`);
                await adjustTotalReward(cardType!, campaigner, card, tokenId!, totalDistributableReward);
                await distributeRewardsToUsers(totalRewardMappedWithUser, cardType!, card, tokenId!, campaigner);
                await incrementClaimAmount(cardId, totalDistributableReward);
            }
            logger.warn("Total auto reward distributed::" + totalDistributableReward);
        } else {
            logger.warn("No user found for auto rewarding");
            console.log("No user found for auto rewarding");
        }
    } catch (error) {
        console.error(error);
        logger.err(`Error in performAutoRewardingForEligibleUser: ${error}`);
    }
};

