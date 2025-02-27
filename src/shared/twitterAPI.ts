import logger from 'jet-logger';
import { getConfig } from '@appConfig';
import TwitterApi, {
  TweetV2,
  TwitterApiV2Settings,
  UserV2,
} from 'twitter-api-v2';
import { decrypt } from './encryption';
import createPrismaClient from './prisma';

TwitterApiV2Settings.debug = true;

TwitterApiV2Settings.logger = {
  log: (msg, payload) => {
    logger.info(msg);
    logger.warn(JSON.stringify(payload));
  },
};

// Type definitions
interface PublicMetrics {
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
}

interface PublicMetricsObject {
  [name: string]: PublicMetrics;
}

/*****
 *@description Get the list of the users with their userId who liked the the user's tweet and list them.
 * @returns Array of UserV2;
 */
const getAllUsersWhoLikedOnTweetId = async (
  tweetId: string,
  user_user: any
) => {
  const users: UserV2[] = [];

  const configs = await getConfig();

  const token = decrypt(
    user_user.business_twitter_access_token as string,
    configs.encryptions.encryptionKey
  );
  const secret = decrypt(
    user_user.business_twitter_access_token_secret as string,
    configs.encryptions.encryptionKey
  );

  const twitterClient = new TwitterApi({
    appKey: configs.xApp.xAPIKey,
    appSecret: configs.xApp.xAPISecreate,
    accessToken: token,
    accessSecret: secret,
  });

  const roClient = twitterClient.readOnly;

  const usersRequest = await roClient.v2.tweetLikedBy(tweetId, {
    'user.fields': ['username'],
    asPaginator: true,
  });

  for await (const user of usersRequest) {
    users.push(user);
  }

  return users;
};

/****
 *@description Array of all retweeted data.
 */
const getAllRetweetOfTweetId = async (tweetId: string, user_user: any) => {
  const users: UserV2[] = [];
  const configs = await getConfig();

  const token = decrypt(
    user_user.business_twitter_access_token as string,
    configs.encryptions.encryptionKey
  );
  const secret = decrypt(
    user_user.business_twitter_access_token_secret as string,
    configs.encryptions.encryptionKey
  );

  const twitterClient = new TwitterApi({
    appKey: configs.xApp.xAPIKey,
    appSecret: configs.xApp.xAPISecreate,
    accessToken: token,
    accessSecret: secret,
  });

  const roClient = twitterClient.readOnly;

  const getAllRetweets = await roClient.v2.tweetRetweetedBy(tweetId, {
    'user.fields': ['username'],
    asPaginator: true,
  });
  for await (const user of getAllRetweets) {
    users.push(user);
  }

  return users;
};

/*****
 * @description getAllQuotedUsers
 *
 */
const getAllUsersWhoQuotedOnTweetId = async (
  tweetId: string,
  user_user: any
) => {
  const appConfig = await getConfig();

  const data: TweetV2[] = [];
  const configs = await getConfig();

  const token = decrypt(
    user_user.business_twitter_access_token as string,
    configs.encryptions.encryptionKey
  );
  const secret = decrypt(
    user_user.business_twitter_access_token_secret as string,
    configs.encryptions.encryptionKey
  );

  const twitterClient = new TwitterApi({
    appKey: appConfig.xApp.xAPIKey,
    appSecret: appConfig.xApp.xAPISecreate,
    accessToken: token,
    accessSecret: secret,
  });

  const roClient = twitterClient.readOnly;

  const quotes = await roClient.v2.quotes(tweetId, {
    expansions: ['author_id'],
    'user.fields': ['username'],
  });

  for await (const quote of quotes) {
    data.push({ ...quote });
  }

  return data;
};

const getEngagementOnCard = async (tweetId: string, user_user: any) => {
  const data = await Promise.all([
    await getAllUsersWhoLikedOnTweetId(tweetId, user_user),
    await getAllRetweetOfTweetId(tweetId, user_user),
    await getAllUsersWhoQuotedOnTweetId(tweetId, user_user),
  ]);
  return {
    likes: data[0],
    retweets: data[1],
    quotes: data[2],
  };
};

/***
 * @description  This function will return total count of for a single tweetId or for a array of tweet ids.
 */

const getPublicMetrics = async (tweetIds: string | string[], cardId: any) => {
  const appConfig = await getConfig();
  const prisma = await createPrismaClient();
  const cardDetails = await prisma.campaign_twittercard.findUnique({
    where: {
      id: Number(cardId),
    },
    select: {
      user_user: true,
    },
  });

  if (cardDetails?.user_user) {
    const token = decrypt(
      cardDetails.user_user.business_twitter_access_token as string,
      appConfig.encryptions.encryptionKey
    );
    const secret = decrypt(
      cardDetails.user_user.business_twitter_access_token_secret as string,
      appConfig.encryptions.encryptionKey
    );

    const tweeterApi = new TwitterApi({
      appKey: appConfig.xApp.xAPIKey,
      appSecret: appConfig.xApp.xAPISecreate,
      accessToken: token,
      accessSecret: secret,
    });

    const rwClient = tweeterApi.readOnly;

    const result = await rwClient.v2.tweets(tweetIds, {
      'user.fields': ['username', 'public_metrics', 'description', 'location'],
      'tweet.fields': ['created_at', 'public_metrics', 'text'],
      expansions: ['author_id', 'referenced_tweets.id'],
    });

    if (result.data) {
      const publicMetrics: PublicMetricsObject = {};

      result.data.forEach((d) => {
        // if (d.public_metrics) publicMetrics[d.id] = d.public_metrics;
      });

      return publicMetrics;
    }
  }
};

/****
 * @description Get all users who is commented on the twitter card.
 */

const getAllReplies = async (
  tweetID: string,
  token: string,
  secret: string
) => {
  const config = await getConfig();
  const tToken = decrypt(token, config.encryptions.encryptionKey);
  const tTokenSecret = decrypt(secret, config.encryptions.encryptionKey);

  const client = new TwitterApi({
    appKey: config.xApp.xAPIKey,
    appSecret: config.xApp.xAPISecreate,
    accessToken: tToken,
    accessSecret: tTokenSecret,
  });
  const roClient = client.readOnly;

  const SearchResults = await roClient.v2.search(
    `in_reply_to_tweet_id:${tweetID}`,
    {
      expansions: ['author_id', 'referenced_tweets.id'],
      'user.fields': ['username', 'public_metrics', 'description', 'location'],
      'tweet.fields': [
        'created_at',
        'geo',
        'public_metrics',
        'text',
        'conversation_id',
        'in_reply_to_user_id',
      ],
      max_results: 100,
    }
  );

  const tweets: any[] = [];

  for await (const tweet of SearchResults) {
    tweets.push(tweet);
  }
  return tweets;
};

/*****
 *
 *@description Send Message to tht twitter.
 */

const tweeterApiForUser = async ({
  accessToken,
  accessSecret,
}: {
  accessToken: string;
  accessSecret: string;
}) => {
  const configs = await getConfig();
  const tweeterApi = new TwitterApi({
    appKey: configs.xApp.xAPIKey,
    appSecret: configs.xApp.xAPISecreate,
    accessToken,
    accessSecret,
  });

  return tweeterApi;
};

//!! Hashbuzz account twitter client
const HashbuzzTwitterClient = async () => {
  const configs = await getConfig();
  return tweeterApiForUser({
    accessToken: configs.xApp.xHashbuzzAccAccessToken,
    accessSecret: configs.xApp.xHashbuzzAccSecreateToken,
  });
};

/****
 *@description Send DM from Hashbuzz to twitter user.
 */
const sendDMFromHashBuzz = async (recipient_id: string, text: string) => {
  const hbuuzzClient = await HashbuzzTwitterClient();
  return await hbuuzzClient.v1.sendDm({
    recipient_id,
    text,
  });
};

export default {
  getAllReplies,
  getPublicMetrics,
  getEngagementOnCard,
  getAllUsersWhoLikedOnTweetId,
  getAllRetweetOfTweetId,
  getAllUsersWhoQuotedOnTweetId,
  tweeterApiForUser,
  sendDMFromHashBuzz,
  HashbuzzTwitterClient,
} as const;
