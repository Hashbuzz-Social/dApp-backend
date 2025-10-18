// Job queue with priority ordering, backed by Redis sorted sets
import { redis } from './redisClient';

export interface CampaignJob {
  id: string;
  type: 'Quest' | 'Awareness';
  tweetId: string;
  tenant: string;
  priority: number;
  scheduledWindow: number; // Unix timestamp (seconds)
}

const queuePrefix = 'queue:window:';

export async function enqueueJob(job: CampaignJob) {
  const key = `${queuePrefix}${job.scheduledWindow}`;
  await redis.zadd(key, job.priority, JSON.stringify(job));
}

export async function dequeueJobs(windowBucket: number, count = 10): Promise<CampaignJob[]> {
  const key = `${queuePrefix}${windowBucket}`;
  const jobs = await redis.zrange(key, 0, count - 1);
  // Remove from queue after fetching
  if (jobs.length > 0) await redis.zrem(key, ...jobs);
  return jobs.map(j => JSON.parse(j));
}

export async function getQueueLength(windowBucket: number): Promise<number> {
  const key = `${queuePrefix}${windowBucket}`;
  return await redis.zcard(key);
}
