// Job state tracking in Redis
import { redis } from './redisClient';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export async function setJobStatus(jobId: string, status: JobStatus) {
  await redis.hset(`campaign:${jobId}`, 'status', status);
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  return (await redis.hget(`campaign:${jobId}`, 'status')) as JobStatus | null;
}
