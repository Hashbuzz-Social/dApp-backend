import { user_user } from "@prisma/client";
import { AccountId } from "@hashgraph/sdk";

// eslint-disable-next-line @typescript-eslint/ban-types
export const rmKeyFrmData = <T extends Object>(d: T, listOfKey: Array<keyof T>) => {
  listOfKey.forEach((key) => delete d[key]);
  return d;
};

export const sensitizeUserData = (userData: Partial<user_user>) => {
  const emailActive = Boolean(userData.email && userData.salt && userData.hash);
  return {
    ...rmKeyFrmData(userData, [
      "salt",
      "hash",
      "twitter_access_token",
      "business_twitter_access_token",
      "business_twitter_access_token_secret",
      "twitter_access_token_secret",
      "last_login",
      "date_joined",
    ]),
    emailActive,
  };
};

/***
 *@params  campaignerAddresses - Hedera wallet address in format 0.0.024568;
 *@returns campaigner - a string that will used to store the records on smartcontrct machine.
 */
export const buildCampaigner = (campaignerAddresses: string) => {
  const campaigner = "0x" + AccountId.fromString(campaignerAddresses).toSolidityAddress();
  return campaigner;
};

/***
 *@params  campaignerAddresses - Hedera wallet address in format 0.0.024568;
 *@returns campaignAddress - An unique string which will act like id in the smartcontrct for storing balances.
 */
export const buildCampaignAddress = (campaignerAddress: string, campaign_id: string) => {
  const campaigner = buildCampaigner(campaignerAddress);
  const campaignAddress = campaigner + "_" + campaign_id.toString();

  return campaignAddress;
};

export const convertToTinyHbar = (amount: string) => Math.round(parseFloat(amount) * 1e8);
export const convertTinyHbarToHbar = (amount: number) => amount / 1e8;

// const filterTwitterEngagementsData = () => arr.filter(element => {
//   const isDuplicate = uniqueIds.includes(element.id);

//   if (!isDuplicate) {
//     uniqueIds.push(element.id);

//     return true;
//   }

//   return false;
// });

