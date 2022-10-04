import prisma from "@shared/prisma";
import moment from "moment";
import { TwitterApi } from "twitter-api-v2";

const client = new TwitterApi({ appKey: process.env.TWITTER_API_KEY!, appSecret: process.env.TWITTER_API_SECRET! });

export const twitterAuthUrl = async (callbackUrl: string) => {
  // const authLink = await client.generateAuthLink(CALLBACK_URL);

  // By default, oauth/authenticate are used for auth links, you can change with linkMode
  // property in second parameter to 'authorize' to use oauth/authorize
  const authLink = await client.generateAuthLink(callbackUrl, { linkMode: "authorize" });
  const { url, oauth_callback_confirmed, oauth_token, oauth_token_secret } = authLink;

  await prisma.user_twitterlogintemp.create({
    data: {
      oauth_callback_confirmed: oauth_callback_confirmed === "true" ? true : false,
      oauth_token,
      oauth_token_secret,
      created_at:moment().toISOString()
    },
  });

  return url;
};
