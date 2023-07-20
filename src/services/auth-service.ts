import { decrypt, encrypt } from "@shared/encryption";
import prisma from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import moment from "moment";
import { TwitterApi } from "twitter-api-v2";

const client = new TwitterApi({ appKey: process.env.TWITTER_API_KEY!, appSecret: process.env.TWITTER_API_SECRET! });

export const twitterAuthUrl = async ({ callbackUrl, isBrand, user_id }: { callbackUrl: string; isBrand?: boolean; user_id: bigint | number }) => {
  // By default, oauth/authenticate are used for auth links, you can change with linkMode
  // property in second parameter to 'authorize' to use oauth/authorize
  // console.log(callbackUrl);
  let authLink;
  if (isBrand) authLink = await client.generateAuthLink(callbackUrl, { linkMode: "authorize" });
  else authLink = await client.generateAuthLink(callbackUrl);
  const { url, oauth_callback_confirmed, oauth_token, oauth_token_secret } = authLink;

  await prisma.user_twitterlogintemp.create({
    data: {
      oauth_callback_confirmed: oauth_callback_confirmed === "true" ? true : false,
      oauth_token: encrypt(oauth_token),
      oauth_token_secret: encrypt(oauth_token_secret),
      created_at: moment().toISOString(),
      user_id,
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
  if (!oauth_token || !oauth_verifier || !authtoken?.oauth_token_secret) {
    throw Error("You denied the app or your session expired!");
  }
  const oauth_token_secret = decrypt(authtoken.oauth_token_secret);
  const user_id = authtoken.user_id;
  // Obtain the persistent tokens
  // Create a client from temporary tokens
  const client = twitterAPI.tweeterApiForUser({ accessSecret: oauth_token_secret, accessToken: oauth_token });
  const loginResult = await client.login(oauth_verifier);
  return { loginResult, user_id };
};
