import prisma from "@shared/prisma";
import  {groupBy} from "lodash"

/****
 *@description Find the users's who  have wallet id's had engaged on the campaign then group and sum rewards.
 */

export const calculateRewardsForTheUsersHavingWallet = async (campaignID:string) => {
  console.log("campaignID:::",campaignID);

  const engagements = await prisma.campaign_tweetengagements.findMany({
    where:{
      tweet_id:campaignID,
    }
  });
  const usersIds = prisma.user_user.findMany({
    where:{
      hedera_wallet_id:{
        not:null
      }
    },
    select:{
      username:true
    }
  })
  const groupedData = groupBy(engagements, "user_id");
  return groupedData;
}