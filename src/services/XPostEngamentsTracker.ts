import prisma from '@shared/prisma';
import axios from 'axios';
import {CampaignStatus} from "@prisma/client"
import WebSocket from 'ws';

// TweetTracker class to manage real-time tweet tracking and engagement fetching
class TweetTracker {
  private bearerToken: string;
  private tweetIdsToTrack: Map<string, number>;
  private engagedUserIds: { [key: string]: Set<string> };

  constructor(bearerToken: string) {
    this.bearerToken = bearerToken;
    this.tweetIdsToTrack = new Map<string, number>();
    this.engagedUserIds = {};
  }

  // Function to create headers for the request
  private createHeaders() {
    return {
      Authorization: `Bearer ${this.bearerToken}`,
      'Content-Type': 'application/json',
    };
  }

  // Function to fetch active Tweet IDs from Prisma
  private async fetchActiveTweetIds() {
    try {
      const activeTweets = await prisma.campaign_twittercard.findMany({where:{card_status:CampaignStatus.CampaignRunning}});
      activeTweets.forEach((tweet) => {
        if (!this.tweetIdsToTrack.has(tweet.tweet_id!)) {
          this.tweetIdsToTrack.set(tweet.tweet_id!, Date.now());
        }
      });
      console.log('Updated Tweet IDs to track:', Array.from(this.tweetIdsToTrack.keys()));
    } catch (error) {
      console.error('Error fetching active Tweet IDs:', error);
    }
  }

  // Function to get engaged user IDs for a specific tweet
  private async getEngagedUserIds(tweetId: string) {
    try {
      const endpoints = [
        `https://api.twitter.com/2/tweets/${tweetId}/retweeted_by`,
        `https://api.twitter.com/2/tweets/${tweetId}/liking_users`,
        `https://api.twitter.com/2/tweets/${tweetId}/replied_to_by`,
        `https://api.twitter.com/2/tweets/${tweetId}/quoted_by`
      ];

      for (const endpoint of endpoints) {
        const response = await axios.get(endpoint, { headers: this.createHeaders() });
        const users = response.data.data;
        if (users) {
          users.forEach((user: any) => {
            if (!this.engagedUserIds[tweetId]) {
              this.engagedUserIds[tweetId] = new Set();
            }
            this.engagedUserIds[tweetId].add(user.id);
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching engaged user IDs for tweet ${tweetId}:`, error);
    }
  }

  // Set up WebSocket for Twitter API v2 filtered stream
  private async streamTweets() {
    const url = 'https://api.twitter.com/2/tweets/search/stream';

    const ws = new WebSocket(url, {
      headers: this.createHeaders(),
    });

    ws.on('open', () => {
      console.log('WebSocket connection established.');
    });

    ws.on('message', (data) => {
      try {
        const tweet = JSON.parse(data.toString());

        // Check if the tweet contains the hashtag #hashbuzz
        if (tweet.data && tweet.data.text.includes('#hashbuzz')) {
          // Check if the tweet ID is one of the ones you're interested in
          if (this.tweetIdsToTrack.has(tweet.data.id)) {
            console.log('Matching Tweet ID:', tweet.data.id);
            console.log('Tweet Text:', tweet.data.text);
            console.log('Retweets:', tweet.data.public_metrics.retweet_count);
            console.log('Likes:', tweet.data.public_metrics.like_count);
            console.log('Replies:', tweet.data.public_metrics.reply_count);
            console.log('Quotes:', tweet.data.public_metrics.quote_count);

            // Fetch engaged user IDs for this tweet
            this.getEngagedUserIds(tweet.data.id);
          }
        }
      } catch (error) {
        console.error('Error processing tweet:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed.');
    });
  }

  // Expire tweets after a specified duration
  private async expireTweets() {
    const expirationDuration = 15 * 60 * 1000; // 15 minutes

    setInterval(async () => {
      const now = Date.now();
      for (const [tweetId, timestamp] of this.tweetIdsToTrack.entries()) {
        if (now - timestamp > expirationDuration) {
          // Fetch and store engaged user IDs for the expired tweet
          await this.getEngagedUserIds(tweetId);
          console.log(`Engagements for Tweet ID ${tweetId}:`, Array.from(this.engagedUserIds[tweetId] || []));

          // Remove the tweet ID from tracking
          this.tweetIdsToTrack.delete(tweetId);
        }
      }
    }, 60000); // Check every minute
  }

  // Start the tweet tracking process
  public async start() {
    await this.fetchActiveTweetIds();
    this.streamTweets();
    this.expireTweets();
    setInterval(() => this.fetchActiveTweetIds(), 60000); // Fetch latest Tweet IDs every minute
  }
}

// Instantiate and start the TweetTracker
const bearerToken = 'your_bearer_token';
const tweetTracker = new TweetTracker(bearerToken);
tweetTracker.start();
