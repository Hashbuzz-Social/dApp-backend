import { decrypt, encrypt } from "@shared/encryption";
import createPrismaClient from "@shared/prisma";
import twitterAPI from "@shared/twitterAPI";
import moment from "moment";
import { getConfig } from "src/appConfig";
import { TwitterApi } from "twitter-api-v2";


export const twitterAuthUrl = async ({ callbackUrl, isBrand, user_id }: { callbackUrl: string; isBrand?: boolean; user_id: bigint | number }) => {
  // By default, oauth/authenticate are used for auth links, you can change with linkMode
  // property in second parameter to 'authorize' to use oauth/authorize
  // console.log(callbackUrl);
  const prisma = await createPrismaClient();
  const config = await getConfig();
  let authLink;
  const client = new TwitterApi({ appKey: config.xApp.xAPIKey, appSecret: config.xApp.xAPISecreate });

  if (isBrand) authLink = await client.generateAuthLink(callbackUrl, { linkMode: "authorize" });
  else authLink = await client.generateAuthLink(callbackUrl);
  const { url, oauth_callback_confirmed, oauth_token, oauth_token_secret } = authLink;

  await prisma.user_twitterlogintemp.create({
    data: {
      oauth_callback_confirmed: oauth_callback_confirmed === "true" ? true : false,
      oauth_token: oauth_token,
      oauth_token_secret: encrypt(oauth_token_secret, config.encryptions.encryptionKey),
      created_at: moment().toISOString(),
      user_id,
    },
  });

  return url;
};

export const authLogin = async ({ oauth_token, oauth_verifier }: { oauth_verifier: string; oauth_token: string }) => {
  const prisma = await createPrismaClient();
  const config = await getConfig();
  const authtoken = await prisma.user_twitterlogintemp.findFirst({
    where: {
      oauth_token,
    },
  });
  if (!oauth_token || !oauth_verifier || !authtoken?.oauth_token_secret) {
    throw Error("You denied the app or your session expired!");
  }
  const oauth_token_secret = decrypt(authtoken.oauth_token_secret, config.encryptions.encryptionKey);
  const user_id = authtoken.user_id;
  // Obtain the persistent tokens
  // Create a client from temporary tokens
  const client = await twitterAPI.tweeterApiForUser({ accessSecret: oauth_token_secret, accessToken: oauth_token });
  const loginResult = await client.login(oauth_verifier);
  return { loginResult, user_id };
};
