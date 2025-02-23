import { user_user } from '@prisma/client';
import twitterClient from '@shared/twitterAPI'; // Your Twitter client wrapper
import { TwitterApi } from 'twitter-api-v2';

export class XTimelineService {
    private twitterClient: TwitterApi | null;
    private user: Partial<user_user>|null   ;

    constructor() {
        this.twitterClient = null;
        this.user = null;
    }

    public async initialize(user: Partial<user_user>) {
        try {
            this.user = user;
            this.twitterClient = await twitterClient.createTwitterBizClient(user);
        } catch (error) {
            console.error('Twitter Client Initialization Error:', error);
            throw new Error('Failed to initialize Twitter client');
        }
    }

    public async getRecentTweets(count: number = 5) {
        if (!this.twitterClient) {
            throw new Error('Twitter client is not initialized');
        }

        try {
            if (!this.user?.business_twitter_handle) {
                throw new Error('User does not have a business Twitter handle');
            }

            const tweets = await this.twitterClient.v2.userTimeline(this.user.business_twitter_handle, {
                max_results: count,
                'tweet.fields': 'id,text', // Fetch necessary fields
                exclude: ['retweets', 'replies'], // Optional: Exclude retweets & replies
            });

            return tweets.data.data.map(tweet => ({
                id: tweet.id, 
                content: tweet.text
            }));
        } catch (error) {
            console.error('Twitter API Error:', error);
            throw new Error('Failed to fetch recent tweets');
        }
    }
}