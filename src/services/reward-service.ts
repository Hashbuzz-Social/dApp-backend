/* eslint-disable max-len */
import { campaign_tweetengagements, campaign_twittercard } from "@prisma/client";
import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import logger from "jet-logger";
import { groupBy } from "lodash";
import { getCampaignDetailsById, incrementClaimAmount } from "./campaign-service";
import { updatePaymentStatusToManyRecords } from "./engagement-servide";
import { transferAmountFromContractUsingSDK, updateCampaignBalance } from "./transaction-service";
import userService from "./user-service";
import { distributeToken } from "./contract-service";
import { Decimal } from "@prisma/client/runtime/library";

const calculateTotalRewards = (card: campaign_twittercard, data: campaign_tweetengagements[]) => {
  const { like_reward, quote_reward, retweet_reward, comment_reward } = card;
  console.log(card, "Inside totalRewards: ")
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
 *@description Find the users's who  have wallet id's had engaged on the campaign then group and sum rewards.
 */

// export const SendRewardsForTheUsersHavingWallet = async (cardId: number | bigint, contract_id: string) => {
//   console.log("campaignID:::", cardId);
//   const engagements = await prisma.campaign_tweetengagements.findMany({
//     where: {
//       tweet_id: cardId,
//       payment_status: "UNPAID",
//     },
//   });
//   const campaignDetails = await prisma.campaign_twittercard.findUnique({
//     where: { id: cardId },
//     include: {
//       user_user: {
//         select: {
//           hedera_wallet_id: true,
//           personal_twitter_handle: true,
//           personal_twitter_id: true,
//         },
//       },
//     },
//   });

//   let totalRewardsDebited = 0;
//   const { user_user, ...card } = campaignDetails!;
//   const groupedData = groupBy(engagements, "user_id");

//   console.log(groupedData, "Grouped data")
//   if (campaignDetails?.type === "HBAR") {
//     if (user_user?.hedera_wallet_id) {
//       //!! Loop through each intractor and check if they are an existing user and then reward them.
//       await Promise.all(
//         Object.keys(groupedData).map(async (personal_twitter_id) => {
//           const user_info = await userService.getUserByTwitterId(personal_twitter_id);
//           console.log(user_info, "Inside reward")
//           if (user_info?.hedera_wallet_id) {
//             const totalRewardsTinyHbar = calculateTotalRewards(card, groupedData[personal_twitter_id]);
//             console.log(`Starting payment for user::${user_info?.hedera_wallet_id} amount:: ${totalRewardsTinyHbar} `);
//             await Promise.all([
//               //* Smart-contract call for payment
//               await transferAmountFromContractUsingSDK(user_info.hedera_wallet_id, totalRewardsTinyHbar),

//               // TODO: update Payment status in db
//               await updatePaymentStatusToManyRecords(
//                 groupedData[personal_twitter_id].map((d) => d.id),
//                 "PAID"
//               ),

//               //increment reward bal
//               await userService.totalReward(user_info.id, totalRewardsTinyHbar, "increment")
//             ]);
//             totalRewardsDebited += totalRewardsTinyHbar;
//           }
//         })
//       );

//       await Promise.all([
//         //!!Update Amount claimed in the DB.
//         await incrementClaimAmount(cardId, totalRewardsDebited),

//         //!!update contract balance for this campaign.
//         await updateCampaignBalance({
//           campaignerAccount: user_user?.hedera_wallet_id,
//           campaignId: contract_id,
//           amount: totalRewardsDebited,
//         }),
//       ]);

//       try {
//         console.log("-------------")
//         await twitterAPI.sendDMFromHashBuzz(
//           user_user.personal_twitter_id!,
//           // eslint-disable-next-line max-len
//           `Greetings @${user_user.personal_twitter_handle!}\nThis is for your information only\n————————————\nCampaign: ${card.name!}\nStatus: completed \nRewarded: ${((totalRewardsDebited / Math.round(card.campaign_budget! * 1e8)) * 100).toFixed(2)}% of campaign budget*`
//         );
//       } catch (error) {
//         logger.err(error.message);
//       }
//     }

//     return groupedData;
//   } else if (campaignDetails?.type === "FUNGIBLE") {
//     console.log(campaignDetails, "FUNGIBLE");
//     if (user_user?.hedera_wallet_id) {
//       await Promise.all(
//         Object.keys(groupedData).map(async (personal_twitter_id) => {
//           const user_info = await userService.getUserByTwitterId(personal_twitter_id);
//           console.log(user_info?.hedera_wallet_id, "Inside reward")
//           if (user_info?.hedera_wallet_id) {
//             const totalRewardsTinyHbar = calculateTotalRewards(card, groupedData[personal_twitter_id]);
//             console.log(`Starting payment for user::${user_info?.hedera_wallet_id} amount:: ${totalRewardsTinyHbar} `);
//             if (campaignDetails?.fungible_token_id && campaignDetails?.user_user) {
//               //* Smart-contract call for payment
//               // await transferAmountFromContractUsingSDK(user_info.hedera_wallet_id, totalRewardsTinyHbar),
//               const response = await distributeToken(campaignDetails?.fungible_token_id, campaignDetails?.user_user?.hedera_wallet_id, user_info?.hedera_wallet_id, totalRewardsTinyHbar);
//               // TODO: update Payment status in db
//               if (response == 22) {
//                 await updatePaymentStatusToManyRecords(
//                   groupedData[personal_twitter_id].map((d) => d.id),
//                   "PAID"
//                 ),

//                   //increment reward bal
//                   await userService.totalReward(user_info.id, totalRewardsTinyHbar, "increment"),
//                   totalRewardsDebited += totalRewardsTinyHbar;
//               }
//             }
//           }
//         })
//       );

//       await Promise.all([
//         //!!Update Amount claimed in the DB.
//         await incrementClaimAmount(cardId, totalRewardsDebited),
//       ]);

//       try {
//         console.log("-------------")
//         await twitterAPI.sendDMFromHashBuzz(
//           user_user.personal_twitter_id!,
//           // eslint-disable-next-line max-len
//           `Greetings @${user_user.personal_twitter_handle!}\nThis is for your information only\n————————————\nCampaign: ${card.name!}\nStatus: completed \nRewarded: ${((totalRewardsDebited / Math.round(card.campaign_budget! * 1e8)) * 100).toFixed(2)}% of campaign budget*`
//         );
//       } catch (error) {
//         logger.err(error.message);
//       }
//     }
//   }

//   return groupedData;

// }

/****
 *@description This will be used to show how much amount still pending for an user to claim.
 * @return rewards in tinyhabr
 * @param personal_twitter_id Twitter id of the current user's come to claim their total pending rewards for claiming.
 * @param intractor_hedera_wallet_id hedera wallet id of the user's who is claiming their rewards in format `0.0.01245`.
 */
export const totalPendingReward = async (personal_twitter_id: string, intractor_hedera_wallet_id: string) => {
  console.log("Reward calculation and transfer for user::", intractor_hedera_wallet_id);
  //TODO:  Query all activeEngagements of this users from DB.
  const allUnpaidEngagementsForAnUser = await prisma.campaign_tweetengagements.findMany({
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

      logger.info(`Card::${card.id} userWallet:${intractor_hedera_wallet_id} totalForThisCard::${totalForCard}`);
      //!!===== Transfer begins==============!!
      if (card && groupedData[d].length > 0 && user_user?.hedera_wallet_id) {
        //!! SM record update call;
        await updateCampaignBalance({
          campaignerAccount: user_user.hedera_wallet_id!,
          campaignId: card.id.toString(),
          amount: totalForCard,
        });

        //!! Transferring that much amount from smart contract to user's wallet.
        await transferAmountFromContractUsingSDK(intractor_hedera_wallet_id, totalForCard, `Hashbuzz reward payments for engagements`),
          //!! Update Payment status in DB.
          await updatePaymentStatusToManyRecords(
            groupedData[d].map((d) => d.id),
            "PAID"
          );

        //!! Increment claim amount in localDB.
        await incrementClaimAmount(card.id, totalForCard);
        await userService.totalReward(card.owner_id!, totalForCard, "increment");

      }
    }),
  ]);
};

export const getRewardDetails = async (data: any) => {
  const user = await prisma.user_user.findUnique({
    where: {
      hedera_wallet_id: data
    }
  });

  // return user
  console.log(user);
  const engagementDetails = await prisma.campaign_tweetengagements.findMany({
    where: {
      user_id: user?.personal_twitter_id,
      payment_status: "UNPAID"
    },
    select:{
      engagement_type:true,
      tweet_id:true,
      id:true,
      campaign_twittercard:true,
    }
  })

  const updateData = []

  for(let i=0; i<engagementDetails.length; i++) {
    type CampaignTwitterCard = {
      like_reward: number | null;
      retweet_reward: number | null;
      quote_reward: number | null;
      comment_reward: number | null;
      engagement_type: string | null
      token_id: string | null,
      id: bigint | null
      name: string | null,
      type: string | null,
      contract_id: string | null,
      decimals: Decimal | null
    };
    
    const obj:CampaignTwitterCard = {
      like_reward: 0,
      retweet_reward: 0,
      quote_reward: 0,
      comment_reward: 0,
      engagement_type: engagementDetails[i].engagement_type,
      token_id: engagementDetails[i].campaign_twittercard.fungible_token_id,
      id:engagementDetails[i].campaign_twittercard.id,
      name:engagementDetails[i].campaign_twittercard.name,
      type:engagementDetails[i].campaign_twittercard.type,
      contract_id:engagementDetails[i].campaign_twittercard.contract_id,
      decimals: engagementDetails[i].campaign_twittercard.decimals
    }

    if(engagementDetails[i].engagement_type === "Like") {
      obj.like_reward = engagementDetails[i].campaign_twittercard.like_reward
    }
    if(engagementDetails[i].engagement_type === "Retweet") {
      obj.retweet_reward = engagementDetails[i].campaign_twittercard.retweet_reward
    }
    if(engagementDetails[i].engagement_type === "Quote") {
      obj.quote_reward = engagementDetails[i].campaign_twittercard.quote_reward
    }
    if(engagementDetails[i].engagement_type === "Reply") {
      obj.comment_reward = engagementDetails[i].campaign_twittercard.comment_reward
    }
    updateData.push(obj)

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


}

export const claim = async (cardId: number | bigint, contract_id: string, data: any) => {
  const user = await prisma.user_user.findUnique({
    where: {
      hedera_wallet_id: data
    }
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

  console.log(user)

  if (campaignDetails?.card_status === "Campaign Complete, Initiating Rewards") {
    let totalRewardsDebited = 0;
    const { user_user, ...card } = campaignDetails!;
    const groupedData = groupBy(engagements, "user_id");

    console.log(user)

    if (campaignDetails?.type === "HBAR") {
      if (user && user?.personal_twitter_id) {
        const totalRewardsTinyHbar = calculateTotalRewards(card, engagements);
        console.log(`Starting payment for user::${user?.personal_twitter_id} amount:: ${totalRewardsTinyHbar} `);
        await transferAmountFromContractUsingSDK(user?.hedera_wallet_id, totalRewardsTinyHbar),

          await updatePaymentStatusToManyRecords(
            engagements.map((d) => d.id),
            "PAID"
          ),

          await userService.totalReward(user.id, totalRewardsTinyHbar, "increment")
        totalRewardsDebited += totalRewardsTinyHbar;
        await incrementClaimAmount(cardId, totalRewardsDebited),

          await updateCampaignBalance({
            campaignerAccount: user?.hedera_wallet_id,
            campaignId: contract_id,
            amount: totalRewardsDebited,
          });
      }

      return "Reward claim successful"
    }
    else if (campaignDetails?.type === "FUNGIBLE") {
      console.log(campaignDetails, "FUNGIBLE");
      if (user && user?.personal_twitter_id && campaignDetails?.fungible_token_id) {
        const totalRewardsTinyHbar = calculateTotalRewards(card, engagements);
        console.log(`Starting payment for user::${user?.personal_twitter_id} amount:: ${totalRewardsTinyHbar} `);
        //* Smart-contract call for payment
        // await transferAmountFromContractUsingSDK(user_info.hedera_wallet_id, totalRewardsTinyHbar),
        const response = await distributeToken(campaignDetails?.fungible_token_id, user?.hedera_wallet_id, totalRewardsTinyHbar, contract_id);
        // TODO: update Payment status in db
        if (response == 22) {
          await updatePaymentStatusToManyRecords(
            engagements.map((d) => d.id),
            "PAID"
          ),

            //increment reward bal
            await userService.totalReward(user.id, totalRewardsTinyHbar, "increment"),
            totalRewardsDebited += totalRewardsTinyHbar;

          await incrementClaimAmount(cardId, totalRewardsDebited)
          return "Reward claim successful"
        } else if (response.transactionReceipt.status._code == 184) {
          return "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT"
        }
      }
    }
  } else {
    return "Campaign is not closed"
  }

}


