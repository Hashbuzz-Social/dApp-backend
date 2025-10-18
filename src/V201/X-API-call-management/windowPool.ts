
import { redis } from './redisClient';
// Rate Limit Manager for X API endpoints

export interface WindowPool {
  endpoint: string;
  limit: number;
  remaining: number;
  resetTime: Date;
}

export class WindowPoolManager {
  private pools: Record<string, WindowPool> = {};

  constructor() {
    // Initialize pools for each endpoint
    this.pools['recent_search'] = {
      endpoint: 'recent_search',
      limit: 60,
      remaining: 60,
      resetTime: new Date(),
    };
    this.pools['liking_users'] = {
      endpoint: 'liking_users',
      limit: 25,
      remaining: 25,
      resetTime: new Date(),
    };
    // Add more endpoints as needed
  }

  updateFromHeaders(endpoint: string, headers: Record<string, string>) {
    const limit = parseInt(headers['x-rate-limit-limit'] || '0');
    const remaining = parseInt(headers['x-rate-limit-remaining'] || '0');
    const reset = new Date(parseInt(headers['x-rate-limit-reset'] || '0') * 1000);
    this.updatePool(endpoint, limit, remaining, reset);
  }

  updatePool(endpoint: string, limit: number, remaining: number, resetTime: Date) {
    if (this.pools[endpoint]) {
      this.pools[endpoint].limit = limit;
      this.pools[endpoint].remaining = remaining;
      this.pools[endpoint].resetTime = resetTime;
    }
  }

  getPool(endpoint: string): WindowPool | undefined {
    return this.pools[endpoint];
  }

  // Save pool state to Redis with TTL aligned to reset time
  async savePoolToRedis(endpoint: string) {
    const pool = this.pools[endpoint];
    if (!pool) return;
    const ttl = Math.max(1, Math.floor((pool.resetTime.getTime() - Date.now()) / 1000));
    await redis.set(
      `pools:${endpoint}`,
      JSON.stringify({
        limit: pool.limit,
        remaining: pool.remaining,
        reset: Math.floor(pool.resetTime.getTime() / 1000),
      }),
      'EX',
      ttl
    );
  }

  // Load pool state from Redis
  async loadPoolFromRedis(endpoint: string) {
    const data = await redis.get(`pools:${endpoint}`);
    if (!data) return;
    const obj = JSON.parse(data);
    this.pools[endpoint] = {
      endpoint,
      limit: obj.limit,
      remaining: obj.remaining,
      resetTime: new Date(obj.reset * 1000),
    };
  }
}
