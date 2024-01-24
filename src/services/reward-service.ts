/* eslint-disable max-len */
import {
  campaign_tweetengagements,
  campaign_twittercard,
} from "@prisma/client";
import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import logger from "jet-logger";
import { groupBy } from "lodash";
import {
  getCampaignDetailsById,
  incrementClaimAmount,
} from "./campaign-service";
import { updatePaymentStatusToManyRecords } from "./engagement-servide";
import {
  transferAmountFromContractUsingSDK,
  updateCampaignBalance,
} from "./transaction-service";
import userService from "./user-service";
import { distributeToken } from "./contract-service";
import { Decimal } from "@prisma/client/runtime/library";
import { checkTokenAssociation } from "@shared/helper";
import { RewardsObj } from "src/@types/custom";
import { Status } from "@hashgraph/sdk";

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
        await transferAmountFromContractUsingSDK(
          intractor_hedera_wallet_id,
          totalForCard,
          `Hashbuzz reward payments for engagements`
        ),
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
    // }
  }

  // for(let i = 0; i <engagementDetails.length; i++) {
  //   if(engagementDetails[i].tweet_id ===)
  // }
  //   const tweetEngagements = await prisma.campaign_tweetengagements.findMany({
  //     where: {
  //       user_id: user?.personal_twitter_id,
  //       payment_status: "UNPAID"
  // },
  //     include: {
  //       campaign_twittercard: {
  //         where: {

  //         },
  //       },
  //     },
  //   })
  // const totalRewardsTinyHbar = calculateTotalRewards(campaignDetails, engagementDetails);
  // // const card = engagementDetails[0]?.campaign_twittercard
  // // if(engagementDetails[0] && engagementDetails[0].campaign_twittercard) {
  // //   // console.log(engagementDetails[0].campaign_twittercard)
  // //   const totalRewardsTinyHbar = calculateTotalRewards(engagementDetails[0].campaign_twittercard, engagementDetails);
  // //   console.log(totalRewardsTinyHbar)
  return updateData;
  // // }
};

export const claim = async (
  cardId: number | bigint,
  contract_id: string,
  data: any
) => {
  const user = await prisma.user_user.findUnique({
    where: {
      hedera_wallet_id: data,
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

  if (
    campaignDetails?.card_status === "Campaign Complete, Initiating Rewards"
  ) {
    let totalRewardsDebited = 0;
    const { user_user, ...card } = campaignDetails;
    const groupedData = groupBy(engagements, "user_id");

    // console.log(user)

    if (campaignDetails?.type === "HBAR") {
      if (user && user?.personal_twitter_id) {
        const totalRewardsTinyHbar = calculateTotalRewards(card, engagements);
        console.log(
          `Starting payment for user::${user?.personal_twitter_id} amount:: ${totalRewardsTinyHbar} `
        );
        await transferAmountFromContractUsingSDK(
          user?.hedera_wallet_id,
          totalRewardsTinyHbar
        ),
          await updatePaymentStatusToManyRecords(
            engagements.map((d) => d.id),
            "PAID"
          ),
          await userService.totalReward(
            user.id,
            totalRewardsTinyHbar,
            "increment"
          );
        totalRewardsDebited += totalRewardsTinyHbar;
        await incrementClaimAmount(cardId, totalRewardsDebited),
          await updateCampaignBalance({
            campaignerAccount: user?.hedera_wallet_id,
            campaignId: contract_id,
            amount: totalRewardsDebited,
          });
      }

      return "Reward claim successful";
    } else if (campaignDetails?.type === "FUNGIBLE") {
      console.log(campaignDetails, "FUNGIBLE");
      if (
        user &&
        user?.personal_twitter_id &&
        campaignDetails?.fungible_token_id
      ) {
        const totalRewardsTinyHbar = calculateTotalRewards(card, engagements);
        console.log(
          `Starting payment for user::${user?.personal_twitter_id} amount:: ${totalRewardsTinyHbar} `
        );
        //* Smart-contract call for payment
        // await transferAmountFromContractUsingSDK(user_info.hedera_wallet_id, totalRewardsTinyHbar),
        const response = await distributeToken(
          campaignDetails?.fungible_token_id,
          user?.hedera_wallet_id,
          totalRewardsTinyHbar,
          contract_id
        );
        // TODO: update Payment status in db
        if (response == 22) {
          await updatePaymentStatusToManyRecords(
            engagements.map((d) => d.id),
            "PAID"
          ),
            //increment reward bal
            await userService.totalReward(
              user.id,
              totalRewardsTinyHbar,
              "increment"
            ),
            (totalRewardsDebited += totalRewardsTinyHbar);

          await incrementClaimAmount(cardId, totalRewardsDebited);
          return "Reward claim successful";
        } else if (response == 184) {
          return "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT";
        }
      }
    }
  } else {
    return "Campaign is not closed";
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

export const performAutoRewardingForEligibleUser = async (cardId: bigint) => {
  logger.info("Executing Auto reward process::");
  // 1. get All the UNPAID engagements for current card group by user id

  const engagementsByUser = await prisma.campaign_tweetengagements.groupBy({
    by: ["user_id"],
    where: {
      tweet_id: cardId,
      payment_status: "UNPAID",
    },
  });

  // 2. List of all engaged users x user id;
  const engagedUsers = engagementsByUser
    .map((engagement) => engagement.user_id)
    .filter((id) => Boolean(id));

  //2. Get the Details of engaged users;
  const usersRecords = await prisma.user_user.findMany({
    where: {
      personal_twitter_id: {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        in: [...engagedUsers],
      },
    },
    select: {
      id: true,
      hedera_wallet_id: true,
      personal_twitter_handle: true,
      personal_twitter_id: true,
    },
  });

  //3. Filter our user without wallet;
  const userWithWallet = usersRecords.filter((user) =>
    Boolean(user.hedera_wallet_id)
  );

  if (userWithWallet.length > 0) {
    //4. Get the card details
    const cardDetails = await prisma.campaign_twittercard.findUnique({
      where: { id: cardId },
      include: {
        user_user: {
          select: {
            hedera_wallet_id: true,
          },
        },
      },
    });

    const { user_user: campaigner, ...card } = cardDetails!;

    const rewards = _getRewardsFromCard(card);
    const tokenId = card?.fungible_token_id;
    const cardType = card?.type;

    let totalRewardDistributed = 0;

    //4 (B) In case of campaign  type FUNGIBLE
    if (cardType === "FUNGIBLE" && tokenId) {
      logger.info("Rewarding as fungible campaign::");
      /**
       * 5(B) campaign is with fungible then we will check the token association status of the user;
       *      - If token is associated to user wallet
       *      - Then calculate total rewards;
       *  **/
      await Promise.all(
        userWithWallet.map(async (user) => {
          /** ===============  Per user reward distributions for FUNGIBLE ========================== */
          const isCampaignTokenIsAssociated = await checkTokenAssociation(
            tokenId,
            user.hedera_wallet_id
          );
          if (
            isCampaignTokenIsAssociated &&
            user.personal_twitter_id &&
            user.hedera_wallet_id &&
            card.contract_id
          ) {
            const { total, ids } = await _calculateTotalRewardForAnUser(
              rewards,
              user.personal_twitter_id,
              card.id
            );
            const walletId = user.hedera_wallet_id;
            logger.info("Transferring as fungible of total::" + total);
            //6 (B)_.Transfer reward to the user wallet
            const response = await distributeToken(
              tokenId,
              walletId,
              total,
              card.contract_id
            );
            if (response == 22) {
              //7(B) If transaction become successful;
              totalRewardDistributed += total;
              await Promise.all([
                //8 (B) update engagements tp paid status
                updatePaymentStatusToManyRecords(ids, "PAID"),

                // 9 (B) update total rewards in users account
                userService.totalReward(user.id, total, "increment"),
              ]);
            }
          }
        })
      );
    }

    // 4(A)  In case if campaign type HBAR
    if (card && cardType === "HBAR") {
      logger.info("Rewarding as HBAR campaign::");
      await Promise.all(
        userWithWallet.map(async (user) => {
          /** ===============  Per user reward distributions for HBAR ========================== */
          if (user.hedera_wallet_id && user.personal_twitter_id) {
            /**
             * 5(A) Calculate the total reward of the user with respect to campaign;
             *  */
            const { total, ids } = await _calculateTotalRewardForAnUser(
              rewards,
              user.personal_twitter_id,
              card.id
            );
            const walletId = user.hedera_wallet_id;
            logger.info("Transferring as HBAR of total::" + total);
            // 6(A) Transfer HBAR from contract to the user wallet;
            const rewardTrx = await transferAmountFromContractUsingSDK(
              walletId,
              total,
              `Rewards payment form hashbuzzz:: ${
                card.name ?? "For enactments on campaign"
              }`
            );
            if (rewardTrx?.status === Status.Success) {
              //7(A) Total amount distributed form the contract
              totalRewardDistributed += total;

              await Promise.all([
                // 8 (A) Update the engagements to paid;
                _updateEngagementsToPaid(ids),
                // 9 (A)  Update total claimed rewards for user.
                userService.totalReward(user.id, total, "increment"),
              ]);
            }
          }
        })
      );
    }

    /** ===============  Total operations ========================== */

    // 10 Update the SM records with total amount distributed;
    await incrementClaimAmount(cardId, totalRewardDistributed);

    if (
      cardType === "HBAR" &&
      campaigner?.hedera_wallet_id &&
      card.contract_id
    ) {
      // 11 (A) Update the SM records for total amount distributed
      await updateCampaignBalance({
        campaignerAccount: campaigner.hedera_wallet_id,
        campaignId: card.contract_id,
        amount: totalRewardDistributed,
      });
    }

    logger.warn("Total auto reward distributed::" + totalRewardDistributed);
  }
};

