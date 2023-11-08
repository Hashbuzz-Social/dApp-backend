import TwitterApi, { TweetV2, UserV2, TwitterApiV2Settings } from "twitter-api-v2";
import logger from 'jet-logger';
import { decrypt } from "./encryption";
import prisma from "./prisma";

TwitterApiV2Settings.debug = true;

TwitterApiV2Settings.logger = {
  log: (msg, payload) => {
    logger.err(msg);
    logger.info(payload);
  }
};

//Type definitions
interface PublicMetrics {
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
}

interface PublicMetricsObject {
  [name: string]: PublicMetrics;
}



// Instantiate with desired auth type (here's Bearer v2 auth)
// const twitterClient = new TwitterApi({
//   appKey: process.env.TWITTER_API_KEY!, appSecret: process.env.TWITTER_API_SECRET!,
// });
// const roClient = twitterClient.readOnly;




/*****
 *@description Get the list of the users with their userId who liked the the user's tweet and list them.
 * @returns Array of UserV2;
 */
const getAllUsersWhoLikedOnTweetId = async (tweetId: string, user_user:any) => {
  const users: UserV2[] = [];

  const token = decrypt(user_user.business_twitter_access_token as string);
  const secret = decrypt(user_user.business_twitter_access_token_secret as string);

  const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken:token,
    accessSecret:secret,
  });

  const roClient = twitterClient.readOnly;
  
  const usersRequest = await roClient.v2.tweetLikedBy(tweetId, {
    "user.fields": ["username"],
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
const getAllRetweetOfTweetId = async (tweetId: string, user_user:any) => {
  const users: UserV2[] = [];

  const token = decrypt(user_user.business_twitter_access_token as string);
  const secret = decrypt(user_user.business_twitter_access_token_secret as string);

  const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken:token,
    accessSecret:secret,
  });
  
  const roClient = twitterClient.readOnly;
  
  const getAllRetweets = await roClient.v2.tweetRetweetedBy(tweetId, {
    "user.fields": ["username"],
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
const getAllUsersWhoQuotedOnTweetId = async (tweetId: string, user_user:any) => {
  const data: TweetV2[] = [];

  const token = decrypt(user_user.business_twitter_access_token as string);
  const secret = decrypt(user_user.business_twitter_access_token_secret as string);

  const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken:token,
    accessSecret:secret,
  });
  
  const roClient = twitterClient.readOnly;

  const quotes = await roClient.v2.quotes(tweetId, {
    expansions: ["author_id"],
    "user.fields": ["username"]
  });

  for await (const quote of quotes) {
    data.push({ ...quote });
  }

  return data;
};

const getEngagementOnCard = async (tweetId: string, user_user:any) => {
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

const getPublicMetrics = async (tweetIds: string | string[], cardId: any ) => {
  console.log("Ids:::", tweetIds);

  const cardDetails = await prisma.campaign_twittercard.findUnique({
    where: {
      id: Number(cardId),
    },
    select: {
      user_user:true
    },
  });

  console.log(cardDetails, "Details in side matrics")
  if(cardDetails?.user_user) {
    const token = decrypt(cardDetails.user_user.business_twitter_access_token as string);
    const secret = decrypt(cardDetails.user_user.business_twitter_access_token_secret as string);
    
    // const tweeterData = tweeterApiForUser(token, secret);
    const tweeterApi = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken:token,
      accessSecret:secret,
    });

    const rwClient = tweeterApi.readOnly;

    const result = await rwClient.v2.tweets(tweetIds, {
      "user.fields": ["username", "public_metrics", "description", "location"],
      "tweet.fields": ["created_at", "public_metrics", "text"],
      expansions: ["author_id", "referenced_tweets.id"],
    });
    
    console.log(result.includes?.users, "result of card")
    if(result.data) {
      const publicMetrics: PublicMetricsObject = {};
    
      result.data.forEach((d) => {
        if (d.public_metrics) publicMetrics[d.id] = d.public_metrics;
      });
    
      return publicMetrics;
    }

    // const usersPaginated = await rwClient.v2.tweetRetweetedBy(tweetIds[0], {
    //   asPaginator: true,
    // });
    // console.log(usersPaginated)
  
  }
};

/****
 * @description Get all users who is commented on the twitter card.
 */

const getAllReplies = async (tweetID: string, token: string, secret: string) => {
  console.log("getAllReplies::start", tweetID);

  const tToken = decrypt(token);
  const tTokenSecret = decrypt(secret);

  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!, appSecret: process.env.TWITTER_API_SECRET!, accessToken: tToken, accessSecret: tTokenSecret
  });
  const roClient = client.readOnly;

  const SearchResults = await roClient.v2.search(`in_reply_to_tweet_id:${tweetID}`, {
    expansions: ["author_id", "referenced_tweets.id"],
    "user.fields": ["username", "public_metrics", "description", "location"],
    "tweet.fields": ["created_at", "geo", "public_metrics", "text", "conversation_id", "in_reply_to_user_id"],
    max_results: 100,
  });
  console.log(SearchResults, "searchResults");
  // const SearchResults:any[] = [{username:"YogeshS69872960", }]
  // const tweets: TweetV2[] = [];
  const tweets:any[] = [];

  for await (const tweet of SearchResults) {
    tweets.push(tweet);
  }
  return tweets;
};






/*****
 *
 *@description Send Message to tht twitter.
 */

const tweeterApiForUser = ({ accessToken, accessSecret }: { accessToken: string; accessSecret: string }) => {
  console.log({accessToken , accessSecret})

  const tweeterApi = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken,
    accessSecret,
  });

  return tweeterApi;

};

//!! Hashbuzz account twitter client
const HashbuzzTwitterClient = tweeterApiForUser({
  accessToken: process.env.HASHBUZZ_ACCESS_TOKEN!,
  accessSecret: process.env.HASHBUZZ_ACCESS_SECRET!,
});


/****
 *@description Send DM from Hashbuzz to twitter user.
 */
const sendDMFromHashBuzz = async (recipient_id: string, text: string) => {
  return await HashbuzzTwitterClient.v1.sendDm({
    recipient_id,
    text,
  })
}

export default {
  getAllReplies,
  getPublicMetrics,
  getEngagementOnCard,
  getAllUsersWhoLikedOnTweetId,
  getAllRetweetOfTweetId,
  getAllUsersWhoQuotedOnTweetId,
  tweeterApiForUser,
  sendDMFromHashBuzz,
  HashbuzzTwitterClient
} as const;
