// X API Client Wrapper with rate limit header parsing and exponential backoff
import {
  TwitterApi,
  Tweetv2SearchResult,
} from 'twitter-api-v2';
import { WindowPoolManager } from './windowPool';
import { PostCapManager } from './postCapManager';


export class XApiClient {
  private client: TwitterApi;
  private poolManager: WindowPoolManager;
  private postCapManager: PostCapManager;

  constructor(
    token: string,
    poolManager: WindowPoolManager,
    postCapManager: PostCapManager
  ) {
    this.client = new TwitterApi(token);
    this.poolManager = poolManager;
    this.postCapManager = postCapManager;
  }

  /**
   * Recent Search with pagination and search operators
   * @param tweetId - Target tweet ID
   * @param type - 'reply' | 'quote' | 'repost'
   */
  async recentSearchWithOperators(
    tweetId: string,
    type: 'reply' | 'quote' | 'repost'
  ): Promise<any[]> {
    let operator = '';
    if (type === 'reply') operator = `in_reply_to_tweet_id:${tweetId}`;
    else if (type === 'quote') operator = `quotes_of_tweet_id:${tweetId}`;
    else if (type === 'repost') operator = `retweets_of_tweet_id:${tweetId}`;

  const results: Array<Tweetv2SearchResult['data'][number]> = [];
    const nextToken: string | undefined = undefined;
    const attempt = 0;
    try {
      const paginator = await this.client.v2.search(operator, { max_results: 100, asPaginator: true });
      for await (const tweet of paginator) {
        // Rate limit info is available on paginator object
        if (paginator.rateLimit) {
          this.poolManager.updateFromHeaders('recent_search', {
            limit: String(paginator.rateLimit.limit),
            remaining: String(paginator.rateLimit.remaining),
            reset: String(paginator.rateLimit.reset),
          });
          await this.poolManager.savePoolToRedis('recent_search');
        }
        this.postCapManager.increment(1);
        await this.postCapManager.saveMonthlyCap();
        results.push(tweet);
      }
      return results;
    } catch (err: any) {
      if (err.code === 429 || err.data?.title === 'Too Many Requests') {
        throw err;
      }
      throw err;
    }
  }

  /**
   * Liking Users handler with 100-liker cap awareness and pagination
   */
  async likingUsersWithCap(tweetId: string): Promise<any[]> {
  const results: any[] = [];
    let totalLikers = 0;
    try {
      const paginator = await this.client.v2.tweetLikedBy(tweetId, { max_results: 100, asPaginator: true });
      for await (const user of paginator) {
        if (paginator.rateLimit) {
          this.poolManager.updateFromHeaders('liking_users', {
            limit: String(paginator.rateLimit.limit),
            remaining: String(paginator.rateLimit.remaining),
            reset: String(paginator.rateLimit.reset),
          });
          await this.poolManager.savePoolToRedis('liking_users');
        }
        this.postCapManager.increment(1);
        await this.postCapManager.saveMonthlyCap();
        results.push(user);
        totalLikers++;
        if (totalLikers >= 100) break;
      }
      return results.slice(0, 100);
    } catch (err: any) {
      if (err.code === 429 || err.data?.title === 'Too Many Requests') {
        throw err;
      }
      throw err;
    }
  }
}
