import { campaign_tweetengagements, campaign_twittercard } from "@prisma/client";
import prisma from "@shared/prisma";
import { groupBy } from "lodash";
import { updateCampaignBalance, withdrawHbarFromContract } from "./transaction-service";
import userService from "./user-service";
import logger from "jet-logger";
import twitterAPI from "@shared/twitterAPI";
import moment from "moment";
import { getCampaignDetailsById } from "./campaign-service";

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
  return Math.round(total * Math.pow(10, 8));
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
            //Smart-contract call for payment
            await withdrawHbarFromContract(user_info.hedera_wallet_id, totalRewardsTinyHbar),
            //update Payment status in db
            await prisma.campaign_tweetengagements.updateMany({
              where: {
                id: {
                  in: groupedData[personal_twitter_id].map((d) => d.id),
                },
              },
              data: {
                payment_status: "PAID",
              },
            }),
          ]);
          totalRewardsDebited += totalRewardsTinyHbar;
        }
      })
    );

    await Promise.all([
      //!!Update Amount claimed in the DB.
      await prisma.campaign_twittercard.update({
        where: { id: cardId },
        data: {
          amount_claimed: {
            increment: totalRewardsDebited,
          },
        },
      }),

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
        `
      Greetings @${user_user.personal_twitter_handle!}
      This is for your information only\n \n
      ———————————————— \n \n
      Campaign: ${card.name!}\n
      Status: completed \n
      Rewarded: ${((totalRewardsDebited / Math.round(card.campaign_budget! * 1e8)) * 100).toFixed(2)}% of campaign budget*`
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
 */
const totalPendingReward = async (personal_twitter_id: string) => {
  const allUnpaidEngagementsForAnUser = await prisma.campaign_tweetengagements.findMany({
    where: {
      user_id: personal_twitter_id,
      payment_status: "UNPAID",
      exprired_at:{
        gte:moment().toISOString()
      }
    },
  });
  // let totalRewardsDue = 0 
  const groupedData = groupBy(allUnpaidEngagementsForAnUser, "tweet_id");
  
  //calculate Total rewards for each group;
  await Promise.all(Object.keys(groupedData).map(async (d) => {
    const card = await getCampaignDetailsById(parseInt(d));
    if(card && groupedData[d].length > 0){
      const totalForCard = calculateTotalRewards(card ,groupedData[d]);
      console.log(totalForCard)
    }
  }))
  return groupedData;
};
