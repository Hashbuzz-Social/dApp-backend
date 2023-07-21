import { AccountId } from "@hashgraph/sdk";
import { user_balances, user_user, whiteListedTokens } from "@prisma/client";
import hederaService from "@services/hedera-service";

// eslint-disable-next-line @typescript-eslint/ban-types
export const rmKeyFrmData = <T extends Object>(d: T, listOfKey: Array<keyof T>) => {
  listOfKey.forEach((key) => delete d[key]);
  return d;
};

export const sensitizeUserData = (userData: Partial<user_user>) => {
  const accountMatch = hederaService.operatorId.toString() === userData.hedera_wallet_id;
  const adminActive = Boolean(accountMatch && userData.salt && userData.hash);
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
      "personal_twitter_id",
      "accountAddress",
    ]),
    adminActive,
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

export const formatTokenBalancesObject = (token: whiteListedTokens, balance_record?: user_balances) => {
  const { name, token_id, token_symbol, token_type } = token;
  if (balance_record) {
    const decimal = balance_record.entity_decimal;
    const available_balance = parseFloat(((balance_record.entity_balance ?? 0) / Math.pow(10, decimal)).toFixed(4));
    return { name, token_id, token_symbol, token_type, available_balance };
  } else {
    return { name, token_id, token_symbol, token_type, available_balance: 0 };
  }
};

export const fetchAccountIfoKey = async (accountId: string) => {
  const url = "https://testnet.mirrornode.hedera.com/api/v1/accounts/" + accountId;
  const response = await fetch(url);
  const data = await response.json();
  const key: string = data.key.key as string;
  return key;
};

// Function to convert Base64 string to Uint8Array
export const base64ToUint8Array = (base64String: string) => {
  const buffer = Buffer.from(base64String, "base64");
  const uint8Array = new Uint8Array(buffer);
  return uint8Array;
};

// Function to convert Uint8Array to an object
export const uint8ArrayToObject = (uint8Array: Uint8Array) => {
  const buffer = Buffer.from(uint8Array);
  const objectData = {};
  for (let i = 0; i < buffer.length; i++) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    objectData[i] = buffer[i];
  }
  return objectData;
};

// const filterTwitterEngagementsData = () => arr.filter(element => {
//   const isDuplicate = uniqueIds.includes(element.id);

//   if (!isDuplicate) {
//     uniqueIds.push(element.id);

//     return true;
//   }

//   return false;
// });
