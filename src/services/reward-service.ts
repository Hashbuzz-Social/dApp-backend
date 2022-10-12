import { campaign_tweetengagements, campaign_twittercard } from "@prisma/client";
import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import logger from "jet-logger";
import { groupBy } from "lodash";
import { getCampaignDetailsById, incrementClaimAmount } from "./campaign-service";
import { updatePaymentStatusToManyRecords } from "./engagement-servide";
import { transferAmountFromContractUsingSDK, updateCampaignBalance } from "./transaction-service";
import userService from "./user-service";

const calculateTotalRewards = (card: campaign_twittercard, data: campaign_tweetengagements[]) => {
  const { like_reward, quote_reward, retweet_reward, comment_reward } = card;
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
  return Math.round(total);
};

/****
 *@description Find the users's who  have wallet id's had engaged on the campaign then group and sum rewards.
 */

export const SendRewardsForTheUsersHavingWallet = async (cardId: number | bigint) => {
  console.log("campaignID:::", cardId);
  const engagements = await prisma.campaign_tweetengagements.findMany({
    where: {
      tweet_id: cardId.toString(),
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

  let totalRewardsDebited = 0;
  const { user_user, ...card } = campaignDetails!;
  const groupedData = groupBy(engagements, "user_id");

  if (user_user?.hedera_wallet_id) {
    //!! Loop through each intractor and check if they are an existing user and then reward them.
    await Promise.all(
      Object.keys(groupedData).map(async (personal_twitter_id) => {
        const user_info = await userService.getUserByTwitterId(personal_twitter_id);
        if (user_info?.hedera_wallet_id) {
          const totalRewardsTinyHbar = calculateTotalRewards(card, groupedData[personal_twitter_id]);
          logger.info(`Starting payment for user::${user_info?.hedera_wallet_id} amount:: ${totalRewardsTinyHbar} `);
          await Promise.all([
            //* Smart-contract call for payment
            await transferAmountFromContractUsingSDK(user_info.hedera_wallet_id, totalRewardsTinyHbar),

            // TODO: update Payment status in db
            await updatePaymentStatusToManyRecords(
              groupedData[personal_twitter_id].map((d) => d.id),
              "PAID"
            ),

            //increment reward bal
            await userService.totalReward(user_info.id, totalRewardsTinyHbar , "increment")
          ]);
          totalRewardsDebited += totalRewardsTinyHbar;
        }
      })
    );

    await Promise.all([
      //!!Update Amount claimed in the DB.
      await incrementClaimAmount(cardId, totalRewardsDebited),

      //!!update contract balance for this campaign.
      await updateCampaignBalance({
        campaignerAccount: user_user?.hedera_wallet_id,
        campaignId: cardId.toString(),
        amount: totalRewardsDebited,
      }),
    ]);

    try {
      await twitterAPI.sendDMFromHashBuzz(
        user_user.personal_twitter_id!,
        // eslint-disable-next-line max-len
        `Greetings @${user_user.personal_twitter_handle!}\nThis is for your information only\n————————————\nCampaign: ${card.name!}\nStatus: completed \nRewarded: ${((totalRewardsDebited / Math.round(card.campaign_budget! * 1e8)) * 100).toFixed(2)}% of campaign budget*`
      );
    } catch (error) {
      logger.err(error.message);
    }
  }

  return groupedData;
};

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
          await userService.totalReward(card.owner_id! , totalForCard , "increment");

      }
    }),
  ]);
};
