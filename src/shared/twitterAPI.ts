/* eslint-disable max-len */
import TwitterApi, { TweetSearchRecentV2Paginator, TweetV2 } from "twitter-api-v2";

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

const getAllUsersByEngagement = async (tweetId: string, engagement: "like" | "retweet" | "quote" | "comment") => {
  if (engagement === "like") {
    const users = await roClient.v2.tweetLikedBy(tweetId, {
      "user.fields": ["username"],
      asPaginator: true,
    });
    // return !returnOnlyIds ? users.data.data : users?.data?.data ? users?.data?.data.map((d) => d.id) : [];
    return users.data;
  }
  if (engagement === "retweet") {
    const get_users = await roClient.v2.tweetRetweetedBy(tweetId, {
      "user.fields": ["username"],
    });
    // return !returnOnlyIds ? get_users.data : get_users?.data ? get_users?.data.map((d) => d.id) : [];
    return get_users;
  }
  if (engagement === "quote") {
    const get_users = await roClient.v2.quotes(tweetId, {
      "user.fields": ["username"],
    });
    return get_users.data;
  }
};

const getEngagementOnCard = async (tweetId: string) => {
  const data = await Promise.all([
    await getAllUsersByEngagement(tweetId, "like"),
    await getAllUsersByEngagement(tweetId, "retweet"),
    await getAllUsersByEngagement(tweetId, "quote"),
  ]);
  return {
    like: data[0],
    retweet: data[1],
    quote: data[2],
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

export default {
  getAllReplies,
  getPublicMetrics,
  getEngagementOnCard,
  getAllUsersByEngagement,
  twitterClient,
} as const;
