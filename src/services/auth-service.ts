import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import moment from "moment";
import { TwitterApi } from "twitter-api-v2";

const client = new TwitterApi({ appKey: process.env.TWITTER_API_KEY!, appSecret: process.env.TWITTER_API_SECRET! });

export const twitterAuthUrl = async ({callbackUrl , isBrand , business_owner_id}:{callbackUrl: string, isBrand?:boolean , business_owner_id?:bigint|null}) => {
  // By default, oauth/authenticate are used for auth links, you can change with linkMode
  // property in second parameter to 'authorize' to use oauth/authorize
  console.log(callbackUrl);
  let authLink;
  if (isBrand) authLink = await client.generateAuthLink(callbackUrl);
  else authLink = await client.generateAuthLink(callbackUrl, { linkMode: "authorize" });
  const { url, oauth_callback_confirmed, oauth_token, oauth_token_secret } = authLink;

  console.log("Saving Token=::", oauth_token);

  await prisma.user_twitterlogintemp.create({
    data: {
      oauth_callback_confirmed: oauth_callback_confirmed === "true" ? true : false,
      oauth_token,
      oauth_token_secret,
      created_at: moment().toISOString(),
      business_owner_id
    },
  });

  return url;
};

export const authLogin = async ({ oauth_token, oauth_verifier }: { oauth_verifier: string; oauth_token: string }) => {
  const authtoken = await prisma.user_twitterlogintemp.findFirst({
    where: {
      oauth_token,
    },
  });

  const { oauth_token_secret , business_owner_id } = authtoken!;

  console.log("getting oauth_token_secret=::", oauth_token_secret);

  if (!oauth_token || !oauth_verifier || !oauth_token_secret) {
    throw Error("You denied the app or your session expired!");
  }

  // Obtain the persistent tokens
  // Create a client from temporary tokens
  const client = twitterAPI.tweeterApiForUser({ accessSecret: oauth_token_secret, accessToken: oauth_token });
  const loginResult = await client.login(oauth_verifier)
  return {loginResult , business_owner_id};
};
