// Post Cap Manager for X API
import { redis } from './redisClient';

export interface PostCapTracker {
  monthlyLimit: number;
  consumed: number;
  dailyBudget: number;
  resetDate: Date;
}

export class PostCapManager {
  private tracker: PostCapTracker;

  constructor(monthlyLimit = 15000, dailyBudget = 500) {
    this.tracker = {
      monthlyLimit,
      consumed: 0,
      dailyBudget,
      resetDate: new Date(),
    };
  }

  increment(count: number) {
    this.tracker.consumed += count;
  }

  getRemaining(): number {
    return this.tracker.monthlyLimit - this.tracker.consumed;
  }

  // Save monthly post cap to Redis
  async saveMonthlyCap() {
    await redis.set(
      'post_cap:monthly',
      JSON.stringify({
        consumed: this.tracker.consumed,
        reset: this.tracker.resetDate.toISOString(),
      })
    );
  }

  // Load monthly post cap from Redis
  async loadMonthlyCap() {
    const data = await redis.get('post_cap:monthly');
    if (!data) return;
    const obj = JSON.parse(data);
    this.tracker.consumed = obj.consumed;
    this.tracker.resetDate = new Date(obj.reset);
  }

  // TODO: Add daily budgeting logic and overflow protection
}
