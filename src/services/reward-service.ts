import { Status } from "@hashgraph/sdk";
import {
  campaign_tweetengagements,
  campaign_twittercard,
  campaignstatus as CampaignStatus
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { checkTokenAssociation } from "@shared/helper";
import prisma from "@shared/prisma";
import logger from "jet-logger";
import BIGJSON from "json-bigint";
import { groupBy } from "lodash";
import { RewardsObj } from "src/@types/custom";
import {
  getCampaignDetailsById,
  incrementClaimAmount,
} from "./campaign-service";
import { distributeTokenUsingSDK } from "./contract-service";
import ContractCampaignLifecycle from "./ContractCampaignLifecycle";
import { updatePaymentStatusToManyRecords } from "./engagement-servide";
import { provideActiveContract } from "./smartcontract-service";
import {
  transferAmountFromContractUsingSDK,
  updateCampaignBalance,
} from "./transaction-service";
import userService from "./user-service";

const calculateTotalRewards = (
  card: campaign_twittercard,
  data: campaign_tweetengagements[]
) => {
  const { like_reward, quote_reward, retweet_reward, comment_reward } = card;
  console.log(card, "Inside totalRewards: ");
  let total = 0;
  data.forEach((d) => {
    switch (d.engagement_type) {
      case "Like":
        total += like_reward!;
        break;
      case "Quote":
        total += quote_reward!;
        break;
      case "Retweet":
        total += retweet_reward!;
        break;
      case "Reply":
        total += comment_reward!;
        break;
      default:
        break;
    }
  });
  console.log(total);
  return Math.round(total);
};

/****
 *@description This will be used to show how much amount still pending for an user to claim.
 * @return rewards in tinyhabr
 * @param personal_twitter_id Twitter id of the current user's come to claim their total pending rewards for claiming.
 * @param intractor_hedera_wallet_id hedera wallet id of the user's who is claiming their rewards in format `0.0.01245`.
 */
export const totalPendingReward = async (
  personal_twitter_id: string,
  intractor_hedera_wallet_id: string
) => {
  console.log(
    "Reward calculation and transfer for user::",
    intractor_hedera_wallet_id
  );
  //TODO:  Query all activeEngagements of this users from DB.
  const allUnpaidEngagementsForAnUser =
    await prisma.campaign_tweetengagements.findMany({
      where: {
        user_id: personal_twitter_id,
        payment_status: "UNPAID",
        exprired_at: {
          gte: new Date(),
        },
      },
    });
  console.log("allUnpaidEngagementsForAnUser", allUnpaidEngagementsForAnUser);
  const groupedData = groupBy(allUnpaidEngagementsForAnUser, "tweet_id"); //? Grouping all engagements regards og their campaign_card(DB).

  //TODO: will calculate total amounts pending for this user.
  await Promise.all([
    Object.keys(groupedData).map(async (d) => {
      const campaignDetails = await getCampaignDetailsById(parseInt(d)); //? will return campaign card form DB. Contain rewards pricing.
      const { user_user, ...card } = campaignDetails!;

      const totalForCard = calculateTotalRewards(card, groupedData[d]); //TODO: Wll calculate total for a single card.

      logger.info(
        `Card::${card.id} userWallet:${intractor_hedera_wallet_id} totalForThisCard::${totalForCard}`
      );
      //!!===== Transfer begins==============!!
      if (card && groupedData[d].length > 0 && user_user?.hedera_wallet_id) {
        //!! SM record update call;
        await updateCampaignBalance({
          campaignerAccount: user_user.hedera_wallet_id!,
          campaignId: card.id.toString(),
          amount: totalForCard,
        });

        //!! Transferring that much amount from smart contract to user's wallet.
        await transferAmountFromContractUsingSDK({
          intractorWallet: intractor_hedera_wallet_id,
          amount: totalForCard,
          campaignAddress: card.contract_id!,
        })
        //!! Update Payment status in DB.
        await updatePaymentStatusToManyRecords(
          groupedData[d].map((d) => d.id),
          "PAID"
        );

        //!! Increment claim amount in localDB.
        await incrementClaimAmount(card.id, totalForCard);
        await userService.totalReward(
          card.owner_id!,
          totalForCard,
          "increment"
        );
      }
    }),
  ]);
};

export const getRewardDetails = async (data: any) => {
  const user = await prisma.user_user.findUnique({
    where: {
      hedera_wallet_id: data,
    },
  });

  // return user
  // console.log(user);
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

export const claim = async (
  cardId: number | bigint,
  contract_id: string,
  intractorWalletId: string
) => {
  const user = await prisma.user_user.findUnique({
    where: {
      hedera_wallet_id: intractorWalletId,
    },
  });

  const engagements = await prisma.campaign_tweetengagements.findMany({
    where: {
      user_id: user?.personal_twitter_id,
      payment_status: "UNPAID",
    },
  });
  const campaignDetails = await prisma.campaign_twittercard.findUnique({
    where: { id: cardId },
    include: {
      user_user: {
        select: {
          hedera_wallet_id: true,
          personal_twitter_handle: true,
          personal_twitter_id: true,
        },
      },
    },
  });

  // console.log(user)
  if (campaignDetails?.card_status !== CampaignStatus.RewardDistributionInProgress) {
    return "Campaign is not closed";
  }

  let totalRewardsDebited = 0;
  const { user_user, ...card } = campaignDetails;
  const groupedData = groupBy(engagements, "user_id");

  const processHBARRewards = async () => {
    if (user && user?.personal_twitter_id) {
      const contractDetails = await provideActiveContract();
      const campaignLifecycleService = new ContractCampaignLifecycle(contractDetails?.contract_id);
      const totalRewardsTinyHbar = calculateTotalRewards(card, engagements);
      console.log(`Starting payment for user::${user?.personal_twitter_id} amount:: ${totalRewardsTinyHbar}`);

      // 6(A) Transfer HBAR from contract to the user wallet;
      await campaignLifecycleService.adjustTotalReward({
        campaigner: user.hedera_wallet_id,
        campaignAddress: card.contract_id!,
        totalAmount: totalRewardsTinyHbar
      })

      await transferAmountFromContractUsingSDK({
        intractorWallet: user?.hedera_wallet_id,
        amount: totalRewardsTinyHbar,
        campaignAddress: card.contract_id!,
      });

      await updatePaymentStatusToManyRecords(
        engagements.map((d) => d.id),
        "PAID"
      );

      await userService.totalReward(
        user.id,
        totalRewardsTinyHbar,
        "increment"
      );

      totalRewardsDebited += totalRewardsTinyHbar;
      await incrementClaimAmount(cardId, totalRewardsDebited);

      await updateCampaignBalance({
        campaignerAccount: user?.hedera_wallet_id,
        campaignId: contract_id,
        amount: totalRewardsDebited,
      });

      return "Reward claim successful";
    }
  };

  const processFUNGIBLERewards = async () => {
    if (user && user?.personal_twitter_id && campaignDetails?.fungible_token_id) {
      const campaignLifecycleService = new ContractCampaignLifecycle();
      const totalRewardsTinyHbar = calculateTotalRewards(card, engagements);
      console.log(`Starting payment for user::${user?.personal_twitter_id} amount:: ${totalRewardsTinyHbar}`);

      await campaignLifecycleService.adjustTotalFungibleReward({
        tokenId: campaignDetails.fungible_token_id,
        campaigner: user.hedera_wallet_id,
        campaignAddress: card.contract_id!,
        tokenTotalAmount: totalRewardsTinyHbar,
      })

      const response = await distributeTokenUsingSDK({
        userId: user.personal_twitter_id,
        amount: totalRewardsTinyHbar,
        campaign: card.contract_id!,
        tokenId: campaignDetails.fungible_token_id,
      });

      if (response?.status._code === 22) {
        await updatePaymentStatusToManyRecords(
          engagements.map((d) => d.id),
          "PAID"
        );

        await userService.totalReward(
          user.id,
          totalRewardsTinyHbar,
          "increment"
        );

        totalRewardsDebited += totalRewardsTinyHbar;
        await incrementClaimAmount(cardId, totalRewardsDebited);

        return "Reward claim successful";
      } else if (response?.status._code === 184) {
        return "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT";
      }
    }
  };

  if (campaignDetails?.type === "HBAR") {
    return await processHBARRewards();
  } else if (campaignDetails?.type === "FUNGIBLE") {
    return await processFUNGIBLERewards();
  }
};

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

const _updateEngagementsToPaid = async (ids: bigint[]) =>
  await prisma.campaign_tweetengagements.updateMany({
    data: {
      payment_status: "PAID",
    },
    where: {
      id: {
        in: ids,
      },
    },
  });


/**
 * 1. Ask smart contract first for state update with total eligible reward balance
  * 2. Then start transferring rewards to the users, keep the record of transaction in DB
      */
export const performAutoRewardingForEligibleUser = async (cardId: bigint) => {
  logger.info("Executing Auto reward process::");
  console.log("Executing Auto reward process::");

  try {
    const engagementsByUser = await prisma.campaign_tweetengagements.groupBy({
      by: ["user_id"],
      where: {
        tweet_id: cardId,
        payment_status: "UNPAID",
      },
    });

    console.log("Engagements by user::", BIGJSON.stringify(engagementsByUser));

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

    console.log("User with wallet::", BIGJSON.stringify(userWithWallet));

    if (userWithWallet.length > 0) {
      const cardDetails = await getCardDetails(cardId);
      if (!cardDetails) throw new Error("Card details not found");

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

      console.log("Total reward mapped with user::", BIGJSON.stringify(totalRewardMappedWithUser));

      if (totalDistributableReward > 0) {
        logger.info(`Total reward distributable::${totalDistributableReward}`);
        await adjustTotalReward(cardType!, campaigner, card, tokenId!, totalDistributableReward);
        await distributeRewardsToUsers(totalRewardMappedWithUser, cardType!, card, tokenId!);
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
    throw new Error("Error in performAutoRewardingForEligibleUser");
  }
};






const getCardDetails = async (cardId: bigint) => {
  return await prisma.campaign_twittercard.findUnique({
    where: { id: cardId },
    include: {
      user_user: {
        select: {
          hedera_wallet_id: true,
        },
      },
    },
  });
};


const adjustTotalReward = async (cardType: string, campaigner: any, card: any, tokenId: string | undefined, totalDistributableReward: number) => {
  console.log("Adjusting total reward::totalDistributableReward::", totalDistributableReward);
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
}[], cardType: string, card: any, tokenId: string | undefined) => {
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
          campaign: card.contract_id!,
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
        campaignAddress: card.contract_id,
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

