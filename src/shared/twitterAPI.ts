import TwitterApi, { TweetV2, UserV2 , TwitterApiV2Settings } from "twitter-api-v2";
import logger from 'jet-logger';

TwitterApiV2Settings.debug = true;

TwitterApiV2Settings.logger = {
  log: (msg, payload) =>{
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

const token = "AAAAAAAAAAAAAAAAAAAAAGAsaAEAAAAA%2B5iOEMRE9r9mQrrhUmmDCjQ1GA0%3Dl5o8X1STsnuc6LOlecUq3lFeKw9xiVOZUWxfipds21HyxvPB4j";


// Instantiate with desired auth type (here's Bearer v2 auth)
const twitterClient = new TwitterApi(process.env.TWITTER_APP_USER_TOKEN ?? token);
const roClient = twitterClient.readOnly;




/*****
 *@description Get the list of the users with their userId who liked the the user's tweet and list them.
 * @returns Array of UserV2;
 */
const getAllUsersWhoLikedOnTweetId = async (tweetId: string) => {
  const users: UserV2[] = [];

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
const getAllRetweetOfTweetId = async (tweetId: string) => {
  const users: UserV2[] = [];

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
const getAllUsersWhoQuotedOnTweetId = async (tweetId: string) => {
  4;
  const data: TweetV2[] = [];
  const quotes = await roClient.v2.quotes(tweetId, {
    expansions:["author_id"],
    "user.fields":["username"]
  });

  for await (const quote of quotes) {
    data.push({...quote});
  }

  return data;
};

const getEngagementOnCard = async (tweetId: string) => {
  const data = await Promise.all([
    await getAllUsersWhoLikedOnTweetId(tweetId),
    await getAllRetweetOfTweetId(tweetId),
    await getAllUsersWhoQuotedOnTweetId(tweetId),
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

const getPublicMetrics = async (tweetIds: string | string[]) => {
  console.log("Ids:::", tweetIds);

  const result = await roClient.v2.tweets(tweetIds, {
    "user.fields": ["username", "public_metrics", "description", "location"],
    "tweet.fields": ["created_at", "public_metrics", "text"],
    expansions: ["author_id", "referenced_tweets.id"],
  });

  const publicMetrics: PublicMetricsObject = {};

  result.data.forEach((d) => {
    if (d.public_metrics) publicMetrics[d.id] = d.public_metrics;
  });

  return publicMetrics;
};

/****
 * @description Get all users who is commented on the twitter card.
 */

const getAllReplies = async (tweetID: string) => {
  console.log("getAllReplies::start");
  const SearchResults = await twitterClient.v2.search(`conversation_id:${tweetID}`, {
    expansions: ["author_id", "referenced_tweets.id"],
    "user.fields": ["username", "public_metrics", "description", "location"],
    "tweet.fields": ["created_at", "geo", "public_metrics", "text", "conversation_id", "in_reply_to_user_id"],
    max_results: 100,
  });

  const tweets: TweetV2[] = [];

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
  // console.log({accessToken , accessSecret})
  // console.log({apiKey: process.env.TWITTER_API_KEY!, appSecret: process.env.TWITTER_API_SECRET! })

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
  accessToken:process.env.HASHBUZZ_ACCESS_TOKEN!,
  accessSecret:process.env.HASHBUZZ_ACCESS_SECRET!,
});


/****
 *@description Send DM from Hashbuzz to twitter user.
 */
 const sendDMFromHashBuzz =async (recipient_id:string , text:string) =>{
  return await HashbuzzTwitterClient.v1.sendDm({
     recipient_id,
     text,
   })
 }

export default {
  getAllReplies,
  getPublicMetrics,
  getEngagementOnCard,
  twitterClient,
  getAllUsersWhoLikedOnTweetId,
  getAllRetweetOfTweetId,
  getAllUsersWhoQuotedOnTweetId,
  tweeterApiForUser,
  sendDMFromHashBuzz,
  HashbuzzTwitterClient
} as const;
