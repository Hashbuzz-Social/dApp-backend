// Exponential backoff with jitter, circuit breaker, dead letter queue, graceful degradation, error logging
import { redis } from './redisClient';

export async function exponentialBackoff(attempt: number, resetMs?: number) {
  const base = 1000 << attempt;
  const jitter = Math.floor(Math.random() * 500);
  const waitMs = resetMs ? Math.max(resetMs - Date.now(), base + jitter) : base + jitter;
  await new Promise(res => setTimeout(res, waitMs));
}

// Circuit breaker state in Redis
export async function setCircuitBreaker(endpoint: string, open: boolean, ttlSec = 900) {
  if (open) {
    await redis.set(`circuit:${endpoint}`, 'open', 'EX', ttlSec);
  } else {
    await redis.del(`circuit:${endpoint}`);
  }
}

export async function isCircuitOpen(endpoint: string): Promise<boolean> {
  return (await redis.get(`circuit:${endpoint}`)) === 'open';
}

// Dead letter queue for failed jobs
export async function addToDeadLetter(job: any) {
  await redis.lpush('dead_letter_queue', JSON.stringify(job));
}

export async function getDeadLetters(count = 10): Promise<any[]> {
  const jobs = await redis.lrange('dead_letter_queue', 0, count - 1);
  return jobs.map(j => JSON.parse(j));
}

// Graceful degradation: stub
export function degradeGracefully(reason: string) {
  // Log and reduce system functionality
  console.warn('Graceful degradation:', reason);
}

// Error logging: stub
export function logError(error: any, context?: string) {
  console.error('Error:', context, error);
}
